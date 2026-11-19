const { ipcMain } = require('electron');
const { setupAutoUpdater } = require('./setup');
const { registerUpdaterEvents } = require('./events');
const { registerCheckerIpc } = require('./checker');
const { registerDownloadIpc } = require('./downloader');
const { registerInstallIpc } = require('./installer');
const { cleanupUpdateCache, getDownloadDir, getAppInstallDir } = require('./cacheCleanup');

setupAutoUpdater();
registerUpdaterEvents();
registerCheckerIpc();
registerDownloadIpc();
registerInstallIpc();

ipcMain.on('cancel-download', () => {
    console.log('取消下载');
    // electron-updater 没有内置取消功能，但可以通过重新检查来重置状态
});

module.exports = { cleanupUpdateCache, getDownloadDir, getAppInstallDir };
