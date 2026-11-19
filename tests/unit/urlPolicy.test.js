const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isAllowedExternalUrl } = require('../../src/main/urlPolicy');

test('isAllowedExternalUrl 只允许 GitHub/Gitee 的 http(s) 链接', () => {
    assert.equal(isAllowedExternalUrl('https://github.com/yejinxing/student_app_source'), true);
    assert.equal(isAllowedExternalUrl('https://gitee.com/yejinxing/student_app_source'), true);
    assert.equal(isAllowedExternalUrl('http://github.com/example'), true);
});

test('isAllowedExternalUrl 拒绝其他协议、域名与非法 URL', () => {
    assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
    assert.equal(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe'), false);
    assert.equal(isAllowedExternalUrl('https://example.com'), false);
    assert.equal(isAllowedExternalUrl('https://github.com.evil.example'), false);
    assert.equal(isAllowedExternalUrl('not a url'), false);
    assert.equal(isAllowedExternalUrl(null), false);
});
