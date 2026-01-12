const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { convertExcelToWord } = require('./src/converter');
const fs = require('fs-extra');
const PhotoRenamer = require('./src/photoRenamer');
const xlsx = require('xlsx');
const { autoUpdater } = require('electron-updater');
const https = require('https');
const http = require('http');

let mainWindow;
let appSettings = {};

// 设置文件路径
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// 加载设置
function loadAppSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            appSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
    } catch (e) {
        console.error('加载设置失败:', e);
        appSettings = {};
    }
    return appSettings;
}

// 保存设置
function saveAppSettings(settings) {
    try {
        appSettings = settings;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('保存设置失败:', e);
        return false;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        title: "学生信息处理工具",
        icon: path.join(__dirname, 'assets', 'icon.png'),
        autoHideMenuBar: true
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    // 应用启动时清理更新缓存
    cleanupUpdateCache();
    createWindow();
});

ipcMain.on('select-file', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
    });
    if (!result.canceled) {
        event.reply('selected-file', result.filePaths[0]);
    }
});

ipcMain.on('start-conversion', async (event, { excelPath }) => {
    try {
        // 格式化时间戳为YYYYMMDD_HHMMSS格式
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
        
        const outputPath = path.join(path.dirname(excelPath), `新生名册_${timestamp}.docx`);
        await convertExcelToWord(excelPath, outputPath);
        event.reply('conversion-success', outputPath);
    } catch (error) {
        event.reply('conversion-error', error.message);
    }
});

// ===== 自动更新功能 (使用 electron-updater) =====

// 仓库信息
const REPO_OWNER = 'yejinxing';
const REPO_NAME = 'student_app_source';
const GITEE_OWNER = 'yejinxing';
const GITEE_REPO = 'student_app_source';

// GitHub 镜像加速列表（按优先级排序）
const GITHUB_MIRRORS = [
    { name: 'ghproxy', prefix: 'https://mirror.ghproxy.com/' },
    { name: 'ghproxy.net', prefix: 'https://ghproxy.net/' },
    { name: 'gh-proxy', prefix: 'https://gh-proxy.com/' },
    { name: '直连', prefix: '' }
];

// 配置 autoUpdater - 从 Gitee 获取元数据，从 GitHub 镜像下载安装包
autoUpdater.autoDownload = false; // 不自动下载，等用户确认
autoUpdater.autoInstallOnAppQuit = false; // 不在退出时自动安装，我们手动控制

// 动态获取最新版本的 latest.yml
// 由于 Gitee 没有 latest 标签，我们需要先获取最新版本号
async function getLatestVersionFromGitee() {
    try {
        const https = require('https');
        return new Promise((resolve, reject) => {
            const options = {
                headers: { 'User-Agent': 'StudentApp/' + app.getVersion() },
                timeout: 10000
            };
            
            https.get(`https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/releases/latest`, options, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const release = JSON.parse(data);
                        resolve(release.tag_name);
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject).on('timeout', () => {
                reject(new Error('请求超时'));
            });
        });
    } catch (e) {
        console.error('获取 Gitee 最新版本失败:', e);
        return null;
    }
}

// 配置更新源：从 Gitee 获取 latest.yml（元数据文件小，国内访问快）
// 注意：feedUrl 会在检查更新时动态设置
const platform = process.platform;

// 初始化时设置一个默认的 feedUrl（会在检查更新时更新）
let feedUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/latest/latest.yml`;

if (platform === 'darwin') {
    feedUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/latest/latest-mac.yml`;
} else if (platform === 'linux') {
    feedUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/latest/latest-linux.yml`;
}

// 设置更新源（使用 Gitee）
autoUpdater.setFeedURL({
    provider: 'generic',
    url: feedUrl
});

console.log('[AutoUpdater] 更新源配置:');
console.log('  - 元数据: Gitee (动态获取最新版本)');
console.log('  - 安装包: GitHub (latest.yml 中的 URL，支持镜像加速)');

// 开发模式下也允许检查更新（用于测试）
if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
    console.log('[AutoUpdater] 开发模式：已启用更新检查');
}

// 配置日志
autoUpdater.logger = {
    info: (msg) => console.log('[AutoUpdater]', msg),
    warn: (msg) => console.warn('[AutoUpdater]', msg),
    error: (msg) => console.error('[AutoUpdater]', msg),
    debug: (msg) => console.log('[AutoUpdater Debug]', msg)
};

// 存储更新信息
let updateInfo = null;

// 格式化文件大小
function formatSize(bytes) {
    if (!bytes) return '未知';
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return size.toFixed(1) + ' ' + units[unitIndex];
}

// 获取平台名称
function getPlatformName() {
    switch (process.platform) {
        case 'win32': return 'Windows';
        case 'darwin': return `macOS (${process.arch})`;
        case 'linux': return 'Linux';
        default: return '未知平台';
    }
}

// 清理更新缓存目录
function cleanupUpdateCache() {
    try {
        // electron-updater 的下载缓存目录
        const updateCacheDir = path.join(app.getPath('userData'), 'pending');
        if (fs.existsSync(updateCacheDir)) {
            fs.removeSync(updateCacheDir);
            console.log('已清理更新缓存目录:', updateCacheDir);
        }
        
        // 清理可能存在的旧安装包（兼容旧版本）
        const resourcesDir = app.isPackaged 
            ? path.join(path.dirname(app.getPath('exe')), 'resources')
            : app.getPath('temp');
            
        if (fs.existsSync(resourcesDir)) {
            const files = fs.readdirSync(resourcesDir);
            files.forEach(file => {
                if (file.match(/\.(exe|dmg|AppImage|deb|rpm)$/i) && file.includes('StudentInfoTool')) {
                    const filePath = path.join(resourcesDir, file);
                    try {
                        fs.unlinkSync(filePath);
                        console.log('已清理旧安装包:', filePath);
                    } catch (e) {
                        console.log('清理文件失败:', filePath, e.message);
                    }
                }
            });
        }
    } catch (e) {
        console.log('清理更新缓存时出错:', e.message);
    }
}

// autoUpdater 事件监听
autoUpdater.on('checking-for-update', () => {
    console.log('正在检查更新...');
});

autoUpdater.on('update-available', (info) => {
    console.log('发现新版本:', info.version);
    updateInfo = info;
    currentUpdateInfo = info; // 保存更新信息用于自定义下载
    
    // 修改下载 URL 为 GitHub 镜像（如果 URL 指向 GitHub）
    if (info.files && info.files.length > 0) {
        info.files.forEach(file => {
            if (file.url && file.url.includes('github.com')) {
                // 保存原始 URL，下载时会使用镜像
                file.originalUrl = file.url;
                console.log('检测到 GitHub URL，将在下载时使用镜像:', file.url);
            }
        });
    }
    
    if (mainWindow) {
        mainWindow.webContents.send('update-available', {
            currentVersion: app.getVersion(),
            version: info.version,
            releaseDate: info.releaseDate ? info.releaseDate.split('T')[0] : '未知',
            releaseNotes: info.releaseNotes || '暂无更新说明',
            size: formatSize(info.files?.[0]?.size),
            platform: getPlatformName()
        });
    }
});

autoUpdater.on('update-not-available', (info) => {
    console.log('当前已是最新版本');
    if (mainWindow) {
        mainWindow.webContents.send('update-not-available', {
            currentVersion: app.getVersion()
        });
    }
});

autoUpdater.on('download-progress', (progressObj) => {
    const speed = formatSize(progressObj.bytesPerSecond) + '/s';
    const percent = Math.round(progressObj.percent * 10) / 10;
    const transferred = formatSize(progressObj.transferred);
    const total = formatSize(progressObj.total);
    
    console.log(`下载进度: ${percent}% - ${transferred}/${total} - ${speed}`);
    
    if (mainWindow) {
        mainWindow.webContents.send('update-progress', {
            percent: percent,
            downloaded: transferred,
            total: total,
            speed: speed,
            remaining: progressObj.bytesPerSecond > 0 
                ? Math.round((progressObj.total - progressObj.transferred) / progressObj.bytesPerSecond) + '秒'
                : '计算中...'
        });
    }
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('更新下载完成:', info.version);
    if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', {
            version: info.version
        });
    }
});

autoUpdater.on('error', (err) => {
    console.error('更新出错:', err);
    if (mainWindow) {
        mainWindow.webContents.send('update-error', err.message || '更新失败，请稍后重试');
    }
});

// IPC: 检查更新
ipcMain.on('check-for-updates', async (event) => {
    console.log('开始检查更新...');
    try {
        // 先从 Gitee 获取最新版本号，然后设置正确的 feedUrl
        const latestVersion = await getLatestVersionFromGitee();
        
        if (latestVersion) {
            // 构造最新版本的 latest.yml URL
            let latestFeedUrl;
            if (platform === 'win32') {
                latestFeedUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/${latestVersion}/latest.yml`;
            } else if (platform === 'darwin') {
                latestFeedUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/${latestVersion}/latest-mac.yml`;
            } else {
                latestFeedUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/${latestVersion}/latest-linux.yml`;
            }
            
            // 更新 feedUrl
            autoUpdater.setFeedURL({
                provider: 'generic',
                url: latestFeedUrl
            });
            
            console.log('使用 Gitee feedUrl:', latestFeedUrl);
        } else {
            console.log('无法获取 Gitee 最新版本，使用默认 feedUrl');
        }
        
        // 检查更新
        await autoUpdater.checkForUpdates();
    } catch (error) {
        console.error('检查更新失败:', error);
        event.reply('update-error', `检查更新失败: ${error.message}`);
    }
});

// 存储当前更新信息（用于自定义下载）
let currentUpdateInfo = null;

// IPC: 开始下载更新
// 注意：electron-updater 会使用 latest.yml 中的 URL 下载
// latest.yml 从 Gitee 获取，但其中的安装包 URL 应该指向 GitHub
// 我们通过修改 latest.yml 的 feed URL 来实现从 Gitee 获取元数据
ipcMain.on('download-update', async (event) => {
    console.log('开始下载更新...');
    console.log('说明：latest.yml 从 Gitee 获取，安装包从 GitHub 下载（latest.yml 中的 URL）');
    
    try {
        event.reply('update-downloading');
        // electron-updater 会自动使用 latest.yml 中的 URL 下载安装包
        // 如果 latest.yml 中的 URL 指向 GitHub，下载就会从 GitHub 进行
        // 如果需要使用镜像，需要在构建时修改 latest.yml 中的 URL
        await autoUpdater.downloadUpdate();
    } catch (error) {
        console.error('下载更新失败:', error);
        event.reply('update-error', `下载失败: ${error.message}`);
    }
});

// IPC: 安装更新（退出并安装）
ipcMain.on('install-update', (event) => {
    console.log('准备安装更新...');
    
    // 注意：不要在这里清理缓存，因为 electron-updater 需要 pending 目录中的文件来安装
    // electron-updater 安装完成后会自动清理
    
    // 退出并安装
    // setImmediate 确保在下一个事件循环中执行，让前端有时间响应
    setImmediate(() => {
        // isSilent=true: 静默安装（Windows 使用 /S 参数）
        // isForceRunAfter=true: 安装后自动启动应用
        autoUpdater.quitAndInstall(true, true);
    });
});

// IPC: 取消下载
ipcMain.on('cancel-download', () => {
    console.log('取消下载');
    // electron-updater 没有内置取消功能，但可以通过重新检查来重置状态
});

// 照片重命名功能相关的 IPC 通信

ipcMain.on('select-photo-folder', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!result.canceled) {
        event.reply('selected-photo-folder', result.filePaths[0]);
    }
});

ipcMain.on('select-photo-excel-file', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
    });
    if (!result.canceled) {
        event.reply('selected-photo-excel-file', result.filePaths[0]);
    }
});

ipcMain.on('select-photo-output-folder', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!result.canceled) {
        event.reply('selected-photo-output-folder', result.filePaths[0]);
    }
});

ipcMain.on('get-excel-columns', async (event, excelPath) => {
    try {
        const workbook = xlsx.readFile(excelPath);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
        if (jsonData.length > 0) {
            const columns = jsonData[0];
            event.reply('excel-columns', columns);
        } else {
            event.reply('excel-columns', []);
        }
    } catch (error) {
        event.reply('renaming-status', `读取Excel列名失败: ${error.message}`);
        event.reply('excel-columns', []);
    }
});

ipcMain.on('start-renaming', async (event, options) => {
    const { photoDir, excelPath, outputDir, outputExt, inputField, outputField } = options;
    
    try {
        const renamer = new PhotoRenamer({
            photoDir,
            excelPath,
            outputDir,
            outputExt,
            inputField,
            outputField
        });
        
        renamer.setStatusCallback((message) => {
            event.reply('renaming-status', message);
        });
        
        renamer.setProgressCallback((progress) => {
            event.reply('renaming-progress', progress);
        });
        
        renamer.setFinishCallback((success) => {
            event.reply('renaming-finished', success);
        });
        
        await renamer.run();
    } catch (error) {
        event.reply('renaming-status', `处理出错: ${error.message}`);
        event.reply('renaming-finished', false);
    }
});

ipcMain.on('stop-renaming', (event) => {
    // 这里可以添加停止处理的逻辑
    event.reply('renaming-status', '操作已停止');
    event.reply('renaming-finished', false);
});

// ===== 系统设置相关 IPC 处理 =====

// 保存设置
ipcMain.on('save-settings', (event, settings) => {
    saveAppSettings(settings);
});

// 设置开机自启动
ipcMain.on('set-autostart', (event, enabled) => {
    app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe')
    });
});

// 设置窗口透明度
ipcMain.on('set-opacity', (event, opacity) => {
    if (mainWindow) {
        mainWindow.setOpacity(opacity);
    }
});

// 选择默认输出目录
ipcMain.on('select-default-output-dir', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '选择默认输出目录'
    });
    if (!result.canceled) {
        event.reply('selected-default-output-dir', result.filePaths[0]);
    }
});

// 清理缓存
ipcMain.on('clear-cache', async (event) => {
    try {
        const cachePath = app.getPath('userData');
        const cacheDir = path.join(cachePath, 'Cache');
        const gpuCacheDir = path.join(cachePath, 'GPUCache');
        
        if (fs.existsSync(cacheDir)) {
            await fs.remove(cacheDir);
        }
        if (fs.existsSync(gpuCacheDir)) {
            await fs.remove(gpuCacheDir);
        }
        
        event.reply('cache-cleared', true);
    } catch (e) {
        console.error('清理缓存失败:', e);
        event.reply('cache-cleared', false);
    }
});

// 获取缓存大小
ipcMain.on('get-cache-size', async (event) => {
    try {
        const cachePath = app.getPath('userData');
        let totalSize = 0;
        
        const getDirSize = async (dirPath) => {
            if (!fs.existsSync(dirPath)) return 0;
            let size = 0;
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stat = await fs.stat(filePath);
                if (stat.isDirectory()) {
                    size += await getDirSize(filePath);
                } else {
                    size += stat.size;
                }
            }
            return size;
        };
        
        const cacheDir = path.join(cachePath, 'Cache');
        const gpuCacheDir = path.join(cachePath, 'GPUCache');
        
        totalSize += await getDirSize(cacheDir);
        totalSize += await getDirSize(gpuCacheDir);
        
        // 格式化大小
        let sizeStr;
        if (totalSize < 1024) {
            sizeStr = `${totalSize} B`;
        } else if (totalSize < 1024 * 1024) {
            sizeStr = `${(totalSize / 1024).toFixed(2)} KB`;
        } else if (totalSize < 1024 * 1024 * 1024) {
            sizeStr = `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
        } else {
            sizeStr = `${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
        
        event.reply('cache-size', sizeStr);
    } catch (e) {
        console.error('获取缓存大小失败:', e);
        event.reply('cache-size', '无法计算');
    }
});

// 导出设置
ipcMain.on('export-settings', async (event, settings) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
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

// 导入设置
ipcMain.on('import-settings', async (event) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
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

// 重置设置
ipcMain.on('reset-settings', async (event) => {
    try {
        if (fs.existsSync(settingsPath)) {
            await fs.remove(settingsPath);
        }
        appSettings = {};
        
        // 重置开机自启动
        app.setLoginItemSettings({
            openAtLogin: false
        });
        
        // 重置窗口透明度
        if (mainWindow) {
            mainWindow.setOpacity(1);
        }
    } catch (e) {
        console.error('重置设置失败:', e);
    }
});

// 打开安装目录
ipcMain.on('open-install-dir', (event) => {
    const exePath = app.getPath('exe');
    const installDir = path.dirname(exePath);
    shell.openPath(installDir);
});

// 显示许可证
ipcMain.on('show-licenses', (event) => {
    const licensePath = path.join(__dirname, 'LICENSE');
    if (fs.existsSync(licensePath)) {
        shell.openPath(licensePath);
    } else {
        // 如果没有LICENSE文件，显示一个简单的对话框
        dialog.showMessageBox(mainWindow, {
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

// 获取应用信息
ipcMain.on('get-app-info', (event) => {
    const packageJson = require('./package.json');
    event.reply('app-info', {
        version: packageJson.version,
        electronVersion: process.versions.electron,
        installPath: path.dirname(app.getPath('exe'))
    });
});

// 打开外部链接
ipcMain.on('open-external-url', (event, url) => {
    shell.openExternal(url);
});

// 窗口关闭处理
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// 应用启动时加载设置
app.on('ready', () => {
    loadAppSettings();
});
