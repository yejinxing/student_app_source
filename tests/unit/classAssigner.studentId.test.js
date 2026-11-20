const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeDeptCode,
    normalizeLevelCode,
    normalizeMajorCode,
    normalizeSeq,
    validateYear,
    formatStudentId,
    isValidStudentId
} = require('../../src/classAssigner/studentId');

test('规范化院系/层次/专业/序号', () => {
    assert.equal(normalizeDeptCode('1'), '01');
    assert.equal(normalizeDeptCode('09'), '09');
    assert.equal(normalizeDeptCode('100'), null);
    assert.equal(normalizeLevelCode('1'), '1');
    assert.equal(normalizeLevelCode('4'), null);
    assert.equal(normalizeMajorCode('9'), '9');
    assert.equal(normalizeMajorCode('10'), null);
    assert.equal(normalizeSeq(1), '01');
    assert.equal(normalizeSeq(99), '99');
    assert.equal(normalizeSeq(100), null);
});

test('校验入学年份', () => {
    assert.equal(validateYear(2026), '2026');
    assert.equal(validateYear('2027'), '2027');
    assert.equal(validateYear('26'), null);
    assert.equal(validateYear('20260'), null);
});

test('生成 11 位学号', () => {
    assert.equal(formatStudentId({
        year: 2026, levelCode: '1', deptCode: '01', majorCode: '1', classNo: 1, seq: 1
    }), '20261011101');
    assert.equal(formatStudentId({
        year: 2027, levelCode: '2', deptCode: '09', majorCode: '8', classNo: 4, seq: 30
    }), '20272098430');
    assert.equal(isValidStudentId('20261011101'), true);
    assert.equal(isValidStudentId('2026101110'), false);
});

test('非法参数抛错', () => {
    assert.throws(() => formatStudentId({
        year: '26', levelCode: '1', deptCode: '01', majorCode: '1', classNo: 1, seq: 1
    }));
    assert.throws(() => formatStudentId({
        year: 2026, levelCode: '4', deptCode: '01', majorCode: '1', classNo: 1, seq: 1
    }));
});
