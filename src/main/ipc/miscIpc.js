const path = require('path');
const fs = require('fs-extra');
const { ipcMain, dialog, shell, app } = require('electron');
const { getMainWindow } = require('../window');
const { rootPath } = require('../paths');

function registerMiscIpc() {
    ipcMain.on('open-install-dir', (event) => {
        const exePath = app.getPath('exe');
        const installDir = path.dirname(exePath);
        shell.openPath(installDir);
    });

    ipcMain.on('show-licenses', (event) => {
        const licensePath = app.isPackaged
            ? path.join(process.resourcesPath, 'LICENSE')
            : rootPath('LICENSE');
        if (fs.existsSync(licensePath)) {
            shell.openPath(licensePath);
        } else {
            dialog.showMessageBox(getMainWindow(), {
                type: 'info',
                title: '开源许可',
                message: '开源组件许可证',
                detail: '本应用使用了以下开源组件:\n\n' +
                    '• Electron - MIT License\n' +
                    '• docx - MIT License\n' +
                    '• xlsx - Apache-2.0 License\n' +
                    '• fs-extra - MIT License\n' +
                    '• sharp - Apache-2.0 License\n' +
                    '• axios - MIT License\n\n' +
                    '感谢所有开源贡献者！',
                buttons: ['确定']
            });
        }
    });

    ipcMain.on('get-app-info', (event) => {
        const packageJson = JSON.parse(fs.readFileSync(rootPath('package.json'), 'utf8'));
        event.reply('app-info', {
            version: packageJson.version,
            electronVersion: process.versions.electron,
            installPath: path.dirname(app.getPath('exe'))
        });
    });

    ipcMain.handle('open-file', async (event, filePath) => {
        try {
            const resolved = path.resolve(String(filePath));
            if (!fs.existsSync(resolved)) return false;

            const allowedExtensions = new Set([
                '.docx', '.xlsx', '.xls', '.pdf', '.json', '.txt',
                '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'
            ]);
            if (!allowedExtensions.has(path.extname(resolved).toLowerCase())) {
                return false;
            }

            const error = await shell.openPath(resolved);
            return error === '';
        } catch (e) {
            console.error('打开文件失败:', e);
            return false;
        }
    });

    ipcMain.on('open-external-url', (event, url) => {
        try {
            const parsed = new URL(String(url));
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                return;
            }
            shell.openExternal(parsed.toString());
        } catch (e) {
            console.warn('忽略无效的外部链接:', url);
        }
    });
}

module.exports = { registerMiscIpc };
