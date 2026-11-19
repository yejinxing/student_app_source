const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const { sanitizeSettings } = require('./settingsSchema');

let appSettings = sanitizeSettings({});

function getSettingsPath() {
    return path.join(app.getPath('userData'), 'settings.json');
}

function loadAppSettings() {
    try {
        const settingsPath = getSettingsPath();
        appSettings = fs.existsSync(settingsPath)
            ? sanitizeSettings(JSON.parse(fs.readFileSync(settingsPath, 'utf8')))
            : sanitizeSettings({});
    } catch (e) {
        console.error('加载设置失败:', e);
        appSettings = sanitizeSettings({});
    }
    return appSettings;
}

function saveAppSettings(settings) {
    try {
        appSettings = sanitizeSettings(settings);
        fs.writeFileSync(getSettingsPath(), JSON.stringify(appSettings, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('保存设置失败:', e);
        return false;
    }
}

function getSettings() {
    return appSettings;
}

function setSettings(settings) {
    appSettings = sanitizeSettings(settings);
}

module.exports = { getSettingsPath, loadAppSettings, saveAppSettings, getSettings, setSettings, sanitizeSettings };
