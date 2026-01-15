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
    
    // 窗口加载完成后，也尝试清理（作为备用清理机制）
    mainWindow.webContents.once('did-finish-load', () => {
        console.log('窗口加载完成，执行备用清理...');
        setTimeout(async () => {
            await cleanupUpdateCache();
        }, 2000);
    });
}

app.whenReady().then(async () => {
    // 应用启动时延迟清理更新缓存
    // 延迟执行，确保安装程序完全退出后再清理（避免文件被占用）
    console.log('应用启动，准备清理更新缓存...');
    
    // 立即创建窗口（不阻塞）
    createWindow();
    
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
// 注意：某些镜像可能会有 SSL 证书问题或不稳定，需要定期检查更新
// 前缀方式：在原始 URL 前添加镜像前缀
// 替换方式：将 github.com 替换为镜像域名
const GITHUB_MIRRORS = [
    { name: 'ghproxy.net', prefix: 'https://ghproxy.net/', type: 'prefix' },
    { name: 'gh-proxy', prefix: 'https://gh-proxy.com/', type: 'prefix' },
    { name: 'ghfast', prefix: 'https://ghfast.top/', type: 'prefix' },
    { name: 'kkgithub', prefix: 'https://kkgithub.com/', type: 'replace' },  // 替换 github.com
    { name: '直连', prefix: '', type: 'direct' }
];

// 从镜像 URL 中提取原始 URL
function extractOriginalUrl(url) {
    if (!url) return url;
    
    // 检查是否是镜像 URL
    for (const mirror of GITHUB_MIRRORS) {
        if (!mirror.prefix) continue;
        
        if (mirror.type === 'replace') {
            // 替换方式：将镜像域名替换回 github.com
            const mirrorDomain = mirror.prefix.replace(/\/$/, '');
            if (url.includes(mirrorDomain)) {
                return url.replace(mirrorDomain, 'https://github.com');
            }
        } else if (mirror.type === 'prefix' && url.startsWith(mirror.prefix)) {
            // 前缀方式：移除镜像前缀
            return url.substring(mirror.prefix.length);
        }
    }
    
    // 不是镜像 URL，返回原样
    return url;
}

// 将 GitHub URL 转换为镜像 URL
function transformToMirrorUrl(url, mirrorIndex = 0) {
    if (!url) {
        return url;
    }
    
    // 先提取原始 URL（如果已经是镜像 URL，先还原）
    const originalUrl = extractOriginalUrl(url);
    
    // 检查是否是 GitHub URL
    if (!originalUrl.includes('github.com')) {
        return url;  // 不是 GitHub URL，不转换
    }
    
    if (mirrorIndex >= GITHUB_MIRRORS.length) {
        mirrorIndex = 0;
    }
    
    const mirror = GITHUB_MIRRORS[mirrorIndex];
    
    // 根据镜像类型进行转换
    if (mirror.type === 'replace') {
        // 替换方式：将 github.com 替换为镜像域名
        return originalUrl.replace('https://github.com', mirror.prefix.replace(/\/$/, ''));
    } else if (mirror.type === 'prefix' && mirror.prefix) {
        // 前缀方式：在原始 URL 前添加镜像前缀
        return mirror.prefix + originalUrl;
    } else {
        // 直连或其他
        return originalUrl;
    }
}

// 通过镜像下载文件（支持进度回调和断点续传）
function downloadFileWithMirror(originalUrl, destPath, onProgress, resumeFrom = 0) {
    return new Promise(async (resolve, reject) => {
        // 尝试每个镜像
        for (let i = 0; i < GITHUB_MIRRORS.length; i++) {
            const mirror = GITHUB_MIRRORS[i];
            const url = mirror.prefix ? mirror.prefix + originalUrl : originalUrl;
            
            console.log(`尝试从 ${mirror.name} 下载: ${url}`);
            
            try {
                await downloadFile(url, destPath, onProgress, mirror.name, resumeFrom);
                console.log(`✓ 从 ${mirror.name} 下载成功`);
                resolve({ success: true, mirror: mirror.name });
                return;
            } catch (e) {
                console.warn(`从 ${mirror.name} 下载失败: ${e.message}`);
                // 如果不是最后一个镜像，继续尝试下一个
                if (i < GITHUB_MIRRORS.length - 1) {
                    console.log('尝试下一个镜像...');
                }
            }
        }
        
        reject(new Error('所有镜像下载都失败'));
    });
}

// 下载文件到指定路径（支持进度回调和断点续传）
function downloadFile(url, destPath, onProgress, mirrorName, resumeFrom = 0) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? require('https') : require('http');
        
        const headers = {
            'User-Agent': 'StudentApp/' + app.getVersion()
        };
        
        // 断点续传：添加 Range 头
        if (resumeFrom > 0) {
            headers['Range'] = `bytes=${resumeFrom}-`;
            console.log(`断点续传：从 ${resumeFrom} 字节继续下载`);
        }
        
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers,
            timeout: 30000 // 30秒超时（连接超时，下载时间不限）
        };
        
        const req = client.request(requestOptions, (res) => {
            // 处理重定向
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = res.headers.location;
                const absoluteUrl = redirectUrl.startsWith('http') 
                    ? redirectUrl 
                    : `${urlObj.protocol}//${urlObj.hostname}${redirectUrl}`;
                
                console.log(`跟随重定向: ${absoluteUrl}`);
                downloadFile(absoluteUrl, destPath, onProgress, mirrorName, resumeFrom)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            // 206 表示部分内容（断点续传成功）
            if (res.statusCode !== 200 && res.statusCode !== 206) {
                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                return;
            }
            
            // 计算总大小
            let totalSize = 0;
            if (res.statusCode === 206) {
                // 断点续传：从 Content-Range 获取总大小
                const contentRange = res.headers['content-range'];
                if (contentRange) {
                    const match = contentRange.match(/\/(\d+)/);
                    if (match) {
                        totalSize = parseInt(match[1], 10);
                    }
                }
            } else {
                totalSize = parseInt(res.headers['content-length'], 10) || 0;
            }
            
            let downloadedSize = resumeFrom;
            let lastProgressTime = Date.now();
            let lastDownloadedSize = resumeFrom;
            let speedSamples = []; // 用于计算平均速度
            
            // 确保目录存在
            const dir = path.dirname(destPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // 断点续传使用追加模式，新下载使用覆盖模式
            const fileStream = fs.createWriteStream(destPath, { flags: resumeFrom > 0 ? 'a' : 'w' });
            
            res.on('data', (chunk) => {
                downloadedSize += chunk.length;
                fileStream.write(chunk);
                
                // 限制进度回调频率（每200ms一次）
                const now = Date.now();
                const timeDiff = now - lastProgressTime;
                if (onProgress && totalSize > 0 && timeDiff > 200) {
                    // 计算实时速度
                    const bytesDiff = downloadedSize - lastDownloadedSize;
                    const bytesPerSecond = Math.round(bytesDiff / (timeDiff / 1000));
                    
                    // 添加到样本数组用于计算平均速度
                    speedSamples.push(bytesPerSecond);
                    if (speedSamples.length > 5) {
                        speedSamples.shift(); // 只保留最近5个样本
                    }
                    
                    // 计算平均速度
                    const avgSpeed = Math.round(speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length);
                    
                    lastProgressTime = now;
                    lastDownloadedSize = downloadedSize;
                    
                    const percent = Math.round((downloadedSize / totalSize) * 100);
                    const downloadedMB = (downloadedSize / (1024 * 1024)).toFixed(2);
                    const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
                    
                    // 计算剩余时间
                    const remainingBytes = totalSize - downloadedSize;
                    const remainingSeconds = avgSpeed > 0 ? Math.round(remainingBytes / avgSpeed) : 0;
                    let remainingStr = '计算中...';
                    if (avgSpeed > 0) {
                        if (remainingSeconds < 60) {
                            remainingStr = `${remainingSeconds}秒`;
                        } else if (remainingSeconds < 3600) {
                            remainingStr = `${Math.floor(remainingSeconds / 60)}分${remainingSeconds % 60}秒`;
                        } else {
                            remainingStr = `${Math.floor(remainingSeconds / 3600)}小时`;
                        }
                    }
                    
                    onProgress({
                        percent,
                        transferred: downloadedSize,
                        total: totalSize,
                        bytesPerSecond: avgSpeed,
                        mirrorName,
                        downloadedMB,
                        totalMB,
                        remainingStr
                    });
                }
            });
            
            res.on('end', () => {
                fileStream.end();
                // 最后一次进度更新
                if (onProgress && totalSize > 0) {
                    onProgress({
                        percent: 100,
                        transferred: totalSize,
                        total: totalSize,
                        bytesPerSecond: 0,
                        mirrorName,
                        downloadedMB: (totalSize / (1024 * 1024)).toFixed(2),
                        totalMB: (totalSize / (1024 * 1024)).toFixed(2),
                        remainingStr: '已完成'
                    });
                }
                resolve();
            });
            
            res.on('error', (err) => {
                fileStream.close();
                // 不删除文件，保留用于断点续传
                reject(err);
            });
        });
        
        req.on('error', (err) => {
            reject(err);
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('连接超时'));
        });
        
        req.end();
    });
}

// 配置 autoUpdater - 从 Gitee 获取元数据，从 GitHub 镜像下载安装包
autoUpdater.autoDownload = false; // 不自动下载，等用户确认
autoUpdater.autoInstallOnAppQuit = false; // 不在退出时自动安装，我们手动控制

// 注意：cacheDir 已在 setFeedURL 之前设置

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

// 获取应用安装目录的函数
function getAppInstallDir() {
    if (!app.isPackaged) {
        // 开发模式：使用项目根目录
        return __dirname;
    }
    
    // 打包模式：获取应用安装目录
    const exePath = app.getPath('exe');
    const exeDir = path.dirname(exePath);
    
    // 打印调试信息
    console.log('[Debug] 可执行文件路径:', exePath);
    console.log('[Debug] 可执行文件目录:', exeDir);
    
    // 对于 Windows，如果 exe 在 resources 目录下（如 resources/app.asar），需要向上两级
    // 对于普通安装，exe 就在安装目录下
    if (exeDir.includes('resources')) {
        // 如果 exe 在 resources 目录下，向上两级到安装目录
        const installDir = path.dirname(path.dirname(exeDir));
        console.log('[Debug] 检测到 resources 目录，应用安装目录:', installDir);
        return installDir;
    } else {
        // exe 直接在安装目录下
        console.log('[Debug] exe 在安装目录下，应用安装目录:', exeDir);
        return exeDir;
    }
}

// 获取下载目录的函数
function getDownloadDir() {
    if (!app.isPackaged) {
        // 开发模式：使用项目根目录/resources
        return path.join(__dirname, 'resources');
    }
    
    // 打包模式：使用应用安装目录/resources
    const installDir = getAppInstallDir();
    const downloadDir = path.join(installDir, 'resources');
    console.log('[Debug] 下载目录:', downloadDir);
    return downloadDir;
}

// 设置更新源（使用 Gitee）
// 同时设置 cacheDir，确保下载到指定目录
const initialDownloadDir = getDownloadDir();
try {
    if (!fs.existsSync(initialDownloadDir)) {
        fs.mkdirSync(initialDownloadDir, { recursive: true });
        console.log('[AutoUpdater] 已创建下载目录:', initialDownloadDir);
    }
    // 设置 cacheDir（必须在 setFeedURL 之前设置）
    autoUpdater.cacheDir = initialDownloadDir;
    // 同时设置环境变量（某些版本的 electron-updater 可能使用环境变量）
    process.env.UPDATER_CACHE_DIR = initialDownloadDir;
    console.log('[AutoUpdater] 已设置 cacheDir:', initialDownloadDir);
} catch (e) {
    console.warn('[AutoUpdater] 设置 cacheDir 失败:', e.message);
}

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

// 强制删除目录的辅助函数（带重试机制）
async function forceRemoveDir(dirPath, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            if (!fs.existsSync(dirPath)) {
                return true; // 目录已不存在
            }
            
            // 尝试删除
            fs.removeSync(dirPath);
            return true; // 删除成功
        } catch (e) {
            if (i < maxRetries - 1) {
                // 等待一段时间后重试（文件可能被占用）
                // 逐渐增加等待时间：500ms, 1000ms, 2000ms, 3000ms, 5000ms
                const waitTime = Math.min(500 * Math.pow(2, i), 5000);
                console.log(`删除失败 (${e.message})，等待 ${waitTime}ms 后重试 (${i + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
                // 最后一次尝试失败，抛出错误
                throw e;
            }
        }
    }
    return false;
}

// 递归清理目录的辅助函数（逐个删除文件和子目录）
async function cleanupDirRecursively(dirPath, cleanedCountRef) {
    try {
        console.log('尝试逐个删除文件和子目录...');
        const files = fs.readdirSync(dirPath);
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    console.log('  删除子目录:', filePath);
                    await forceRemoveDir(filePath, 3);
                    cleanedCountRef.count++;
                } else {
                    console.log('  删除文件:', filePath);
                    // 文件删除也带重试
                    for (let i = 0; i < 3; i++) {
                        try {
                            fs.unlinkSync(filePath);
                            cleanedCountRef.count++;
                            break;
                        } catch (fileError) {
                            if (i < 2) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            } else {
                                throw fileError;
                            }
                        }
                    }
                }
            } catch (fileError) {
                console.warn(`  删除失败 ${filePath}:`, fileError.message);
            }
        }
        
        // 再次尝试删除空目录
        try {
            await forceRemoveDir(dirPath, 3);
            console.log('✓ 已删除空的目录');
            cleanedCountRef.count++;
        } catch (e2) {
            console.warn('删除空目录失败:', e2.message);
        }
    } catch (e2) {
        console.error('逐个删除也失败:', e2.message);
    }
}

// 清理更新缓存目录（确保安装后删除安装包，避免占用磁盘空间）
async function cleanupUpdateCache() {
    const timestamp = new Date().toISOString();
    console.log(`=== [${timestamp}] 开始清理更新缓存 ===`);
    let cleanedCount = 0;
    // 使用对象引用，以便在辅助函数中修改
    const cleanedCountRef = { count: 0 };
    
    // 检查是否有清理标记，如果有，说明这是安装后的首次启动
    const cleanupMarkerPath = path.join(app.getPath('userData'), 'cleanup-marker.json');
    const hasCleanupMarker = fs.existsSync(cleanupMarkerPath);
    if (hasCleanupMarker) {
        console.log('检测到清理标记，这是安装后的首次启动，将执行完整清理');
    } else {
        console.log('未检测到清理标记，执行常规清理检查');
    }
    
    try {
        // 1. 检查是否有清理标记（上次安装后需要清理的目录）
        const cleanupMarkerPath = path.join(app.getPath('userData'), 'cleanup-marker.json');
        if (fs.existsSync(cleanupMarkerPath)) {
            try {
                const marker = JSON.parse(fs.readFileSync(cleanupMarkerPath, 'utf8'));
                console.log('发现清理标记（版本:', marker.version || '未知', '），开始清理安装包...');
                
                // 清理实际下载位置
                if (marker.actualPendingDir && fs.existsSync(marker.actualPendingDir)) {
                    try {
                        await forceRemoveDir(marker.actualPendingDir);
                        console.log('✓ 已清理安装包目录:', marker.actualPendingDir);
                        cleanedCount++;
                    } catch (e) {
                        console.warn('清理安装包目录失败:', marker.actualPendingDir, e.message);
                    }
                }
                
                // 清理所有可能的位置（确保清理完整）
                // 特别注意：updaterCacheDir 必须最后清理，因为它包含其他目录
                const dirsToClean = [
                    marker.defaultPendingDir,
                    marker.updaterPendingDir,
                    // updaterCacheDir 放在最后，因为它包含 pending 目录
                ];
                
                for (const dir of dirsToClean) {
                    if (dir && fs.existsSync(dir)) {
                        try {
                            await forceRemoveDir(dir);
                            console.log('✓ 已清理:', dir);
                            cleanedCount++;
                        } catch (e) {
                            console.warn('清理失败:', dir, e.message);
                        }
                    }
                }
                
                // 最后清理 updaterCacheDir（包含所有子目录）
                if (marker.updaterCacheDir && fs.existsSync(marker.updaterCacheDir)) {
                    try {
                        await forceRemoveDir(marker.updaterCacheDir);
                        console.log('✓ 已清理 updater 缓存目录:', marker.updaterCacheDir);
                        cleanedCount++;
                    } catch (e) {
                        console.warn('清理 updater 缓存目录失败:', marker.updaterCacheDir, e.message);
                    }
                }
                
                // 删除清理标记
                fs.unlinkSync(cleanupMarkerPath);
                console.log('已删除清理标记');
            } catch (e) {
                console.warn('处理清理标记失败:', e.message);
            }
        }
        
        // 2. 清理 electron-updater 的默认缓存目录（即使没有清理标记也清理）
        // 注意：electron-updater 可能使用 userData (Roaming) 或 Local 目录
        const userDataPendingDir = path.join(app.getPath('userData'), 'pending');
        if (fs.existsSync(userDataPendingDir)) {
            try {
                await forceRemoveDir(userDataPendingDir);
                console.log('✓ 已清理 userData pending 目录:', userDataPendingDir);
                cleanedCount++;
            } catch (e) {
                console.warn('清理 userData pending 目录失败:', e.message);
            }
        }
        
        // 2.5. 清理 Local 目录下的 pending（electron-updater 实际使用的目录）
        // Windows 上，electron-updater 可能使用 AppData\Local 而不是 Roaming
        let localPendingDir = null;
        if (process.platform === 'win32') {
            // Windows: AppData\Local\<appName>\pending
            const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
            localPendingDir = path.join(localAppData, app.getName(), 'pending');
            if (fs.existsSync(localPendingDir)) {
                console.log('发现 Local 目录下的 pending:', localPendingDir);
                try {
                    await forceRemoveDir(localPendingDir);
                    console.log('✓ 已清理 Local pending 目录:', localPendingDir);
                    cleanedCount++;
                } catch (e) {
                    console.warn('清理 Local pending 目录失败:', e.message);
                }
            }
        }
        
        // 3. 清理 electron-updater 可能使用的另一个默认位置（userData/app-updater）
        const updaterCacheDir = path.join(app.getPath('userData'), app.getName() + '-updater');
        if (fs.existsSync(updaterCacheDir)) {
            console.log('发现 updater 缓存目录（Roaming），准备清理:', updaterCacheDir);
            try {
                const files = fs.readdirSync(updaterCacheDir);
                console.log('  updater 目录包含:', files);
                const success = await forceRemoveDir(updaterCacheDir, 5);
                if (success) {
                    console.log('✓ 已清理 electron-updater 缓存目录（Roaming）:', updaterCacheDir);
                    cleanedCount++;
                } else {
                    throw new Error('强制删除失败');
                }
                } catch (e) {
                    console.warn('清理 updater 缓存目录（Roaming）失败:', e.message);
                    // 尝试逐个删除
                    await cleanupDirRecursively(updaterCacheDir, cleanedCountRef);
                }
        }
        
        // 3.5. 清理 Local 目录下的 updater 目录（这是实际使用的目录！）
        let localUpdaterCacheDir = null;
        if (process.platform === 'win32') {
            const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
            localUpdaterCacheDir = path.join(localAppData, app.getName() + '-updater');
            if (fs.existsSync(localUpdaterCacheDir)) {
                console.log('发现 updater 缓存目录（Local），准备清理:', localUpdaterCacheDir);
                try {
                    const files = fs.readdirSync(localUpdaterCacheDir);
                    console.log('  updater 目录包含:', files);
                    const success = await forceRemoveDir(localUpdaterCacheDir, 5);
                    if (success) {
                        console.log('✓ 已清理 electron-updater 缓存目录（Local）:', localUpdaterCacheDir);
                        cleanedCount++;
                    } else {
                        throw new Error('强制删除失败');
                    }
                } catch (e) {
                    console.warn('清理 updater 缓存目录（Local）失败:', e.message);
                    console.warn('错误详情:', e);
                    // 尝试逐个删除
                    await cleanupDirRecursively(localUpdaterCacheDir, cleanedCountRef);
                }
            }
            
            // 3.6. 也清理 Local 目录下直接以 app 名称命名的目录
            const localAppDir = path.join(localAppData, app.getName());
            if (fs.existsSync(localAppDir)) {
                const files = fs.readdirSync(localAppDir);
                // 只清理 pending 目录，不删除整个 app 目录（可能包含其他数据）
                const localAppPendingDir = path.join(localAppDir, 'pending');
                if (fs.existsSync(localAppPendingDir)) {
                    console.log('发现 Local app 目录下的 pending，准备清理:', localAppPendingDir);
                    try {
                        await forceRemoveDir(localAppPendingDir, 5);
                        console.log('✓ 已清理 Local app pending 目录:', localAppPendingDir);
                        cleanedCount++;
                    } catch (e) {
                        console.warn('清理 Local app pending 目录失败:', e.message);
                    }
                }
            }
        }
        
        // 4. 清理项目 resources 目录中的旧安装包（如果存在）
        const resourcesDir = getDownloadDir();
        if (fs.existsSync(resourcesDir)) {
            try {
                const files = fs.readdirSync(resourcesDir);
                files.forEach(file => {
                    // 清理安装包文件（.exe, .dmg, .AppImage, .deb, .rpm 等）
                    if (file.match(/\.(exe|dmg|AppImage|deb|rpm)$/i) && file.includes('StudentInfoTool')) {
                        const filePath = path.join(resourcesDir, file);
                        try {
                            fs.unlinkSync(filePath);
                            console.log('✓ 已清理旧安装包:', filePath);
                            cleanedCount++;
                        } catch (e) {
                            console.warn('清理文件失败:', filePath, e.message);
                        }
                    }
                    // 清理 electron-updater 创建的临时目录（pending 目录）
                    const filePath = path.join(resourcesDir, file);
                    try {
                        const stat = fs.statSync(filePath);
                        if (stat.isDirectory() && file === 'pending') {
                            fs.removeSync(filePath);
                            console.log('✓ 已清理 pending 目录:', filePath);
                            cleanedCount++;
                        }
                    } catch (e) {
                        // 忽略文件不存在等错误
                    }
                });
            } catch (e) {
                console.warn('清理 resources 目录失败:', e.message);
            }
        }
        
        // 合并清理计数
        cleanedCount = cleanedCount + cleanedCountRef.count;
        
        const endTimestamp = new Date().toISOString();
        if (cleanedCount > 0) {
            console.log(`=== [${endTimestamp}] 清理完成，共清理 ${cleanedCount} 个文件/目录 ===`);
        } else {
            console.log(`=== [${endTimestamp}] 无需清理，没有残留的安装包 ===`);
        }
    } catch (e) {
        const errorTimestamp = new Date().toISOString();
        console.error(`=== [${errorTimestamp}] 清理更新缓存时出错:`, e.message);
        console.error('错误堆栈:', e.stack);
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
    // 在 update-available 事件中立即转换，确保后续下载使用镜像
    if (info.files && info.files.length > 0) {
        console.log('=== update-available 事件中转换 GitHub URL 为镜像 ===');
        // 确保镜像状态已初始化
        if (!currentMirrorState.originalUrls || Object.keys(currentMirrorState.originalUrls).length === 0) {
            currentMirrorState.mirrorIndex = 0;
            currentMirrorState.originalUrls = {};
        }
        
        info.files.forEach((file, index) => {
            if (file.url && file.url.includes('github.com')) {
                // 先提取原始 URL（如果已经是镜像 URL，先还原）
                const originalUrl = extractOriginalUrl(file.url);
                // 保存原始 URL（如果还没有保存）
                if (!currentMirrorState.originalUrls[index]) {
                    currentMirrorState.originalUrls[index] = originalUrl;
                }
                // 立即转换为镜像 URL（使用已保存的原始 URL）
                const originalUrlToUse = currentMirrorState.originalUrls[index] || originalUrl;
                const mirrorUrl = transformToMirrorUrl(originalUrlToUse, currentMirrorState.mirrorIndex);
                file.url = mirrorUrl;
                console.log(`文件 ${index + 1}:`);
                console.log(`  原始 URL: ${originalUrlToUse}`);
                console.log(`  镜像 URL: ${mirrorUrl} (镜像: ${GITHUB_MIRRORS[currentMirrorState.mirrorIndex].name})`);
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
    // 有下载进度更新，说明下载正在进行，清除待处理的错误
    if (updateErrorPending) {
        console.log('检测到下载进度更新，清除待处理的错误');
        updateErrorPending = null;
    }
    
    const speed = formatSize(progressObj.bytesPerSecond) + '/s';
    const percent = Math.round(progressObj.percent * 10) / 10;
    const transferred = formatSize(progressObj.transferred);
    const total = formatSize(progressObj.total);
    
    // 获取当前使用的镜像名称
    let mirrorName = null;
    if (currentMirrorState && currentMirrorState.mirrorIndex !== undefined) {
        const currentMirror = GITHUB_MIRRORS[currentMirrorState.mirrorIndex];
        if (currentMirror) {
            mirrorName = currentMirror.name;
        }
    }
    
    console.log(`下载进度: ${percent}% - ${transferred}/${total} - ${speed}${mirrorName ? ` [镜像: ${mirrorName}]` : ''}`);
    
    if (mainWindow) {
        const progressData = {
            percent: percent,
            downloaded: transferred,
            total: total,
            speed: speed,
            remaining: progressObj.bytesPerSecond > 0 
                ? Math.round((progressObj.total - progressObj.transferred) / progressObj.bytesPerSecond) + '秒'
                : '计算中...'
        };
        
        // 如果有镜像信息，添加到进度数据中
        if (mirrorName) {
            progressData.mirrorName = mirrorName;
        }
        
        mainWindow.webContents.send('update-progress', progressData);
    }
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('更新下载完成:', info.version);
    
    // 记录所有可能的安装包位置（用于安装后清理）
    const defaultPendingDir = path.join(app.getPath('userData'), 'pending');
    const updaterCacheDir = path.join(app.getPath('userData'), app.getName() + '-updater');
    const updaterPendingDir = path.join(updaterCacheDir, 'pending');
    
    // 检查实际下载位置
    let actualPendingDir = null;
    if (fs.existsSync(updaterPendingDir)) {
        actualPendingDir = updaterPendingDir;
        console.log('安装包位置:', updaterPendingDir);
    } else if (fs.existsSync(defaultPendingDir)) {
        actualPendingDir = defaultPendingDir;
        console.log('安装包位置:', defaultPendingDir);
    } else {
        console.warn('警告: 未找到安装包文件');
    }
    
    // 记录需要清理的目录（用于安装后清理）
    // 将清理标记保存到设置文件中，确保安装后能够清理所有可能的安装包位置
    try {
        const cleanupMarker = {
            // 实际下载位置
            actualPendingDir: actualPendingDir,
            // 所有可能的位置（确保清理完整）
            defaultPendingDir: defaultPendingDir,
            updaterPendingDir: updaterPendingDir,
            updaterCacheDir: updaterCacheDir,
            // Local 目录位置（Windows 上实际使用的）
            localPendingDir: localPendingDir,
            localUpdaterCacheDir: localUpdaterCacheDir,
            version: info.version,
            timestamp: Date.now()
        };
        const cleanupMarkerPath = path.join(app.getPath('userData'), 'cleanup-marker.json');
        fs.writeFileSync(cleanupMarkerPath, JSON.stringify(cleanupMarker, null, 2), 'utf8');
        console.log('已记录清理标记（安装后会自动清理安装包）:', cleanupMarkerPath);
    } catch (e) {
        console.warn('记录清理标记失败:', e.message);
    }
    
    if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', {
            version: info.version
        });
    }
});

autoUpdater.on('error', async (err) => {
    console.error('更新出错:', err);
    // 提取错误消息（可能是字符串、Error对象或其他格式）
    let errorMessage = '';
    if (typeof err === 'string') {
        errorMessage = err;
    } else if (err && err.message) {
        errorMessage = err.message;
    } else if (err && err.toString) {
        errorMessage = err.toString();
    } else {
        errorMessage = JSON.stringify(err) || '更新失败，请稍后重试';
    }
    
    console.log('错误消息:', errorMessage);
    
    const errorMessageUpper = errorMessage.toUpperCase();
    
    // 检查是否是 blockmap/差量下载相关的错误
    // electron-updater 在差量下载失败时会自动回退到完整下载，这是正常行为，不应该显示错误
    // 常见情况：1. 找不到旧版本文件(ENOENT) 2. blockmap下载失败 3. 差量下载失败
    const isBlockmapError = errorMessageUpper.includes('DIFFERENTIALLY') || 
                           errorMessageUpper.includes('BLOCKMAP') ||
                           errorMessageUpper.includes('FALLBACK TO FULL') ||
                           errorMessageUpper.includes('FALLBACK') ||
                           errorMessageUpper.includes('CANNOT DOWNLOAD DIFFERENTIALLY') ||
                           (errorMessageUpper.includes('ENOENT') && errorMessageUpper.includes('INSTALLER'));
    
    if (isBlockmapError) {
        console.log('检测到差量下载失败，electron-updater 会自动回退到完整下载，忽略此错误');
        return;  // 直接返回，不显示错误页面
    }
    
    // 设置延迟处理：等待几秒观察是否有下载进度
    // 如果有进度更新，说明 electron-updater 已自动重试或回退，不需要显示错误
    const pendingError = errorMessage;
    console.log('错误发生，等待5秒观察是否有下载进度...');
    updateErrorPending = pendingError;
    
    setTimeout(async () => {
        // 如果5秒后 updateErrorPending 还是当前错误，说明没有新的进度更新
        if (updateErrorPending !== pendingError) {
            console.log('检测到新的下载进度或错误已被处理，忽略此错误');
            return;
        }
        
        console.log('5秒内没有新的下载进度，开始处理错误');
        updateErrorPending = null;
        
        // 继续执行错误处理逻辑
        await handleDownloadError(errorMessage);
    }, 5000);
});

// 处理下载错误的函数
async function handleDownloadError(errorMessage) {
    const errorMessageUpper = errorMessage.toUpperCase();
    
    // 检查是否是连接/网络错误（可能是镜像服务器问题，需要切换镜像）
    const isConnectionError = errorMessageUpper.includes('ERR_CONNECTION_RESET') || 
                             errorMessageUpper.includes('ERR_CONNECTION_TIMED_OUT') ||
                             errorMessageUpper.includes('ERR_TIMED_OUT') ||
                             errorMessageUpper.includes('ERR_CERT_AUTHORITY_INVALID') ||  // SSL 证书无效
                             errorMessageUpper.includes('ERR_CERT_DATE_INVALID') ||  // SSL 证书过期
                             errorMessageUpper.includes('ERR_SSL_PROTOCOL_ERROR') ||  // SSL 协议错误
                             errorMessageUpper.includes('ECONNRESET') ||
                             errorMessageUpper.includes('ETIMEDOUT') ||
                             errorMessageUpper.includes('ENOTFOUND') ||
                             errorMessageUpper.includes('TIMEOUT') ||
                             errorMessageUpper.includes('TIMED_OUT') ||
                             errorMessageUpper.includes('CONNECTION_TIMED_OUT') ||
                             errorMessageUpper.includes('NET::ERR_CONNECTION_TIMED_OUT') ||
                             errorMessageUpper.includes('NET::ERR_TIMED_OUT') ||
                             errorMessageUpper.includes('403') ||  // 服务器拒绝
                             errorMessageUpper.includes('502') ||  // 网关错误
                             errorMessageUpper.includes('503') ||  // 服务不可用
                             errorMessageUpper.includes('504');    // 网关超时
    
    // 如果是连接错误且当前使用的是镜像，先尝试重试，失败后再切换镜像
    if (isConnectionError && currentUpdateInfo && currentUpdateInfo.files) {
        const currentMirror = GITHUB_MIRRORS[currentMirrorState.mirrorIndex];
        console.log(`镜像 ${currentMirror.name} 下载失败，错误: ${errorMessage}`);
        
        // 检查是否有部分下载的文件（用于断点续传）
        let partialDownloadInfo = null;
        try {
            const cacheDir = autoUpdater.cacheDir || path.join(app.getPath('userData'), app.getName() + '-updater', 'pending');
            if (fs.existsSync(cacheDir)) {
                const files = fs.readdirSync(cacheDir);
                const exeFiles = files.filter(f => f.endsWith('.exe') || f.endsWith('.dmg') || f.endsWith('.AppImage'));
                if (exeFiles.length > 0) {
                    const partialFile = path.join(cacheDir, exeFiles[0]);
                    const stat = fs.statSync(partialFile);
                    if (stat.size > 0) {
                        partialDownloadInfo = {
                            path: partialFile,
                            size: stat.size
                        };
                        console.log(`发现部分下载的文件: ${partialFile} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
                    }
                }
            }
        } catch (e) {
            console.warn('检查部分下载文件失败:', e.message);
        }
        
        // 先尝试在同一镜像上重试（可能是临时网络问题）
        if (currentMirrorState.retryCount < currentMirrorState.maxRetriesPerMirror) {
            currentMirrorState.retryCount++;
            console.log(`在同一镜像 ${currentMirror.name} 上重试 (${currentMirrorState.retryCount}/${currentMirrorState.maxRetriesPerMirror})...`);
            
            // 通知前端正在重试
            if (mainWindow) {
                let retryMessage = `镜像 ${currentMirror.name} 连接失败，正在重试 (${currentMirrorState.retryCount}/${currentMirrorState.maxRetriesPerMirror})...`;
                if (partialDownloadInfo) {
                    const downloadedMB = (partialDownloadInfo.size / (1024 * 1024)).toFixed(2);
                    retryMessage += ` (已下载 ${downloadedMB} MB，将尝试断点续传)`;
                }
                mainWindow.webContents.send('update-retrying', {
                    mirror: currentMirror.name,
                    message: retryMessage
                });
            }
            
            // 延迟后重试下载（electron-updater 应该会自动断点续传）
            setTimeout(async () => {
                try {
                    console.log('在同一镜像上重试下载...');
                    await autoUpdater.downloadUpdate();
                } catch (retryError) {
                    console.error('重试下载失败:', retryError);
                    // 继续触发错误处理（可能会切换镜像）
                    autoUpdater.emit('error', retryError);
                }
            }, 2000);
            
            return; // 不发送错误，等待重试结果
        }
        
        // 同一镜像重试失败，尝试切换到下一个镜像
        if (currentMirrorState.mirrorIndex < GITHUB_MIRRORS.length - 1) {
            // 重置当前镜像的重试计数
            currentMirrorState.retryCount = 0;
            currentMirrorState.mirrorIndex++;
            const nextMirror = GITHUB_MIRRORS[currentMirrorState.mirrorIndex];
            console.log(`尝试切换到下一个镜像: ${nextMirror.name}`);
            
            // 如果有部分下载的文件，记录信息
            if (partialDownloadInfo) {
                console.log(`注意: 检测到部分下载文件 (${(partialDownloadInfo.size / (1024 * 1024)).toFixed(2)} MB)，electron-updater 应该会自动断点续传`);
            }
            
            // 恢复原始 URL 并转换为新镜像 URL
            if (autoUpdater.updateInfo && autoUpdater.updateInfo.files) {
                autoUpdater.updateInfo.files.forEach((file, index) => {
                    // 优先使用已保存的原始 URL，否则从当前 URL 提取
                    let originalUrl = currentMirrorState.originalUrls[index];
                    if (!originalUrl && file.url) {
                        originalUrl = extractOriginalUrl(file.url);
                        // 保存原始 URL（如果还没有保存）
                        currentMirrorState.originalUrls[index] = originalUrl;
                    }
                    
                    if (originalUrl && originalUrl.includes('github.com')) {
                        const mirrorUrl = transformToMirrorUrl(originalUrl, currentMirrorState.mirrorIndex);
                        file.url = mirrorUrl;
                        console.log(`文件 ${index + 1} 切换到镜像 ${nextMirror.name}: ${mirrorUrl}`);
                    }
                });
            }
            
            // 同步更新 currentUpdateInfo
            currentUpdateInfo.files.forEach((file, index) => {
                // 优先使用已保存的原始 URL，否则从当前 URL 提取
                let originalUrl = currentMirrorState.originalUrls[index];
                if (!originalUrl && file.url) {
                    originalUrl = extractOriginalUrl(file.url);
                    // 保存原始 URL（如果还没有保存）
                    currentMirrorState.originalUrls[index] = originalUrl;
                }
                
                if (originalUrl && originalUrl.includes('github.com')) {
                    file.url = transformToMirrorUrl(originalUrl, currentMirrorState.mirrorIndex);
                }
            });
            
            // 通知前端正在重试
            if (mainWindow) {
                let retryMessage = `镜像 ${currentMirror.name} 连接失败，正在尝试 ${nextMirror.name}...`;
                if (partialDownloadInfo) {
                    const downloadedMB = (partialDownloadInfo.size / (1024 * 1024)).toFixed(2);
                    retryMessage += ` (已下载 ${downloadedMB} MB，将尝试断点续传)`;
                }
                mainWindow.webContents.send('update-retrying', {
                    mirror: nextMirror.name,
                    message: retryMessage
                });
            }
            
            // 延迟后重试下载（给 electron-updater 时间检测部分文件）
            setTimeout(async () => {
                try {
                    console.log('使用新镜像重新下载...');
                    // electron-updater 应该会自动检测部分下载的文件并断点续传
                    // 如果服务器支持 Range 请求，会从断点继续下载
                    await autoUpdater.downloadUpdate();
                } catch (retryError) {
                    console.error('重试下载失败:', retryError);
                    // 如果所有镜像都失败，发送最终错误
                    if (currentMirrorState.mirrorIndex >= GITHUB_MIRRORS.length - 1) {
                        if (mainWindow) {
                            mainWindow.webContents.send('update-error', '所有镜像下载都失败，请稍后重试或手动下载');
                        }
                    } else {
                        // 继续尝试下一个镜像（递归）
                        autoUpdater.emit('error', retryError);
                    }
                }
            }, 2000); // 增加延迟，给 electron-updater 更多时间检测部分文件
            
            return; // 不发送错误，等待重试结果
        } else {
            console.log('所有镜像都已尝试，下载失败');
        }
    }
    
    // 非连接错误或所有镜像都失败，发送错误
    if (mainWindow) {
        mainWindow.webContents.send('update-error', `下载失败: ${errorMessage}`);
    }
}

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
        
        // 立即将 GitHub URL 转换为镜像 URL（在保存之前）
        // 同时保存原始 URL 用于镜像切换
        if (updateInfo.files && updateInfo.files.length > 0) {
            console.log('=== 检查更新时转换 GitHub URL 为镜像 ===');
            // 重置镜像状态
            currentMirrorState.mirrorIndex = 0;
            currentMirrorState.originalUrls = {};
            
            updateInfo.files.forEach((file, index) => {
                if (file.url && file.url.includes('github.com')) {
                    // 先提取原始 URL（如果已经是镜像 URL，先还原）
                    const originalUrl = extractOriginalUrl(file.url);
                    // 保存原始 URL（用于镜像切换）
                    currentMirrorState.originalUrls[index] = originalUrl;
                    const mirrorUrl = transformToMirrorUrl(originalUrl, 0);  // 使用第一个镜像
                    file.url = mirrorUrl;
                    console.log(`文件 ${index + 1}:`);
                    console.log(`  原始 URL: ${originalUrl}`);
                    console.log(`  镜像 URL: ${mirrorUrl} (镜像: ${GITHUB_MIRRORS[0].name})`);
                }
            });
        }
        
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
        
        // 在设置 feedURL 之前，确保 cacheDir 设置正确
        console.log('=== 检查更新时重新设置下载目录 ===');
        const currentDownloadDir = getDownloadDir();
        console.log('[AutoUpdater] 当前下载目录:', currentDownloadDir);
        
        try {
            if (!fs.existsSync(currentDownloadDir)) {
                fs.mkdirSync(currentDownloadDir, { recursive: true });
                console.log('[AutoUpdater] 已创建下载目录:', currentDownloadDir);
            }
            // 重新设置 cacheDir（确保每次检查更新时都使用正确的目录）
            autoUpdater.cacheDir = currentDownloadDir;
            process.env.UPDATER_CACHE_DIR = currentDownloadDir;
            console.log('[AutoUpdater] 已设置 cacheDir:', currentDownloadDir);
            console.log('[AutoUpdater] 已设置环境变量 UPDATER_CACHE_DIR:', currentDownloadDir);
            console.log('[AutoUpdater] 当前 cacheDir 值:', autoUpdater.cacheDir);
        } catch (e) {
            console.error('[AutoUpdater] 设置 cacheDir 失败:', e.message);
            console.error('[AutoUpdater] 错误堆栈:', e.stack);
        }
        
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
            
            // checkForUpdates() 后，electron-updater 会重新获取 latest.yml
            // 需要再次将 GitHub URL 转换为镜像 URL
            if (autoUpdater.updateInfo && autoUpdater.updateInfo.files) {
                console.log('=== checkForUpdates 后再次转换 GitHub URL 为镜像 ===');
                autoUpdater.updateInfo.files.forEach((file, index) => {
                    if (file.url && file.url.includes('github.com')) {
                        // 优先使用已保存的原始 URL，否则从当前 URL 提取
                        let originalUrl = currentMirrorState.originalUrls[index];
                        if (!originalUrl && file.url) {
                            originalUrl = extractOriginalUrl(file.url);
                            // 保存原始 URL（如果还没有保存）
                            currentMirrorState.originalUrls[index] = originalUrl;
                        }
                        
                        if (originalUrl) {
                            const mirrorUrl = transformToMirrorUrl(originalUrl, currentMirrorState.mirrorIndex);
                            file.url = mirrorUrl;
                            console.log(`文件 ${index + 1}:`);
                            console.log(`  原始 URL: ${originalUrl}`);
                            console.log(`  镜像 URL: ${mirrorUrl} (镜像: ${GITHUB_MIRRORS[currentMirrorState.mirrorIndex].name})`);
                        }
                    }
                });
                // 同步更新 currentUpdateInfo
                if (currentUpdateInfo && currentUpdateInfo.files) {
                    currentUpdateInfo.files = autoUpdater.updateInfo.files;
                }
            }
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

// IPC: 静默检查更新（应用启动时自动调用，不显示弹窗）
ipcMain.on('check-for-updates-silent', async (event) => {
    console.log('[静默检查] 开始检查更新...');
    try {
        // 从 Gitee 获取最新版本信息
        const latestRelease = await getLatestVersionFromGitee();
        
        if (!latestRelease || !latestRelease.tag_name) {
            console.log('[静默检查] 无法获取版本信息');
            return;
        }
        
        const latestVersion = latestRelease.tag_name;
        const currentVersion = app.getVersion();
        
        // 标准化版本号（移除 v 前缀）
        const normalizedCurrent = currentVersion.replace(/^v/, '');
        const normalizedLatest = latestVersion.replace(/^v/, '');
        
        console.log(`[静默检查] 当前版本: ${normalizedCurrent}, 最新版本: ${normalizedLatest}`);
        
        // 比较版本
        const comparison = compareVersion(normalizedLatest, normalizedCurrent);
        
        if (comparison > 0) {
            console.log('[静默检查] 发现新版本!');
            // 发现新版本，通知前端
            if (mainWindow) {
                mainWindow.webContents.send('update-available-silent', {
                    currentVersion: currentVersion,
                    version: normalizedLatest,
                    releaseDate: latestRelease.published_at ? latestRelease.published_at.split('T')[0] : '未知',
                    releaseNotes: latestRelease.body || '暂无更新说明'
                });
            }
        } else {
            console.log('[静默检查] 当前已是最新版本');
        }
    } catch (error) {
        // 静默检查失败不显示错误，只记录日志
        console.error('[静默检查] 检查更新失败:', error.message);
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

// 存储当前使用的镜像索引和原始 URL（用于镜像切换）
let currentMirrorState = {
    mirrorIndex: 0,  // 当前使用的镜像索引
    originalUrls: {},  // 保存原始 URL（key: file index, value: original URL）
    retryCount: 0,  // 当前镜像的重试次数
    maxRetriesPerMirror: 2  // 每个镜像最多重试次数
};

// 待处理的错误（用于延迟显示，观察是否有下载进度）
let updateErrorPending = null;

// 存储下载状态信息（用于断点续传和已下载文件复用）
let downloadState = {
    version: null,          // 下载的版本号
    destPath: null,         // 下载目标路径
    downloadUrl: null,      // 下载链接
    isComplete: false,      // 是否下载完成
    expectedSize: 0         // 预期文件大小
};

// 保存已下载的安装包路径（用于跳过下载后的安装）
let cachedInstallerPath = null;

// 检查是否已有完整下载的安装包
function checkExistingDownload(version, downloadDir) {
    console.log('=== 检查已有安装包 ===');
    // 标准化版本号（移除 v 前缀）
    const normalizedVersion = version.replace(/^v/, '');
    console.log('版本:', normalizedVersion);
    console.log('downloadDir:', downloadDir);
    
    // 首先检查 electron-updater 是否已有下载的文件
    try {
        const updaterFile = autoUpdater.downloadedUpdateHelper?.file;
        if (updaterFile && fs.existsSync(updaterFile)) {
            const stat = fs.statSync(updaterFile);
            if (stat.size > 10 * 1024 * 1024) {
                console.log(`✓ electron-updater 已有下载文件: ${updaterFile}`);
                console.log(`  文件大小: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
                cachedInstallerPath = updaterFile;
                return {
                    path: updaterFile,
                    size: stat.size,
                    fileName: path.basename(updaterFile)
                };
            }
        }
    } catch (e) {
        console.log('检查 electron-updater 文件失败:', e.message);
    }
    
    // 检查之前缓存的路径
    if (cachedInstallerPath && fs.existsSync(cachedInstallerPath)) {
        try {
            const stat = fs.statSync(cachedInstallerPath);
            if (stat.size > 10 * 1024 * 1024) {
                console.log(`✓ 使用缓存的安装包路径: ${cachedInstallerPath}`);
                return {
                    path: cachedInstallerPath,
                    size: stat.size,
                    fileName: path.basename(cachedInstallerPath)
                };
            }
        } catch (e) {}
    }
    
    // 构造预期的文件名（使用标准化的版本号）
    let expectedFileName = null;
    if (process.platform === 'win32') {
        expectedFileName = `StudentInfoTool-Setup-${normalizedVersion}.exe`;
    } else if (process.platform === 'darwin') {
        expectedFileName = `StudentInfoTool-${normalizedVersion}.dmg`;
    } else {
        expectedFileName = `StudentInfoTool-${normalizedVersion}.AppImage`;
    }
    
    console.log('预期文件名:', expectedFileName);
    
    // 检查所有可能的位置
    const possibleDirs = [
        path.join(downloadDir, 'pending'),
        downloadDir,
        path.join(app.getPath('userData'), 'pending'),
        path.join(app.getPath('userData'), app.getName() + '-updater', 'pending'),
        // Windows Local 目录
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, app.getName(), 'pending') : null,
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, app.getName() + '-updater', 'pending') : null,
        // autoUpdater 的 cacheDir
        autoUpdater.cacheDir ? path.join(autoUpdater.cacheDir, 'pending') : null,
        autoUpdater.cacheDir || null,
        // 临时目录
        path.join(require('os').tmpdir(), 'StudentInfoTool-updater'),
    ].filter(d => d && d.length > 0);
    
    console.log('检查目录列表:', possibleDirs);
    
    for (const dir of possibleDirs) {
        if (!fs.existsSync(dir)) {
            continue;
        }
        
        console.log(`检查目录: ${dir}`);
        
        const expectedPath = path.join(dir, expectedFileName);
        
        // 检查精确匹配的文件
        if (fs.existsSync(expectedPath)) {
            try {
                const stat = fs.statSync(expectedPath);
                // 检查文件大小是否合理（至少 10MB）
                if (stat.size > 10 * 1024 * 1024) {
                    console.log(`✓ 发现已下载的安装包: ${expectedPath}`);
                    console.log(`  文件大小: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
                    cachedInstallerPath = expectedPath;
                    return {
                        path: expectedPath,
                        size: stat.size,
                        fileName: expectedFileName
                    };
                }
            } catch (e) {
                console.log(`检查文件失败: ${expectedPath}`, e.message);
            }
        }
        
        // 检查目录中是否有匹配的文件（模糊匹配）
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fileLower = file.toLowerCase();
                // 匹配多种可能的文件名格式
                const isSetupFile = (
                    (fileLower.includes('setup') || fileLower.includes('studentinfotool')) &&
                    (file.includes(normalizedVersion) || file.includes(version)) &&
                    (file.endsWith('.exe') || file.endsWith('.dmg') || file.endsWith('.AppImage'))
                );
                
                if (isSetupFile) {
                    const filePath = path.join(dir, file);
                    try {
                        const stat = fs.statSync(filePath);
                        if (stat.size > 10 * 1024 * 1024) {
                            console.log(`✓ 发现已下载的安装包（模糊匹配）: ${filePath}`);
                            console.log(`  文件大小: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
                            cachedInstallerPath = filePath;
                            return {
                                path: filePath,
                                size: stat.size,
                                fileName: file
                            };
                        }
                    } catch (e) {
                        // 忽略单个文件的错误
                    }
                }
            }
        } catch (e) {
            // 目录不可读，跳过
        }
    }
    
    console.log('未找到已下载的安装包');
    return null;
}

// IPC: 开始下载更新
// 使用 electron-updater 的 downloadUpdate() 实现差量更新
// 通过修改 updateInfo 中的 URL 实现镜像加速
ipcMain.on('download-update', async (event) => {
    console.log('=== 开始下载更新 ===');
    
    try {
        // 检查是否有更新信息
        if (!currentUpdateInfo) {
            throw new Error('没有可用的更新信息，请先检查更新');
        }
        
        const version = currentUpdateInfo.version;
        console.log('目标版本:', version);
        
        // ============ 检查是否已有完整的安装包 ============
        const downloadDir = getDownloadDir();
        const existingDownload = checkExistingDownload(version, downloadDir);
        
        if (existingDownload) {
            console.log('=== 发现已有完整安装包，跳过下载 ===');
            console.log('文件路径:', existingDownload.path);
            console.log('文件大小:', (existingDownload.size / (1024 * 1024)).toFixed(2), 'MB');
            
            // 直接发送下载完成事件
            event.reply('update-downloading', { mirrorName: '本地缓存' });
            
            // 模拟进度 100%
            setTimeout(() => {
                if (mainWindow) {
                    mainWindow.webContents.send('update-progress', {
                        percent: 100,
                        bytesPerSecond: 0,
                        transferred: existingDownload.size,
                        total: existingDownload.size,
                        mirrorName: '本地缓存（已下载）'
                    });
                }
            }, 100);
            
            // 触发下载完成
            setTimeout(() => {
                if (mainWindow) {
                    mainWindow.webContents.send('update-downloaded', {
                        version: version,
                        releaseNotes: currentUpdateInfo.releaseNotes || '',
                        releaseDate: currentUpdateInfo.releaseDate || ''
                    });
                }
                console.log('✓ 使用已有安装包，无需重新下载');
            }, 500);
            
            return;
        }
        
        console.log('未找到已有安装包，开始下载...');
        // ============ 检查结束 ============
        
        // 重置镜像状态（开始新的下载尝试）
        currentMirrorState.mirrorIndex = 0;
        currentMirrorState.originalUrls = {};
        currentMirrorState.retryCount = 0;  // 重置重试计数
        
        // 获取当前使用的镜像名称（重置后应该是第一个镜像）
        let mirrorName = null;
        const currentMirror = GITHUB_MIRRORS[currentMirrorState.mirrorIndex];
        if (currentMirror) {
            mirrorName = currentMirror.name;
        }
        
        // 发送下载开始事件，包含镜像信息
        event.reply('update-downloading', {
            mirrorName: mirrorName
        });
        
        // 修改 updateInfo 中的 URL 为镜像 URL（加速下载）
        // electron-updater 会使用 autoUpdater.updateInfo 中的 URL 下载
        // 同时也要修改 currentUpdateInfo，确保一致性
        if (currentUpdateInfo && currentUpdateInfo.files) {
            console.log('=== 下载前确保使用镜像 URL ===');
            currentUpdateInfo.files.forEach((file, index) => {
                if (file.url && file.url.includes('github.com')) {
                    // 先提取原始 URL（如果已经是镜像 URL，先还原）
                    const originalUrl = extractOriginalUrl(file.url);
                    // 保存原始 URL（用于镜像切换）
                    currentMirrorState.originalUrls[index] = originalUrl;
                    const mirrorUrl = transformToMirrorUrl(originalUrl, 0);  // 使用第一个镜像
                    file.url = mirrorUrl;
                    console.log(`文件 ${index + 1}:`);
                    console.log(`  原始 URL: ${originalUrl}`);
                    console.log(`  镜像 URL: ${mirrorUrl} (镜像: ${GITHUB_MIRRORS[0].name})`);
                }
            });
        }
        
        if (autoUpdater.updateInfo && autoUpdater.updateInfo.files) {
            console.log('=== 修改 autoUpdater.updateInfo 中的 URL 为镜像 ===');
            autoUpdater.updateInfo.files.forEach((file, index) => {
                // 优先使用已保存的原始 URL，否则从当前 URL 提取
                let originalUrl = currentMirrorState.originalUrls[index];
                if (!originalUrl && file.url) {
                    originalUrl = extractOriginalUrl(file.url);
                    // 保存原始 URL
                    currentMirrorState.originalUrls[index] = originalUrl;
                }
                
                if (originalUrl && originalUrl.includes('github.com')) {
                    const mirrorUrl = transformToMirrorUrl(originalUrl, 0);  // 使用第一个镜像
                    file.url = mirrorUrl;
                    console.log(`autoUpdater 文件 ${index + 1}:`);
                    console.log(`  原始 URL: ${originalUrl}`);
                    console.log(`  镜像 URL: ${mirrorUrl} (镜像: ${GITHUB_MIRRORS[0].name})`);
                }
            });
        }
        
        // 使用 electron-updater 的原生 downloadUpdate()
        // 它会自动处理差量更新（如果有旧版本的 blockmap）
        console.log('使用 electron-updater 的 downloadUpdate()...');
        console.log('支持差量更新：如果有旧版本，只会下载变化的部分');
        
        await autoUpdater.downloadUpdate();
        
        // downloadUpdate 成功后，update-downloaded 事件会自动触发
        console.log('✓ 下载命令已发送，等待完成...');
        
    } catch (error) {
        console.error('下载更新失败:', error);
        const errorMessage = error.message || '未知错误';
        event.reply('update-error', `下载失败: ${errorMessage}`);
    }
});

// 存储待安装的更新路径（用于退出后启动安装程序）
let pendingInstallerPath = null;

// IPC: 安装更新（退出并安装）
ipcMain.on('install-update', async (event) => {
    console.log('=== 准备安装更新 ===');
    
    // 通知前端正在安装
    if (mainWindow) {
        mainWindow.webContents.send('update-installing', { percent: 0, status: '正在准备安装...' });
    }
    
    try {
        // 按优先级查找安装包路径
        // 1. 首先检查缓存的安装包路径（跳过下载时使用的）
        // 2. 然后检查 electron-updater 下载的文件
        // 3. 最后在缓存目录中搜索
        
        const version = currentUpdateInfo?.version;
        let foundPath = null;
        
        // 1. 检查缓存的路径
        if (cachedInstallerPath && fs.existsSync(cachedInstallerPath)) {
            console.log('使用缓存的安装包路径:', cachedInstallerPath);
            foundPath = cachedInstallerPath;
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
        
        pendingInstallerPath = foundPath;
        
        console.log('安装包路径:', pendingInstallerPath);
        console.log('文件大小:', (fs.statSync(pendingInstallerPath).size / (1024 * 1024)).toFixed(2), 'MB');
        
        const installerDir = path.dirname(pendingInstallerPath);
        const installerName = path.basename(pendingInstallerPath);
        const currentPid = process.pid;
        const tempDir = app.getPath('temp');
        const userDataDir = app.getPath('userData');
        const newVersion = currentUpdateInfo?.version || 'unknown';
        
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
安装包路径: ${pendingInstallerPath}
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
        const vbsContent = `
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

installerPath = "${pendingInstallerPath.replace(/\\/g, '\\\\')}"
markerPath = "${updateMarkerPath.replace(/\\/g, '\\\\')}"
logPath = "${logPath.replace(/\\/g, '\\\\')}"
targetPid = "${currentPid}"
newVersion = "${newVersion}"

Sub WriteLog(msg)
    On Error Resume Next
    Set f = fso.OpenTextFile(logPath, 8, True)
    f.WriteLine "[" & Now & "] " & msg
    f.Close
End Sub

Function IsProcessRunning(pid)
    On Error Resume Next
    Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")
    Set ps = wmi.ExecQuery("Select * from Win32_Process Where ProcessId=" & pid)
    IsProcessRunning = (ps.Count > 0)
End Function

WriteLog "VBS Script started"
WriteLog "Installer: " & installerPath
WriteLog "Waiting for PID: " & targetPid

' Wait for app to exit (max 30 seconds)
waitCount = 0
Do While IsProcessRunning(targetPid) And waitCount < 30
    WScript.Sleep 1000
    waitCount = waitCount + 1
Loop

WriteLog "App exited, waiting 2 seconds..."
WScript.Sleep 2000

' Check installer exists
If Not fso.FileExists(installerPath) Then
    WriteLog "ERROR: Installer not found: " & installerPath
    MsgBox "Installer not found!", vbCritical, "Update Error"
    WScript.Quit 1
End If

WriteLog "Starting installer..."

' Run installer and wait
ret = WshShell.Run("""" & installerPath & """", 1, True)

WriteLog "Installer finished with code: " & ret

' Create marker file
Set f = fso.CreateTextFile(markerPath, True)
f.WriteLine "{""version"":""" & newVersion & """,""time"":""" & Now & """,""ok"":true}"
f.Close

WriteLog "Update complete"

' Cleanup
On Error Resume Next
fso.DeleteFile WScript.ScriptFullName
`;

        // 使用 UTF-16 LE 编码保存 VBScript（Windows 原生支持）
        const BOM = '\ufeff';
        fs.writeFileSync(vbsPath, BOM + vbsContent, { encoding: 'utf16le' });
        console.log('已创建 VBS 安装脚本:', vbsPath);
        console.log('安装包路径:', pendingInstallerPath);
        
        fs.appendFileSync(logPath, `[${new Date().toLocaleString()}] VBS script created: ${vbsPath}\n`, 'utf8');
        fs.appendFileSync(logPath, `[${new Date().toLocaleString()}] Installer path: ${pendingInstallerPath}\n`, 'utf8');
        
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
        if (mainWindow) {
            mainWindow.webContents.send('update-error', `安装失败: ${err.message}`);
        }
    }
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
    console.log('开始清理缓存...');
    let success = true;
    let errorMessages = [];
    
    try {
        const cachePath = app.getPath('userData');
        const cacheDir = path.join(cachePath, 'Cache');
        const gpuCacheDir = path.join(cachePath, 'GPUCache');
        
        // 1. 清理浏览器缓存目录
        if (fs.existsSync(cacheDir)) {
            try {
                console.log('清理 Cache 目录:', cacheDir);
                // 使用强制删除函数（带重试机制）
                const removed = await forceRemoveDir(cacheDir, 3);
                if (removed) {
                    console.log('✓ Cache 目录已清理');
                } else {
                    throw new Error('强制删除失败');
                }
            } catch (e) {
                console.warn('清理 Cache 目录失败:', e.message);
                errorMessages.push(`Cache 目录: ${e.message}`);
                success = false;
            }
        }
        
        // 2. 清理 GPU 缓存目录
        if (fs.existsSync(gpuCacheDir)) {
            try {
                console.log('清理 GPUCache 目录:', gpuCacheDir);
                // 使用强制删除函数（带重试机制）
                const removed = await forceRemoveDir(gpuCacheDir, 3);
                if (removed) {
                    console.log('✓ GPUCache 目录已清理');
                } else {
                    throw new Error('强制删除失败');
                }
            } catch (e) {
                console.warn('清理 GPUCache 目录失败:', e.message);
                errorMessages.push(`GPUCache 目录: ${e.message}`);
                success = false;
            }
        }
        
        // 3. 清理安装包（重要：避免占用磁盘空间）
        console.log('开始清理安装包...');
        try {
            await cleanupUpdateCache();
            console.log('✓ 安装包清理完成');
        } catch (e) {
            console.warn('清理安装包失败:', e.message);
            errorMessages.push(`安装包: ${e.message}`);
            // 安装包清理失败不影响整体结果，但记录错误
        }
        
        // 如果所有清理都成功，返回成功
        if (success && errorMessages.length === 0) {
            console.log('✓ 所有缓存清理完成');
            event.reply('cache-cleared', true);
        } else {
            // 部分成功，返回成功但记录警告
            if (errorMessages.length > 0) {
                console.warn('部分清理失败:', errorMessages.join('; '));
            }
            // 即使有部分失败，也返回成功（因为主要清理已完成）
            event.reply('cache-cleared', true);
        }
    } catch (e) {
        console.error('清理缓存时发生严重错误:', e);
        console.error('错误堆栈:', e.stack);
        event.reply('cache-cleared', false);
    }
});

// 获取缓存大小（包括安装包）
ipcMain.on('get-cache-size', async (event) => {
    try {
        const cachePath = app.getPath('userData');
        let totalSize = 0;
        
        const getDirSize = async (dirPath) => {
            if (!fs.existsSync(dirPath)) return 0;
            let size = 0;
            try {
                const files = await fs.readdir(dirPath);
                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    try {
                        const stat = await fs.stat(filePath);
                        if (stat.isDirectory()) {
                            size += await getDirSize(filePath);
                        } else {
                            size += stat.size;
                        }
                    } catch (e) {
                        // 忽略无法访问的文件（可能被占用）
                        console.warn(`无法获取文件大小: ${filePath}`, e.message);
                    }
                }
            } catch (e) {
                // 忽略无法读取的目录
                console.warn(`无法读取目录: ${dirPath}`, e.message);
            }
            return size;
        };
        
        // 1. 浏览器缓存
        const cacheDir = path.join(cachePath, 'Cache');
        const gpuCacheDir = path.join(cachePath, 'GPUCache');
        
        totalSize += await getDirSize(cacheDir);
        totalSize += await getDirSize(gpuCacheDir);
        
        // 2. 安装包缓存（Local 目录 - Windows 上实际使用的）
        if (process.platform === 'win32') {
            try {
                const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
                const localPendingDir = path.join(localAppData, app.getName(), 'pending');
                const localUpdaterCacheDir = path.join(localAppData, app.getName() + '-updater');
                
                totalSize += await getDirSize(localPendingDir);
                totalSize += await getDirSize(localUpdaterCacheDir);
            } catch (e) {
                console.warn('获取 Local 目录安装包大小失败:', e.message);
            }
        }
        
        // 3. 安装包缓存（Roaming 目录）
        const defaultPendingDir = path.join(cachePath, 'pending');
        const updaterCacheDir = path.join(cachePath, app.getName() + '-updater');
        
        totalSize += await getDirSize(defaultPendingDir);
        totalSize += await getDirSize(updaterCacheDir);
        
        // 4. 下载目录中的安装包（resources 目录）
        const resourcesDir = getDownloadDir();
        if (fs.existsSync(resourcesDir)) {
            try {
                const files = await fs.readdir(resourcesDir);
                for (const file of files) {
                    // 只统计安装包文件（.exe, .dmg, .AppImage, .deb, .rpm 等）
                    if (file.match(/\.(exe|dmg|AppImage|deb|rpm|blockmap)$/i)) {
                        const filePath = path.join(resourcesDir, file);
                        try {
                            const stat = await fs.stat(filePath);
                            if (!stat.isDirectory()) {
                                totalSize += stat.size;
                            }
                        } catch (e) {
                            console.warn(`无法获取安装包大小: ${filePath}`, e.message);
                        }
                    }
                }
                // 也检查 pending 子目录
                const pendingDir = path.join(resourcesDir, 'pending');
                totalSize += await getDirSize(pendingDir);
            } catch (e) {
                console.warn('获取 resources 目录安装包大小失败:', e.message);
            }
        }
        
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

