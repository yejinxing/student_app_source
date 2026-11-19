const { test } = require('node:test');
const assert = require('node:assert/strict');

const { escapeVbsString, buildVbsScript } = require('../../src/main/updater/vbs');

test('escapeVbsString 双写引号并移除换行', () => {
    assert.equal(escapeVbsString('C:\\Users\\tester\\app.exe'), 'C:\\Users\\tester\\app.exe');
    assert.equal(escapeVbsString('C:\\a"b.exe'), 'C:\\a""b.exe');
    assert.equal(escapeVbsString('a\r\nb'), 'a b');
});

test('buildVbsScript 嵌入转义后的路径与版本号', () => {
    const script = buildVbsScript({
        installerPath: 'C:\\Temp\\app"1.exe',
        markerPath: 'C:\\Data\\marker.json',
        logPath: 'C:\\Data\\update.log',
        pid: 1234,
        newVersion: '1.0.2'
    });

    assert.match(script, /installerPath = "C:\\Temp\\app""1\.exe"/);
    assert.match(script, /markerPath = "C:\\Data\\marker\.json"/);
    assert.match(script, /targetPid = "1234"/);
    assert.match(script, /newVersion = "1\.0\.2"/);
    assert.match(script, /WshShell\.Run/);
});
