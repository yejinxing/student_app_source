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

// 通用的 HTTP GET 请求函数，支持重定向
function httpGet(url, options = {}, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
            reject(new Error('重定向次数过多'));
            return;
        }
        
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? require('https') : require('http');
        
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'StudentApp/' + app.getVersion(),
                ...options.headers
            },
            timeout: options.timeout || 10000
        };
        
        const req = client.request(requestOptions, (res) => {
            // 处理重定向 (301, 302, 303, 307, 308)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = res.headers.location;
                const absoluteUrl = redirectUrl.startsWith('http') 
                    ? redirectUrl 
                    : `${urlObj.protocol}//${urlObj.hostname}${redirectUrl}`;
                
                console.log(`跟随重定向: ${url} -> ${absoluteUrl}`);
                // 递归调用，减少重定向次数
                httpGet(absoluteUrl, options, maxRedirects - 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                return;
            }
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve(data);
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
        
        req.end();
    });
}

// 动态获取最新版本的 latest.yml
// 由于 Gitee 没有 latest 标签，我们需要先获取最新版本号
async function getLatestVersionFromGitee() {
    try {
        const url = `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/releases/latest`;
        const data = await httpGet(url);
        
        try {
            const release = JSON.parse(data);
            // 返回完整的 release 信息，包括 tag_name 和 body (release notes)
            return {
                tag_name: release.tag_name,
                body: release.body || '',
                published_at: release.published_at || release.created_at
            };
        } catch (e) {
            throw new Error(`解析 JSON 失败: ${e.message}`);
        }
    } catch (e) {
        console.error('获取 Gitee 最新版本失败:', e);
        return null;
    }
}

// 配置更新源：从 Gitee 获取 latest.yml（元数据文件小，国内访问快）
// 注意：feedUrl 会在检查更新时动态设置
const platform = process.platform;

// 初始化时设置一个默认的 feedUrl（会在检查更新时更新）
// 现在所有平台都使用统一的 latest.yml（包含所有平台的文件信息）
let feedUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/latest/latest.yml`;

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
    
    // 在开发模式下，如果 dev-app-update.yml 不存在，创建一个指向 Gitee 的配置文件
    const devUpdateConfigPath = path.join(__dirname, 'dev-app-update.yml');
    if (!fs.existsSync(devUpdateConfigPath)) {
        try {
            const yaml = require('js-yaml');
            const devConfig = {
                provider: 'generic',
                url: `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/latest/`
            };
            fs.writeFileSync(devUpdateConfigPath, yaml.dump(devConfig), 'utf8');
            console.log('[AutoUpdater] 开发模式：已创建 dev-app-update.yml');
        } catch (e) {
            console.warn('[AutoUpdater] 开发模式：创建 dev-app-update.yml 失败:', e.message);
        }
    }
    
    console.log('[AutoUpdater] 开发模式：已启用更新检查');
    console.log('[AutoUpdater] 开发模式：将使用 dev-app-update.yml 或 setFeedURL 设置的 URL');
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

// 存储手动获取的 release notes（在 check-for-updates 中设置）
let manualReleaseInfo = null;

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
        // 优先使用手动获取的 release notes（如果存在）
        const finalReleaseNotes = manualReleaseInfo?.releaseNotes || info.releaseNotes || '暂无更新说明';
        const finalReleaseDate = manualReleaseInfo?.releaseDate || (info.releaseDate ? info.releaseDate.split('T')[0] : '未知');
        
        mainWindow.webContents.send('update-available', {
            currentVersion: app.getVersion(),
            version: info.version,
            releaseDate: finalReleaseDate,
            releaseNotes: finalReleaseNotes,
            size: formatSize(info.files?.[0]?.size),
            platform: getPlatformName()
        });
        
        // 清除手动获取的信息（避免影响下次检查）
        manualReleaseInfo = null;
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

// 手动下载并解析 latest.yml（现在所有平台都使用统一的 latest.yml）
async function fetchUpdateInfo(version) {
    try {
        const ymlFileName = 'latest.yml';
        const ymlUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/${version}/${ymlFileName}`;
        
        console.log('从 Gitee 下载 latest.yml (统一文件，包含所有平台):', ymlUrl);
        
        const yaml = require('js-yaml');
        const data = await httpGet(ymlUrl);
        
        try {
            const updateInfo = yaml.load(data);
            return updateInfo;
        } catch (e) {
            throw new Error(`解析 YAML 失败: ${e.message}`);
        }
    } catch (e) {
        throw e;
    }
}

// IPC: 检查更新
ipcMain.on('check-for-updates', async (event) => {
    console.log('开始检查更新...');
    try {
        // 先从 Gitee 获取最新版本信息（包括版本号和 release notes）
        const latestRelease = await getLatestVersionFromGitee();
        
        if (!latestRelease || !latestRelease.tag_name) {
            throw new Error('无法从 Gitee 获取最新版本号');
        }
        
        const latestVersion = latestRelease.tag_name;
        const releaseNotes = latestRelease.body || '';
        const releaseDate = latestRelease.published_at || '';
        
        console.log('Gitee 最新版本:', latestVersion);
        if (releaseNotes) {
            console.log('Release Notes 长度:', releaseNotes.length);
        }
        
        // 现在所有平台都使用统一的 latest.yml（包含所有平台的文件信息）
        // electron-updater 会根据当前运行平台自动选择对应的文件
        const ymlFileName = 'latest.yml';
        
        // 手动下载 latest.yml（因为 electron-updater 的 generic provider 会自动追加 /latest.yml）
        const yaml = require('js-yaml');
        const updateInfo = await fetchUpdateInfo(latestVersion);
        
        console.log('解析的更新信息:', JSON.stringify(updateInfo, null, 2));
        
        // 比较版本
        const currentVersion = app.getVersion();
        
        // 优先使用从 Gitee API 获取的版本号（因为 latest.yml 中的 version 可能不准确）
        // 如果 latest.yml 中有 version 字段，也记录一下用于对比
        const ymlVersion = updateInfo.version;
        const apiVersion = latestVersion;
        
        // 统一处理版本号格式（移除 v 前缀）
        const normalizedCurrentVersion = currentVersion.replace(/^v/, '');
        const normalizedApiVersion = apiVersion.replace(/^v/, '');
        const normalizedYmlVersion = ymlVersion ? ymlVersion.replace(/^v/, '') : null;
        
        console.log('版本比较:');
        console.log('  - 当前版本:', currentVersion, '(标准化:', normalizedCurrentVersion + ')');
        console.log('  - Gitee API 版本:', apiVersion, '(标准化:', normalizedApiVersion + ')');
        if (ymlVersion) {
            console.log('  - latest.yml 版本:', ymlVersion, '(标准化:', normalizedYmlVersion + ')');
        }
        
        // 使用 API 获取的版本号进行比较（更可靠）
        const versionComparison = compareVersion(normalizedApiVersion, normalizedCurrentVersion);
        console.log('  - 比较结果 (API版本 vs 当前版本):', versionComparison);
        
        if (versionComparison <= 0) {
            console.log('当前已是最新版本');
            if (mainWindow) {
                mainWindow.webContents.send('update-not-available', {
                    currentVersion: currentVersion
                });
            }
            return;
        }
        
        // 如果 latest.yml 中的版本号与 API 获取的不一致，使用 API 的版本号更新 latest.yml
        if (normalizedYmlVersion && normalizedYmlVersion !== normalizedApiVersion) {
            console.log('警告: latest.yml 中的版本号与 API 获取的不一致，使用 API 版本号');
            updateInfo.version = normalizedApiVersion;
        } else if (!updateInfo.version) {
            // 如果 latest.yml 中没有 version 字段，添加它
            updateInfo.version = normalizedApiVersion;
        }
        
        const updateVersion = normalizedApiVersion;
        
        console.log('发现新版本，准备更新');
        
        // 保存更新信息
        currentUpdateInfo = updateInfo;
        
        // 构造 Gitee 的目录 URL（用于 electron-updater）
        // 注意：electron-updater 的 generic provider 会自动在 URL 后追加 /latest.yml
        // 现在所有平台都使用统一的 latest.yml（包含所有平台的文件信息）
        // electron-updater 会根据当前运行平台自动选择对应的文件
        const giteeDirUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/${apiVersion}/`;
        
        // 设置更新源为 Gitee 目录 URL（electron-updater 会自动追加 latest.yml）
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: giteeDirUrl
        });
        
        console.log('设置更新源目录 URL:', giteeDirUrl);
        console.log('注意: electron-updater 会自动追加 latest.yml，实际请求:', giteeDirUrl + 'latest.yml');
        console.log('latest.yml 包含所有平台的文件信息，electron-updater 会根据当前平台自动选择');
        
        // 保存手动获取的 release notes 和日期，供 update-available 事件使用
        const manualReleaseNotes = releaseNotes || updateInfo.releaseNotes || '暂无更新说明';
        const manualReleaseDate = releaseDate 
            ? releaseDate.split('T')[0] 
            : (updateInfo.releaseDate ? updateInfo.releaseDate.split('T')[0] : '未知');
        
        // 保存手动获取的信息，供 update-available 事件使用
        manualReleaseInfo = {
            releaseNotes: manualReleaseNotes,
            releaseDate: manualReleaseDate
        };
        
        // 需要调用 checkForUpdates() 来更新 electron-updater 的内部状态
        // 这样 downloadUpdate() 才能正常工作
        // 在 update-available 事件中，我们会使用手动获取的 release notes
        try {
            const checkResult = await autoUpdater.checkForUpdates();
            console.log('已更新 electron-updater 内部状态');
            console.log('检查结果:', checkResult ? `更新可用: ${checkResult.updateInfo?.version}` : '无更新');
        } catch (checkError) {
            console.error('checkForUpdates() 调用失败:', checkError);
            // 如果 checkForUpdates 失败，我们需要确保 electron-updater 知道有更新可用
            // 手动触发 update-available 事件，并保存更新信息
            if (mainWindow) {
                // 确保 currentUpdateInfo 已设置，这样 downloadUpdate() 可以使用它
                currentUpdateInfo = updateInfo;
                
                mainWindow.webContents.send('update-available', {
                    currentVersion: currentVersion,
                    version: updateVersion,
                    releaseDate: manualReleaseDate,
                    releaseNotes: manualReleaseNotes,
                    size: updateInfo.files?.[0]?.size ? formatSize(updateInfo.files[0].size) : '未知',
                    platform: getPlatformName()
                });
                manualReleaseInfo = null; // 清除
            }
            
            // 即使 checkForUpdates 失败，我们也尝试继续
            // downloadUpdate() 可能会失败，但我们可以提示用户手动下载
            console.warn('警告: checkForUpdates() 失败，下载可能会失败。如果下载失败，请手动从 GitHub Release 下载。');
        }
        
    } catch (error) {
        console.error('检查更新失败:', error);
        event.reply('update-error', `检查更新失败: ${error.message}`);
    }
});

// 比较版本号
function compareVersion(v1, v2) {
    const parts1 = v1.replace(/^v/, '').split('.').map(Number);
    const parts2 = v2.replace(/^v/, '').split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}

// 存储当前更新信息（用于自定义下载）
let currentUpdateInfo = null;

// IPC: 开始下载更新
// 下载逻辑说明：
// 1. latest.yml 等元数据文件从 Gitee 下载（文件小，国内访问快）
// 2. 安装包（.exe, .dmg, .AppImage 等）从 GitHub 下载（latest.yml 中的 URL 已指向 GitHub）
// 3. blockmap 文件从 Gitee 下载（用于增量更新验证，文件小，国内访问快）
ipcMain.on('download-update', async (event) => {
    console.log('开始下载更新...');
    console.log('下载逻辑：');
    console.log('  - 元数据文件（latest.yml 等）：从 Gitee 下载（已通过 checkForUpdates 获取）');
    console.log('  - 安装包文件（.exe/.dmg/.AppImage 等）：从 GitHub 下载（latest.yml 中的 URL）');
    console.log('  - blockmap 文件：从 Gitee 下载（用于增量更新验证，文件小，国内访问快）');
    
    try {
        // 检查是否有更新信息
        if (!currentUpdateInfo) {
            throw new Error('没有可用的更新信息，请先检查更新');
        }
        
        event.reply('update-downloading');
        
        // electron-updater 会自动使用 latest.yml 中的 URL 下载安装包
        // latest.yml 中的 URL 已经在构建时通过 fix-yaml-urls.js 修改为指向 GitHub Release
        // 格式：https://github.com/yejinxing/student_app_source/releases/download/v1.0.2/StudentInfoTool-Setup-1.0.2.exe
        await autoUpdater.downloadUpdate();
        console.log('下载更新成功');
    } catch (error) {
        console.error('下载更新失败:', error);
        const errorMessage = error.message || '未知错误';
        
        // 如果是因为没有检查更新，提供更详细的错误信息
        if (errorMessage.includes('check update first') || errorMessage.includes('Please check update')) {
            event.reply('update-error', `下载失败: 请先检查更新。如果问题持续，请手动从 GitHub Release 页面下载安装包。`);
        } else {
            event.reply('update-error', `下载失败: ${errorMessage}`);
        }
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
