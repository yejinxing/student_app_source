const { test } = require('node:test');
const assert = require('node:assert/strict');

const { compareVersion, formatSize } = require('../../src/main/updater/utils');

test('compareVersion 按语义比较版本号', () => {
    assert.equal(compareVersion('1.0.1', '1.0.0'), 1);
    assert.equal(compareVersion('1.0.0', '1.0.1'), -1);
    assert.equal(compareVersion('1.0.0', 'v1.0.0'), 0);
    assert.equal(compareVersion('1.10.0', '1.9.9'), 1);
    assert.equal(compareVersion('2.0', '2.0.0'), 0);
});

test('formatSize 输出可读文件大小', () => {
    assert.equal(formatSize(0), '未知');
    assert.equal(formatSize(512), '512.0 B');
    assert.equal(formatSize(1024), '1.0 KB');
    assert.equal(formatSize(1024 * 1024), '1.0 MB');
});
