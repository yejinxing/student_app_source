const { LEVEL_NAMES, KNOWN_DEPT_CODES } = require('./constants');
const { getCell } = require('./columns');
const {
    toInteger,
    normalizeDeptCode,
    normalizeLevelCode,
    normalizeMajorCode
} = require('./studentId');

function makeError(code, message, extra = {}) {
    return { code, message, ...extra };
}

function makeWarning(code, message, extra = {}) {
    return { code, message, ...extra };
}

function parseClassCount(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return { value: null, invalid: false, raw: text };
    const value = toInteger(text);
    if (value === null || value < 1 || value > 9) {
        return { value: null, invalid: true, raw: text };
    }
    return { value, invalid: false, raw: text };
}

function isBlankRow(raw) {
    return raw.name === '' && raw.idCard === '' && raw.studentNo === '' &&
        raw.gender === '' && raw.levelNameRaw === '' && String(raw.levelCodeRaw).trim() === '' &&
        raw.province === '' && raw.deptName === '' && String(raw.deptCodeRaw).trim() === '' &&
        raw.majorName === '' && String(raw.majorCodeRaw).trim() === '' &&
        String(raw.classCountRaw).trim() === '';
}

function validateRows(dataRows, headerMap, headerRowIndex) {
    const errors = [];
    const warnings = [];
    const rows = [];
    const studentNoMap = new Map();
    const idCardMap = new Map();

    dataRows.forEach((sourceRow, index) => {
        const rowNumber = headerRowIndex + index + 2;
        const raw = {
            name: String(getCell(sourceRow, headerMap, '姓名')).trim(),
            idCard: String(getCell(sourceRow, headerMap, '身份证号码')).trim(),
            studentNo: String(getCell(sourceRow, headerMap, '考生号')).trim(),
            gender: String(getCell(sourceRow, headerMap, '性别')).trim(),
            levelNameRaw: String(getCell(sourceRow, headerMap, '层次')).trim(),
            levelCodeRaw: getCell(sourceRow, headerMap, '层次代码'),
            province: String(getCell(sourceRow, headerMap, '省份')).trim(),
            deptName: String(getCell(sourceRow, headerMap, '院系名称')).trim(),
            deptCodeRaw: getCell(sourceRow, headerMap, '院系代码'),
            majorName: String(getCell(sourceRow, headerMap, '专业名称')).trim(),
            majorCodeRaw: getCell(sourceRow, headerMap, '专业代码'),
            classCountRaw: getCell(sourceRow, headerMap, '班级数量')
        };
        if (isBlankRow(raw)) return;

        let rowHasError = false;
        const addError = (code, message, field) => {
            errors.push(makeError(code, message, { rowNumber, field }));
            rowHasError = true;
        };

        if (!raw.name) addError('REQUIRED_FIELD_MISSING', '姓名不能为空', '姓名');
        if (!raw.gender) addError('REQUIRED_FIELD_MISSING', '性别不能为空', '性别');
        else if (!['男', '女'].includes(raw.gender)) {
            addError('INVALID_GENDER', `性别必须是男或女：${raw.gender}`, '性别');
        }
        if (!raw.deptName) addError('REQUIRED_FIELD_MISSING', '院系名称不能为空', '院系名称');
        if (!raw.majorName) addError('REQUIRED_FIELD_MISSING', '专业名称不能为空', '专业名称');

        const levelCode = normalizeLevelCode(raw.levelCodeRaw);
        if (!levelCode) addError('INVALID_LEVEL_CODE', `层次代码必须是 1/2/3：${raw.levelCodeRaw}`, '层次代码');
        const deptCode = normalizeDeptCode(raw.deptCodeRaw);
        if (!deptCode) addError('INVALID_DEPT_CODE', `院系代码必须是 1–99：${raw.deptCodeRaw}`, '院系代码');
        const majorCode = normalizeMajorCode(raw.majorCodeRaw);
        if (!majorCode) addError('INVALID_MAJOR_CODE', `专业代码必须是 1–9：${raw.majorCodeRaw}`, '专业代码');

        if (!raw.province) {
            warnings.push(makeWarning('PROVINCE_MISSING', '省份为空，按“未填写省份”参与均衡', { rowNumber }));
            raw.province = '未填写省份';
        }
        if (deptCode && !KNOWN_DEPT_CODES.has(deptCode)) {
            warnings.push(makeWarning('DEPT_CODE_UNKNOWN', `院系代码 ${deptCode} 不在 01–09 范围内，请确认`, { rowNumber }));
        }

        const levelName = raw.levelNameRaw || (levelCode ? LEVEL_NAMES[levelCode] : '');
        if (!raw.levelNameRaw && levelCode) {
            warnings.push(makeWarning('LEVEL_NAME_FALLBACK', '层次名缺失，已按层次代码显示', { rowNumber }));
        }

        const classCount = parseClassCount(raw.classCountRaw);
        if (rowHasError) return;

        const row = {
            rowNumber,
            inputIndex: rows.length,
            name: raw.name,
            idCard: raw.idCard,
            studentNo: raw.studentNo,
            gender: raw.gender,
            levelName,
            levelCode,
            province: raw.province,
            deptName: raw.deptName,
            deptCode,
            majorName: raw.majorName,
            majorCode,
            groupKey: `${levelCode}|${deptCode}|${majorCode}`,
            classCountValue: classCount.value,
            classCountInvalid: classCount.invalid,
            classCountRaw: classCount.raw,
            originalRow: Array.isArray(sourceRow) ? sourceRow.slice() : []
        };
        rows.push(row);

        if (row.studentNo) {
            if (!studentNoMap.has(row.studentNo)) studentNoMap.set(row.studentNo, []);
            studentNoMap.get(row.studentNo).push(rowNumber);
        }
        if (row.idCard) {
            if (!idCardMap.has(row.idCard)) idCardMap.set(row.idCard, []);
            idCardMap.get(row.idCard).push(rowNumber);
        }
    });

    for (const [value, rowNumbers] of studentNoMap) {
        if (rowNumbers.length > 1) {
            errors.push(makeError('DUPLICATE_STUDENT_NO', `考生号重复：${value}`, { value, rowNumbers }));
        }
    }
    for (const [value, rowNumbers] of idCardMap) {
        if (rowNumbers.length > 1) {
            errors.push(makeError('DUPLICATE_ID_CARD', `身份证号重复：${value}`, { value, rowNumbers }));
        }
    }

    const groupMap = new Map();
    for (const row of rows) {
        if (!groupMap.has(row.groupKey)) groupMap.set(row.groupKey, []);
        groupMap.get(row.groupKey).push(row);
    }
    for (const [groupKey, groupRows] of groupMap) {
        for (const field of ['levelName', 'deptName', 'majorName']) {
            const values = [...new Set(groupRows.map(row => row[field]))];
            if (values.length > 1) {
                errors.push(makeError(
                    'GROUP_NAME_CONFLICT',
                    `同一专业组的${field}不一致：${values.join('、')}`,
                    { groupKey, field, values }
                ));
            }
        }
    }

    return { errors, warnings, rows };
}

module.exports = { validateRows, parseClassCount };
