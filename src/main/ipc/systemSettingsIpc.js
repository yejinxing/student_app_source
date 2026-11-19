const fs = require('fs-extra');
const { ipcMain, dialog, app } = require('electron');
const { getMainWindow } = require('../window');
const { saveAppSettings, getSettingsPath, setSettings } = require('../settings');

function registerSystemSettingsIpc() {
    ipcMain.on('save-settings', (event, settings) => {
        saveAppSettings(settings);
    });

    ipcMain.on('set-autostart', (event, enabled) => {
        app.setLoginItemSettings({
            openAtLogin: enabled,
            path: app.getPath('exe')
        });
    });

    ipcMain.on('set-opacity', (event, opacity) => {
        const value = Number(opacity);
        if (!Number.isFinite(value)) return;

        const clamped = Math.min(1, Math.max(0.2, value));
        const mainWindow = getMainWindow();
        if (mainWindow) {
            mainWindow.setOpacity(clamped);
        }
    });

    ipcMain.on('select-default-output-dir', async (event) => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
            properties: ['openDirectory'],
            title: '选择默认输出目录'
        });
        if (!result.canceled) {
            event.reply('selected-default-output-dir', result.filePaths[0]);
        }
    });

    ipcMain.on('export-settings', async (event, settings) => {
        try {
            const result = await dialog.showSaveDialog(getMainWindow(), {
                title: '导出设置',
                defaultPath: 'student_app_settings.json',
                filters: [{ name: 'JSON文件', extensions: ['json'] }]
            });

            if (!result.canceled && result.filePath) {
                await fs.writeFile(result.filePath, JSON.stringify(settings, null, 2), 'utf8');
                event.reply('settings-exported', true, result.filePath);
            }
        } catch (e) {
            console.error('导出设置失败:', e);
            event.reply('settings-exported', false);
        }
    });

    ipcMain.on('import-settings', async (event) => {
        try {
            const result = await dialog.showOpenDialog(getMainWindow(), {
                title: '导入设置',
                filters: [{ name: 'JSON文件', extensions: ['json'] }],
                properties: ['openFile']
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const content = await fs.readFile(result.filePaths[0], 'utf8');
                const settings = JSON.parse(content);
                saveAppSettings(settings);
                event.reply('settings-imported', settings);
            }
        } catch (e) {
            console.error('导入设置失败:', e);
            event.reply('settings-imported', null);
        }
    });

    ipcMain.on('reset-settings', async (event) => {
        try {
            const settingsPath = getSettingsPath();
            if (fs.existsSync(settingsPath)) {
                await fs.remove(settingsPath);
            }
            setSettings({});

            app.setLoginItemSettings({
                openAtLogin: false
            });

            const mainWindow = getMainWindow();
            if (mainWindow) {
                mainWindow.setOpacity(1);
            }
        } catch (e) {
            console.error('重置设置失败:', e);
        }
    });
}

module.exports = { registerSystemSettingsIpc };
