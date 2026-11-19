const { test } = require('node:test');
const assert = require('node:assert/strict');

const { DEFAULTS, sanitizeSettings } = require('../../src/main/settingsSchema');

test('sanitizeSettings 保留合法设置并丢弃未知字段', () => {
    const settings = sanitizeSettings({
        autostart: true,
        theme: 'dark',
        zoom: '1.25',
        opacity: 80,
        defaultOutputDir: 'C:\\output',
        openFolderAfter: true,
        keepHistory: false,
        unknownKey: 'ignored'
    });

    assert.equal(settings.autostart, true);
    assert.equal(settings.theme, 'dark');
    assert.equal(settings.zoom, '1.25');
    assert.equal(settings.opacity, 80);
    assert.equal(settings.defaultOutputDir, 'C:\\output');
    assert.equal(settings.openFolderAfter, true);
    assert.equal(settings.keepHistory, false);
    assert.equal('unknownKey' in settings, false);
});

test('sanitizeSettings 对非法类型使用默认值', () => {
    const settings = sanitizeSettings({
        autostart: 'false',
        theme: 'neon',
        zoom: 'abc',
        opacity: 'abc',
        defaultOutputDir: 123
    });

    assert.equal(settings.autostart, DEFAULTS.autostart);
    assert.equal(settings.theme, DEFAULTS.theme);
    assert.equal(settings.zoom, DEFAULTS.zoom);
    assert.equal(settings.opacity, DEFAULTS.opacity);
    assert.equal(settings.defaultOutputDir, DEFAULTS.defaultOutputDir);
});

test('sanitizeSettings 限制透明度与缩放范围', () => {
    assert.equal(sanitizeSettings({ opacity: 5 }).opacity, 20);
    assert.equal(sanitizeSettings({ opacity: 500 }).opacity, 100);
    assert.equal(sanitizeSettings({ zoom: '0.1' }).zoom, DEFAULTS.zoom);
    assert.equal(sanitizeSettings({ zoom: '5' }).zoom, DEFAULTS.zoom);
});

test('sanitizeSettings 对非对象输入返回默认值', () => {
    assert.deepEqual(sanitizeSettings(null), DEFAULTS);
    assert.deepEqual(sanitizeSettings([]), DEFAULTS);
    assert.deepEqual(sanitizeSettings('bad'), DEFAULTS);
});
