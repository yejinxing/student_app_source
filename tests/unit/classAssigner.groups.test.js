const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildGroups, toGroupSummary } = require('../../src/classAssigner/groups');

function makeRow(overrides = {}) {
    return {
        groupKey: '1|01|1',
        levelCode: '1',
        levelName: '本科',
        deptCode: '01',
        deptName: '机械工程系',
        majorCode: '1',
        majorName: '机械设计制造及其自动化',
        gender: '男',
        province: '湖北',
        classCountValue: null,
        classCountInvalid: false,
        inputIndex: 0,
        ...overrides
    };
}

function rowsWithCounts(total, classCountValue, overrides = {}) {
    return Array.from({ length: total }, (_, index) => makeRow({
        inputIndex: index,
        classCountValue,
        ...overrides
    }));
}

test('全部为空使用自动建议', () => {
    const groups = buildGroups(rowsWithCounts(72, null));
    assert.equal(groups.length, 1);
    assert.equal(groups[0].classCountSource, 'auto');
    assert.equal(groups[0].initialClassCount, 2);
    assert.deepEqual(groups[0].initialPlan.sizes, [36, 36]);
});

test('全部填写一致使用 Excel 值', () => {
    const groups = buildGroups(rowsWithCounts(82, 2));
    assert.equal(groups[0].classCountSource, 'excel');
    assert.equal(groups[0].initialClassCount, 2);
    assert.equal(groups[0].initialPlan.level, 'warn');
});

test('部分行填写标记为 excel-partial', () => {
    const rows = rowsWithCounts(72, 2);
    rows[0].classCountValue = null;
    const groups = buildGroups(rows);
    assert.equal(groups[0].classCountSource, 'excel-partial');
    assert.ok(groups[0].warnings.some(warning => warning.code === 'CLASS_COUNT_EXCEL_PARTIAL'));
});

test('多个不同值取众数并标记不一致', () => {
    const rows = [
        ...rowsWithCounts(10, 2),
        ...rowsWithCounts(5, 3).map(row => ({ ...row, inputIndex: row.inputIndex + 10 }))
    ];
    const groups = buildGroups(rows);
    assert.equal(groups[0].classCountSource, 'excel-inconsistent');
    assert.equal(groups[0].initialClassCount, 2);
    assert.ok(groups[0].warnings.some(warning => warning.code === 'CLASS_COUNT_EXCEL_INCONSISTENT'));
});

test('无效值改用自动建议并标记', () => {
    const rows = rowsWithCounts(72, null).map((row, index) => ({
        ...row,
        classCountInvalid: index === 0,
        classCountValue: null
    }));
    const groups = buildGroups(rows);
    assert.equal(groups[0].classCountSource, 'excel-invalid');
    assert.equal(groups[0].initialClassCount, 2);
    assert.ok(groups[0].warnings.some(warning => warning.code === 'CLASS_COUNT_EXCEL_INVALID'));
});

test('同专业不同层次拆成两个组', () => {
    const rows = [
        ...rowsWithCounts(50, null),
        ...rowsWithCounts(60, null).map((row, index) => ({
            ...row,
            groupKey: '2|01|1',
            levelCode: '2',
            levelName: '专科',
            inputIndex: 50 + index
        }))
    ];
    const groups = buildGroups(rows);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map(group => group.key), ['1|01|1', '2|01|1']);
});

test('组摘要不包含学生明细', () => {
    const groups = buildGroups(rowsWithCounts(72, null));
    const summary = toGroupSummary(groups[0]);
    assert.equal(summary.studentCount, 72);
    assert.equal(summary.students, undefined);
    assert.ok(Array.isArray(summary.options));
});
