const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    classSizes,
    levelForSizes,
    autoClassCount,
    getPlanOptions
} = require('../../src/classAssigner/classPlan');

test('班级人数公式', () => {
    assert.deepEqual(classSizes(100, 3), [34, 34, 32]);
    assert.deepEqual(classSizes(77, 2), [39, 38]);
    assert.deepEqual(classSizes(5, 5), [1, 1, 1, 1, 1]);
    assert.equal(classSizes(5, 4), null);
    assert.equal(classSizes(0, 1), null);
});

test('提醒等级边界', () => {
    assert.equal(levelForSizes([30, 40]), 'ok');
    assert.equal(levelForSizes([29, 40]), 'warn');
    assert.equal(levelForSizes([28, 40]), 'warn');
    assert.equal(levelForSizes([27, 40]), 'danger');
    assert.equal(levelForSizes([41]), 'warn');
    assert.equal(levelForSizes([42]), 'warn');
    assert.equal(levelForSizes([43]), 'danger');
    assert.equal(levelForSizes([100]), 'invalid');
});

test('自动建议班级数', () => {
    assert.equal(autoClassCount(50).classCount, 2);
    assert.deepEqual(autoClassCount(50).sizes, [25, 25]);
    assert.equal(autoClassCount(82).classCount, 2);
    assert.deepEqual(autoClassCount(82).sizes, [41, 41]);
    assert.equal(autoClassCount(120).classCount, 3);
    assert.deepEqual(autoClassCount(120).sizes, [40, 40, 40]);
    assert.equal(autoClassCount(20).classCount, 1);
    assert.equal(autoClassCount(400).classCount, 9);
    assert.equal(autoClassCount(892), null);
});

test('选项包含无效班级数', () => {
    const options = getPlanOptions(892);
    assert.equal(options.length, 9);
    assert.ok(options.every(option => option.valid === false));
});
