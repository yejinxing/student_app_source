const { mapHeaders, buildOutputLayout } = require('./columns');
const { readWorkbook, writeWorkbook, buildOutputPath } = require('./excel');
const { validateRows } = require('./validation');
const { buildGroups, toGroupSummary } = require('./groups');
const { assignGroup } = require('./assign');
const { formatStudentId, validateYear, toInteger } = require('./studentId');
const { TARGET_COLUMNS } = require('./constants');

function fail(code, message, details, warnings = []) {
    return { ok: false, error: { code, message, details }, warnings };
}

function analyzeWorkbook(filePath) {
    const book = readWorkbook(filePath);
    const headerMap = mapHeaders(book.headerRow);
    if (headerMap.duplicates.length > 0) {
        return fail('HEADER_DUPLICATE', `表头重复：${headerMap.duplicates.join('、')}`);
    }
    if (headerMap.missing.length > 0) {
        return fail('HEADER_MISSING', `缺少必需列：${headerMap.missing.join('、')}`);
    }

    const validation = validateRows(book.dataRows, headerMap, book.headerRowIndex);
    if (validation.errors.length > 0) {
        const first = validation.errors[0];
        return fail(first.code, first.message, validation.errors, validation.warnings);
    }
    if (validation.rows.length === 0) {
        return fail('SHEET_EMPTY', '没有可处理的学生数据', undefined, validation.warnings);
    }

    const groups = buildGroups(validation.rows);
    const noValid = groups.filter(group => !group.options.some(option => option.valid));
    if (noValid.length > 0) {
        return fail(
            'NO_VALID_CLASS_PLAN',
            `以下专业没有可用的班级方案：${noValid.map(group => group.majorName).join('、')}`,
            noValid.map(group => group.key),
            validation.warnings
        );
    }

    const warnings = [...validation.warnings, ...groups.flatMap(group => group.warnings)];
    const sourceCounts = {
        excel: 0,
        'excel-partial': 0,
        'excel-inconsistent': 0,
        'excel-invalid': 0,
        auto: 0
    };
    for (const group of groups) sourceCounts[group.classCountSource] += 1;

    return {
        ok: true,
        data: {
            filePath,
            sheetName: book.sheetName,
            fingerprint: book.fingerprint,
            defaultYear: new Date().getFullYear(),
            groups: groups.map(toGroupSummary),
            summary: {
                totalStudents: validation.rows.length,
                groupCount: groups.length,
                deptCount: new Set(groups.map(group => group.deptCode)).size,
                sourceCounts,
                warningCount: warnings.length,
                dangerCount: groups.filter(group => group.initialPlan && group.initialPlan.level === 'danger').length
            },
            existingTargetColumns: TARGET_COLUMNS.filter(name => headerMap.index[name] !== undefined)
        },
        warnings
    };
}

function generateWorkbook({ filePath, fingerprint, classCounts, year }) {
    if (!fingerprint) {
        return fail('FILE_CHANGED', '缺少文件指纹，请重新解析');
    }
    const book = readWorkbook(filePath);
    if (book.fingerprint !== fingerprint) {
        return fail('FILE_CHANGED', '文件在确认期间发生变化，请重新解析');
    }

    const yearText = validateYear(year);
    if (!yearText) return fail('INVALID_YEAR', '入学年份必须是 4 位数字');

    const headerMap = mapHeaders(book.headerRow);
    if (headerMap.duplicates.length > 0) {
        return fail('HEADER_DUPLICATE', `表头重复：${headerMap.duplicates.join('、')}`);
    }
    if (headerMap.missing.length > 0) {
        return fail('HEADER_MISSING', `缺少必需列：${headerMap.missing.join('、')}`);
    }

    const validation = validateRows(book.dataRows, headerMap, book.headerRowIndex);
    if (validation.errors.length > 0) {
        const first = validation.errors[0];
        return fail(first.code, first.message, validation.errors, validation.warnings);
    }
    if (validation.rows.length === 0) {
        return fail('SHEET_EMPTY', '没有可处理的学生数据', undefined, validation.warnings);
    }

    const groups = buildGroups(validation.rows);
    const overrides = classCounts && typeof classCounts === 'object' && !Array.isArray(classCounts)
        ? classCounts
        : {};

    for (const group of groups) {
        const raw = Object.prototype.hasOwnProperty.call(overrides, group.key)
            ? overrides[group.key]
            : group.initialClassCount;
        const requested = toInteger(raw);
        const option = requested === null
            ? null
            : group.options.find(candidate => candidate.classCount === requested);
        if (!option || !option.valid) {
            const reason = option ? option.reasons.join('；') : '班级数必须是 1–9 的整数';
            return fail('CLASS_COUNT_INVALID', `${group.majorName} 的班级数无效：${reason}`);
        }
        group.finalClassCount = requested;
        group.finalPlan = option;
    }

    const outputItems = [];
    const usedIds = new Set();
    for (const group of groups) {
        const assigned = assignGroup(group.students.slice(), group.finalPlan);
        for (const student of assigned) {
            if (
                student.groupKey !== group.key ||
                student.levelCode !== group.levelCode ||
                student.deptCode !== group.deptCode ||
                student.majorCode !== group.majorCode
            ) {
                return fail('GROUP_KEY_CHANGED', '学生专业归属在分班过程中发生变化');
            }
            const studentId = formatStudentId({
                year: yearText,
                levelCode: group.levelCode,
                deptCode: group.deptCode,
                majorCode: group.majorCode,
                classNo: student.classNo,
                seq: student.seq
            });
            if (usedIds.has(studentId)) {
                return fail('STUDENT_ID_DUPLICATE', `学号重复：${studentId}`);
            }
            usedIds.add(studentId);
            outputItems.push({ student, group, studentId });
        }
    }

    const addNumber = headerMap.index['编号'] === undefined;
    const layout = buildOutputLayout(headerMap, { addNumber });
    const outputRows = outputItems.map(({ student, group, studentId }) => {
        const row = student.originalRow.slice();
        while (row.length < layout.headers.length) row.push('');
        row[layout.index['班级名称']] = `${student.classNo}班`;
        row[layout.index['班号']] = student.classNo;
        row[layout.index['班级数量']] = group.finalClassCount;
        row[layout.index['学号']] = studentId;
        if (addNumber) row[layout.index['编号']] = student.inputIndex + 1;
        return row;
    });

    const outputPath = buildOutputPath(filePath);
    try {
        writeWorkbook(outputPath, book.sheetName, layout.headers, outputRows);
    } catch (error) {
        return fail('OUTPUT_WRITE_FAILED', `写入输出文件失败：${error.message}`);
    }

    const warnings = [...validation.warnings, ...groups.flatMap(group => group.warnings)];
    return {
        ok: true,
        data: {
            outputPath,
            summary: {
                totalStudents: outputRows.length,
                groupCount: groups.length,
                classCount: groups.reduce((sum, group) => sum + group.finalClassCount, 0),
                warningCount: warnings.length
            }
        },
        warnings
    };
}

module.exports = { analyzeWorkbook, generateWorkbook };
