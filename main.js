const { app } = require('electron');
const path = require('path');
const fs = require('fs-extra');

const { createWindow } = require('./src/main/window');
const { loadAppSettings } = require('./src/main/settings');
const { cleanupUpdateCache } = require('./src/main/updater');
const { registerConversionIpc } = require('./src/main/ipc/conversionIpc');
const { registerPhotoRenameIpc } = require('./src/main/ipc/photoRenameIpc');
const { registerSystemSettingsIpc } = require('./src/main/ipc/systemSettingsIpc');
const { registerCacheIpc } = require('./src/main/ipc/cacheIpc');
const { registerMiscIpc } = require('./src/main/ipc/miscIpc');
const { registerTicketAuditIpc } = require('./src/main/ipc/ticketAuditIpc');

let mainWindow;

registerConversionIpc();
registerPhotoRenameIpc();
registerSystemSettingsIpc();
registerCacheIpc();
registerMiscIpc();
registerTicketAuditIpc();

app.whenReady().then(async () => {
    // 应用启动时延迟清理更新缓存
    // 延迟执行，确保安装程序完全退出后再清理（避免文件被占用）
    console.log('应用启动，准备清理更新缓存...');

    // 立即创建窗口（不阻塞）
    mainWindow = createWindow();

    mainWindow.webContents.once('did-finish-load', () => {
        console.log('窗口加载完成，执行备用清理...');
        setTimeout(async () => {
            await cleanupUpdateCache();
        }, 2000);
    });

    // 等待窗口完全加载后再检测更新完成（确保前端已准备好接收消息）
    if (mainWindow) {
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('窗口加载完成，开始检测更新状态...');
            // 延迟一点确保前端 JS 完全初始化
            setTimeout(() => {
                checkUpdateCompleted();
            }, 500);
        });
    }

    // 延迟 3 秒后执行清理（给安装程序时间完全退出）
    setTimeout(async () => {
        console.log('延迟清理：等待安装程序退出后开始清理...');
        await cleanupUpdateCache();
    }, 3000);

    // 也在窗口创建后立即尝试清理（作为快速清理）
    // 如果文件没有被占用，可以立即清理
    setTimeout(async () => {
        console.log('快速清理：尝试立即清理（如果文件未被占用）...');
        await cleanupUpdateCache();
    }, 500);
});

// 检测更新是否刚完成，显示通知
function checkUpdateCompleted() {
    const userDataDir = app.getPath('userData');
    const lastVersionPath = path.join(userDataDir, 'last-version.txt');
    const currentVersion = app.getVersion();

    console.log('========== 更新检测 ==========');
    console.log('userData 目录:', userDataDir);
    console.log('版本文件路径:', lastVersionPath);
    console.log('当前应用版本:', currentVersion);

    let lastVersion = null;

    // 读取上次保存的版本号
    try {
        if (fs.existsSync(lastVersionPath)) {
            lastVersion = fs.readFileSync(lastVersionPath, 'utf8').trim();
            console.log('上次保存的版本:', lastVersion);
        } else {
            console.log('版本文件不存在，这是首次运行');
        }
    } catch (e) {
        console.error('读取版本文件失败:', e.message);
    }

    // 比较版本号
    const needShowNotification = lastVersion && lastVersion !== currentVersion;
    console.log('是否需要显示更新通知:', needShowNotification);

    if (needShowNotification) {
        console.log('检测到版本变化:', lastVersion, '->', currentVersion);

        // 显示更新完成通知
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('update-completed-notification', {
                version: currentVersion,
                previousVersion: lastVersion
            });
            console.log('已发送通知到前端');
        }

        // 显示系统通知
        try {
            const { Notification } = require('electron');
            if (Notification.isSupported()) {
                const notification = new Notification({
                    title: '更新完成',
                    body: `应用已从 v${lastVersion} 更新到 v${currentVersion}`,
                    icon: path.join(__dirname, 'assets', 'icon.png')
                });
                notification.show();
                console.log('已显示系统通知');
            }
        } catch (e) {
            console.error('显示系统通知失败:', e.message);
        }
    }

    // 保存当前版本号（无论是否显示通知都要保存）
    try {
        fs.writeFileSync(lastVersionPath, currentVersion, 'utf8');
        console.log('已保存当前版本号到文件:', currentVersion);
    } catch (e) {
        console.error('保存版本号失败:', e.message);
    }

    console.log('========== 检测完成 ==========');
}

// 窗口关闭处理
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// 应用启动时加载设置
app.on('ready', () => {
    loadAppSettings();
});
