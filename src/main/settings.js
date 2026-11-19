const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');

let appSettings = {};

function getSettingsPath() {
    return path.join(app.getPath('userData'), 'settings.json');
}

function loadAppSettings() {
    try {
        const settingsPath = getSettingsPath();
        if (fs.existsSync(settingsPath)) {
            appSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
    } catch (e) {
        console.error('加载设置失败:', e);
        appSettings = {};
    }
    return appSettings;
}

function sanitizeSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return {};
    }

    const sanitized = { ...settings };
    if (sanitized.opacity !== undefined) {
        const opacity = Number(sanitized.opacity);
        sanitized.opacity = Number.isFinite(opacity) ? Math.min(100, Math.max(20, opacity)) : 100;
    }
    return sanitized;
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
    appSettings = settings;
}

module.exports = { getSettingsPath, loadAppSettings, saveAppSettings, getSettings, setSettings, sanitizeSettings };
