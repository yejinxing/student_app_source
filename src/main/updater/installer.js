const path = require('path');
const fs = require('fs-extra');
const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const { getMainWindow } = require('../window');
const { buildVbsScript } = require('./vbs');
const { getDownloadDir } = require('./cacheCleanup');
const { checkExistingDownload } = require('./installerFinder');
const state = require('./state');

function registerInstallIpc() {
    // IPC: 安装更新（退出并安装）
    ipcMain.on('install-update', async (event) => {
        console.log('=== 准备安装更新 ===');
        
        // 通知前端正在安装
        if (getMainWindow()) {
            getMainWindow().webContents.send('update-installing', { percent: 0, status: '正在准备安装...' });
        }
        
        try {
            // 按优先级查找安装包路径
            // 1. 首先检查缓存的安装包路径（跳过下载时使用的）
            // 2. 然后检查 electron-updater 下载的文件
            // 3. 最后在缓存目录中搜索
            
            const version = state.currentUpdateInfo?.version;
            let foundPath = null;
            
            // 1. 检查缓存的路径
            if (state.cachedInstallerPath && fs.existsSync(state.cachedInstallerPath)) {
                console.log('使用缓存的安装包路径:', state.cachedInstallerPath);
                foundPath = state.cachedInstallerPath;
            }
            
            // 2. 检查 electron-updater 的文件
            if (!foundPath) {
                const downloadedFile = autoUpdater.downloadedUpdateHelper?.file;
                if (downloadedFile && fs.existsSync(downloadedFile)) {
                    console.log('使用 electron-updater 下载的文件:', downloadedFile);
                    foundPath = downloadedFile;
                }
            }
            
            // 3. 在缓存目录中搜索
            if (!foundPath && version) {
                const downloadDir = getDownloadDir();
                const existingDownload = checkExistingDownload(version, downloadDir);
                if (existingDownload) {
                    console.log('在缓存目录中找到安装包:', existingDownload.path);
                    foundPath = existingDownload.path;
                }
            }
            
            if (!foundPath || !fs.existsSync(foundPath)) {
                throw new Error('找不到下载的安装包，请重新下载');
            }
            
            state.pendingInstallerPath = foundPath;

            if (process.platform !== 'win32') {
                throw new Error(`当前平台请手动运行安装包: ${state.pendingInstallerPath}`);
            }

            console.log('安装包路径:', state.pendingInstallerPath);
            console.log('文件大小:', (fs.statSync(state.pendingInstallerPath).size / (1024 * 1024)).toFixed(2), 'MB');
            
            const installerDir = path.dirname(state.pendingInstallerPath);
            const installerName = path.basename(state.pendingInstallerPath);
            const currentPid = process.pid;
            const tempDir = app.getPath('temp');
            const userDataDir = app.getPath('userData');
            const newVersion = state.currentUpdateInfo?.version || 'unknown';
            
            // 获取当前应用的安装目录（用于安装后启动）
            const currentExePath = app.getPath('exe');
            const appInstallDir = path.dirname(currentExePath);
            const appExeName = path.basename(currentExePath);
            
            console.log('当前应用路径:', currentExePath);
            console.log('应用安装目录:', appInstallDir);
            console.log('应用可执行文件:', appExeName);
            
            // 创建更新完成标记文件路径（新版本启动时会检测）
            const updateMarkerPath = path.join(userDataDir, 'update-completed.json');
            
            // 日志文件路径（保存到用户数据目录，方便查看）
            const logPath = path.join(userDataDir, 'update-install.log');
            
            // 立即写入初始日志（确认 Node.js 端正常执行）
            const initialLog = `
    ==========================================
    [${new Date().toLocaleString()}] Node.js 准备安装更新
    ==========================================
    userData 目录: ${userDataDir}
    日志文件路径: ${logPath}
    安装包路径: ${state.pendingInstallerPath}
    安装包目录: ${installerDir}
    安装包名称: ${installerName}
    应用安装目录: ${appInstallDir}
    应用可执行文件: ${appExeName}
    当前进程 PID: ${currentPid}
    新版本: ${newVersion}
    临时目录: ${tempDir}
    ==========================================
    `;
            fs.appendFileSync(logPath, initialLog, 'utf8');
            console.log('初始日志已写入:', logPath);
            
            // 使用 VBScript 启动安装程序（支持 Unicode 路径）
            const vbsPath = path.join(tempDir, 'run_installer.vbs');
            
            // VBScript 内容（支持中文路径）
            const vbsContent = buildVbsScript({
                installerPath: state.pendingInstallerPath,
                markerPath: updateMarkerPath,
                logPath,
                pid: currentPid,
                newVersion
            });

            // 使用 UTF-16 LE 编码保存 VBScript（Windows 原生支持）
            const BOM = '\ufeff';
            fs.writeFileSync(vbsPath, BOM + vbsContent, { encoding: 'utf16le' });
            console.log('已创建 VBS 安装脚本:', vbsPath);
            console.log('安装包路径:', state.pendingInstallerPath);
            
            fs.appendFileSync(logPath, `[${new Date().toLocaleString()}] VBS script created: ${vbsPath}\n`, 'utf8');
            fs.appendFileSync(logPath, `[${new Date().toLocaleString()}] Installer path: ${state.pendingInstallerPath}\n`, 'utf8');
            
            // 使用 wscript 运行 VBS 脚本
            const { spawn } = require('child_process');
            
            const proc = spawn('wscript.exe', [vbsPath], {
                detached: true,
                stdio: 'ignore',
                windowsHide: false,
                shell: false
            });
            
            proc.unref();
            
            console.log('VBS 安装脚本已启动');
            
            fs.appendFileSync(logPath, `[${new Date().toLocaleString()}] 安装脚本已启动\n`, 'utf8');
            fs.appendFileSync(logPath, `[${new Date().toLocaleString()}] 准备退出应用...\n`, 'utf8');
            
            console.log('安装脚本已启动，准备退出应用...');
            
            // 给脚本一点时间启动
            setTimeout(() => {
                fs.appendFileSync(logPath, `[${new Date().toLocaleString()}] 应用即将退出 (app.exit(0))\n==========================================\n`, 'utf8');
                console.log('正在退出应用...');
                app.exit(0);
            }, 500);
            
        } catch (err) {
            console.error('安装准备失败:', err);
            if (getMainWindow()) {
                getMainWindow().webContents.send('update-error', `安装失败: ${err.message}`);
            }
        }
    });
}

module.exports = { registerInstallIpc };
