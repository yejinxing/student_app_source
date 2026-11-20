const { test } = require('node:test');
const assert = require('node:assert/strict');

const { mapHeaders } = require('../../src/classAssigner/columns');
const { validateRows } = require('../../src/classAssigner/validation');

const HEADERS = [
    '姓名', '身份证号码', '考生号', '性别', '层次', '层次代码',
    '省份', '院系名称', '院系代码', '专业名称', '专业代码', '班级数量'
];

function makeRow(overrides = {}) {
    return [
        overrides.name ?? '张三',
        overrides.idCard ?? '110101200001010011',
        overrides.studentNo ?? '26140902513865',
        overrides.gender ?? '男',
        overrides.levelName ?? '本科',
        overrides.levelCode ?? '1',
        overrides.province ?? '湖北',
        overrides.deptName ?? '机械工程系',
        overrides.deptCode ?? '01',
        overrides.majorName ?? '机械设计制造及其自动化',
        overrides.majorCode ?? '1',
        overrides.classCount ?? '2'
    ];
}

test('校验通过并生成规范行', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([makeRow()], headerMap, 0);
    assert.deepEqual(result.errors, []);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].groupKey, '1|01|1');
    assert.equal(result.rows[0].deptCode, '01');
    assert.equal(result.rows[0].classCountValue, 2);
    assert.equal(result.rows[0].rowNumber, 2);
});

test('必填、性别、代码错误', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([
        makeRow({ name: '' }),
        makeRow({ gender: '未知', studentNo: 'A2', idCard: 'ID2' }),
        makeRow({ levelCode: '4', studentNo: 'A3', idCard: 'ID3' }),
        makeRow({ deptCode: '100', studentNo: 'A4', idCard: 'ID4' }),
        makeRow({ majorCode: '10', studentNo: 'A5', idCard: 'ID5' })
    ], headerMap, 0);

    const codes = result.errors.map(error => error.code);
    assert.ok(codes.includes('REQUIRED_FIELD_MISSING'));
    assert.ok(codes.includes('INVALID_GENDER'));
    assert.ok(codes.includes('INVALID_LEVEL_CODE'));
    assert.ok(codes.includes('INVALID_DEPT_CODE'));
    assert.ok(codes.includes('INVALID_MAJOR_CODE'));
});

test('省份缺失给警告并按未填写省份分组', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([makeRow({ province: '' })], headerMap, 0);
    assert.equal(result.rows[0].province, '未填写省份');
    assert.ok(result.warnings.some(warning => warning.code === 'PROVINCE_MISSING'));
});

test('重复考生号和身份证号报错', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([
        makeRow({ studentNo: 'S1', idCard: 'I1' }),
        makeRow({ studentNo: 'S1', idCard: 'I1', name: '李四' })
    ], headerMap, 0);
    const codes = result.errors.map(error => error.code);
    assert.ok(codes.includes('DUPLICATE_STUDENT_NO'));
    assert.ok(codes.includes('DUPLICATE_ID_CARD'));
});

test('同组名称冲突报错', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([
        makeRow(),
        makeRow({ name: '李四', studentNo: 'S2', idCard: 'I2', majorName: '另一个专业' })
    ], headerMap, 0);
    assert.ok(result.errors.some(error => error.code === 'GROUP_NAME_CONFLICT'));
});

test('无效班级数量标记为 classCountInvalid', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([makeRow({ classCount: 'abc' })], headerMap, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows[0].classCountValue, null);
    assert.equal(result.rows[0].classCountInvalid, true);
});

test('空白行忽略', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([new Array(HEADERS.length).fill('')], headerMap, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows.length, 0);
});
