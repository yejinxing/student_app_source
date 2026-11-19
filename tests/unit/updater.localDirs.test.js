const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { getLocalUpdaterDirs } = require('../../src/main/updater/localDirs');

test('Windows 使用 LOCALAPPDATA 生成 pending 与 updater 目录', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' };
    const dirs = getLocalUpdaterDirs({ appName: 'student_app', platform: 'win32', env });

    assert.equal(dirs.localPendingDir, path.join(env.LOCALAPPDATA, 'student_app', 'pending'));
    assert.equal(dirs.localUpdaterCacheDir, path.join(env.LOCALAPPDATA, 'student_app-updater'));
});

test('Windows 缺少 LOCALAPPDATA 时回退 USERPROFILE', () => {
    const env = { USERPROFILE: 'C:\\Users\\tester' };
    const dirs = getLocalUpdaterDirs({ appName: 'student_app', platform: 'win32', env });

    assert.equal(dirs.localPendingDir, path.join(env.USERPROFILE, 'AppData', 'Local', 'student_app', 'pending'));
    assert.equal(dirs.localUpdaterCacheDir, path.join(env.USERPROFILE, 'AppData', 'Local', 'student_app-updater'));
});

test('非 Windows 平台返回 null', () => {
    const dirs = getLocalUpdaterDirs({ appName: 'student_app', platform: 'darwin', env: {} });
    assert.equal(dirs.localPendingDir, null);
    assert.equal(dirs.localUpdaterCacheDir, null);
});
