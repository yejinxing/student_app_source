const path = require('path');
const fs = require('fs-extra');
const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const { getMainWindow } = require('../window');
const { rootPath } = require('../paths');
const { getLocalUpdaterDirs } = require('./localDirs');
const { buildVbsScript } = require('./vbs');
const { REPO_OWNER, REPO_NAME, GITEE_OWNER, GITEE_REPO } = require('./config');
const { GITHUB_MIRRORS, extractOriginalUrl, transformToMirrorUrl } = require('./mirror');
const { httpGet } = require('./http');
const { getLatestVersionFromGitee } = require('./gitee');
const { formatSize, getPlatformName, compareVersion } = require('./utils');
const { getDownloadDir, cleanupUpdateCache, getAppInstallDir } = require('./cacheCleanup');

// 配置 autoUpdater - 从 Gitee 获取元数据，从 GitHub 镜像下载安装包
autoUpdater.autoDownload = false; // 不自动下载，等用户确认
autoUpdater.autoInstallOnAppQuit = false; // 不在退出时自动安装，我们手动控制

// 注意：cacheDir 已在 setFeedURL 之前设置


// 配置更新源：从 Gitee 获取 latest.yml（元数据文件小，国内访问快）
// 注意：feedUrl 会在检查更新时动态设置
// 初始化时设置一个默认的 feedUrl（会在检查更新时更新）
// 现在所有平台都使用统一的 latest.yml（包含所有平台的文件信息）
let feedUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/latest/latest.yml`;


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
    const devUpdateConfigPath = rootPath('dev-app-update.yml');
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

// autoUpdater 事件监听
autoUpdater.on('checking-for-update', () => {
    console.log('正在检查更新...');
});

// 存储手动获取的 release notes（在 check-for-updates 中设置）
let manualReleaseInfo = null;

autoUpdater.on('update-available', (info) => {
    console.log('发现新版本:', info.version);

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
    
    if (getMainWindow()) {
        // 优先使用手动获取的 release notes（如果存在）
        const finalReleaseNotes = manualReleaseInfo?.releaseNotes || info.releaseNotes || '暂无更新说明';
        const finalReleaseDate = manualReleaseInfo?.releaseDate || (info.releaseDate ? info.releaseDate.split('T')[0] : '未知');
        
        getMainWindow().webContents.send('update-available', {
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
    if (getMainWindow()) {
        getMainWindow().webContents.send('update-not-available', {
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
    
    if (getMainWindow()) {
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
        
        getMainWindow().webContents.send('update-progress', progressData);
    }
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('更新下载完成:', info.version);
    
    // 记录所有可能的安装包位置（用于安装后清理）
    const defaultPendingDir = path.join(app.getPath('userData'), 'pending');
    const updaterCacheDir = path.join(app.getPath('userData'), app.getName() + '-updater');
    const updaterPendingDir = path.join(updaterCacheDir, 'pending');
    const { localPendingDir, localUpdaterCacheDir } = getLocalUpdaterDirs({ appName: app.getName() });
    
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
    
    if (getMainWindow()) {
        getMainWindow().webContents.send('update-downloaded', {
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
            if (getMainWindow()) {
                let retryMessage = `镜像 ${currentMirror.name} 连接失败，正在重试 (${currentMirrorState.retryCount}/${currentMirrorState.maxRetriesPerMirror})...`;
                if (partialDownloadInfo) {
                    const downloadedMB = (partialDownloadInfo.size / (1024 * 1024)).toFixed(2);
                    retryMessage += ` (已下载 ${downloadedMB} MB，将尝试断点续传)`;
                }
                getMainWindow().webContents.send('update-retrying', {
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
            if (getMainWindow()) {
                let retryMessage = `镜像 ${currentMirror.name} 连接失败，正在尝试 ${nextMirror.name}...`;
                if (partialDownloadInfo) {
                    const downloadedMB = (partialDownloadInfo.size / (1024 * 1024)).toFixed(2);
                    retryMessage += ` (已下载 ${downloadedMB} MB，将尝试断点续传)`;
                }
                getMainWindow().webContents.send('update-retrying', {
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
                        if (getMainWindow()) {
                            getMainWindow().webContents.send('update-error', '所有镜像下载都失败，请稍后重试或手动下载');
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
    if (getMainWindow()) {
        getMainWindow().webContents.send('update-error', `下载失败: ${errorMessage}`);
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
            if (getMainWindow()) {
                getMainWindow().webContents.send('update-not-available', {
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
            if (getMainWindow()) {
                // 确保 currentUpdateInfo 已设置，这样 downloadUpdate() 可以使用它
                currentUpdateInfo = updateInfo;
                
                getMainWindow().webContents.send('update-available', {
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
            if (getMainWindow()) {
                getMainWindow().webContents.send('update-available-silent', {
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
                if (getMainWindow()) {
                    getMainWindow().webContents.send('update-progress', {
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
                if (getMainWindow()) {
                    getMainWindow().webContents.send('update-downloaded', {
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
    if (getMainWindow()) {
        getMainWindow().webContents.send('update-installing', { percent: 0, status: '正在准备安装...' });
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

        if (process.platform !== 'win32') {
            throw new Error(`当前平台请手动运行安装包: ${pendingInstallerPath}`);
        }

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
        const vbsContent = buildVbsScript({
            installerPath: pendingInstallerPath,
            markerPath: updateMarkerPath,
            logPath,
            pid: currentPid,
            newVersion
        });

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
        if (getMainWindow()) {
            getMainWindow().webContents.send('update-error', `安装失败: ${err.message}`);
        }
    }
});

// IPC: 取消下载
ipcMain.on('cancel-download', () => {
    console.log('取消下载');
    // electron-updater 没有内置取消功能，但可以通过重新检查来重置状态
});

module.exports = { cleanupUpdateCache, getDownloadDir, getAppInstallDir };
