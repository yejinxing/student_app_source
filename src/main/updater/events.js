const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const { getMainWindow } = require('../window');
const { getLocalUpdaterDirs } = require('./localDirs');
const { GITHUB_MIRRORS, extractOriginalUrl, transformToMirrorUrl } = require('./mirror');
const { formatSize, getPlatformName } = require('./utils');
const state = require('./state');

function registerUpdaterEvents() {
    // autoUpdater 事件监听
    autoUpdater.on('checking-for-update', () => {
        console.log('正在检查更新...');
    });

    // 存储手动获取的 release notes（在 check-for-updates 中设置）

    autoUpdater.on('update-available', (info) => {
        console.log('发现新版本:', info.version);

        state.currentUpdateInfo = info; // 保存更新信息用于自定义下载
        
        // 修改下载 URL 为 GitHub 镜像（如果 URL 指向 GitHub）
        // 在 update-available 事件中立即转换，确保后续下载使用镜像
        if (info.files && info.files.length > 0) {
            console.log('=== update-available 事件中转换 GitHub URL 为镜像 ===');
            // 确保镜像状态已初始化
            if (!state.currentMirrorState.originalUrls || Object.keys(state.currentMirrorState.originalUrls).length === 0) {
                state.currentMirrorState.mirrorIndex = 0;
                state.currentMirrorState.originalUrls = {};
            }
            
            info.files.forEach((file, index) => {
                if (file.url && file.url.includes('github.com')) {
                    // 先提取原始 URL（如果已经是镜像 URL，先还原）
                    const originalUrl = extractOriginalUrl(file.url);
                    // 保存原始 URL（如果还没有保存）
                    if (!state.currentMirrorState.originalUrls[index]) {
                        state.currentMirrorState.originalUrls[index] = originalUrl;
                    }
                    // 立即转换为镜像 URL（使用已保存的原始 URL）
                    const originalUrlToUse = state.currentMirrorState.originalUrls[index] || originalUrl;
                    const mirrorUrl = transformToMirrorUrl(originalUrlToUse, state.currentMirrorState.mirrorIndex);
                    file.url = mirrorUrl;
                    console.log(`文件 ${index + 1}:`);
                    console.log(`  原始 URL: ${originalUrlToUse}`);
                    console.log(`  镜像 URL: ${mirrorUrl} (镜像: ${GITHUB_MIRRORS[state.currentMirrorState.mirrorIndex].name})`);
                }
            });
        }
        
        if (getMainWindow()) {
            // 优先使用手动获取的 release notes（如果存在）
            const finalReleaseNotes = state.manualReleaseInfo?.releaseNotes || info.releaseNotes || '暂无更新说明';
            const finalReleaseDate = state.manualReleaseInfo?.releaseDate || (info.releaseDate ? info.releaseDate.split('T')[0] : '未知');
            
            getMainWindow().webContents.send('update-available', {
                currentVersion: app.getVersion(),
                version: info.version,
                releaseDate: finalReleaseDate,
                releaseNotes: finalReleaseNotes,
                size: formatSize(info.files?.[0]?.size),
                platform: getPlatformName()
            });
            
            // 清除手动获取的信息（避免影响下次检查）
            state.manualReleaseInfo = null;
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
        if (state.updateErrorPending) {
            console.log('检测到下载进度更新，清除待处理的错误');
            state.updateErrorPending = null;
        }
        
        const speed = formatSize(progressObj.bytesPerSecond) + '/s';
        const percent = Math.round(progressObj.percent * 10) / 10;
        const transferred = formatSize(progressObj.transferred);
        const total = formatSize(progressObj.total);
        
        // 获取当前使用的镜像名称
        let mirrorName = null;
        if (state.currentMirrorState && state.currentMirrorState.mirrorIndex !== undefined) {
            const currentMirror = GITHUB_MIRRORS[state.currentMirrorState.mirrorIndex];
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
        state.updateErrorPending = pendingError;
        
        setTimeout(async () => {
            // 如果5秒后 state.updateErrorPending 还是当前错误，说明没有新的进度更新
            if (state.updateErrorPending !== pendingError) {
                console.log('检测到新的下载进度或错误已被处理，忽略此错误');
                return;
            }
            
            console.log('5秒内没有新的下载进度，开始处理错误');
            state.updateErrorPending = null;
            
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
        if (isConnectionError && state.currentUpdateInfo && state.currentUpdateInfo.files) {
            const currentMirror = GITHUB_MIRRORS[state.currentMirrorState.mirrorIndex];
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
            if (state.currentMirrorState.retryCount < state.currentMirrorState.maxRetriesPerMirror) {
                state.currentMirrorState.retryCount++;
                console.log(`在同一镜像 ${currentMirror.name} 上重试 (${state.currentMirrorState.retryCount}/${state.currentMirrorState.maxRetriesPerMirror})...`);
                
                // 通知前端正在重试
                if (getMainWindow()) {
                    let retryMessage = `镜像 ${currentMirror.name} 连接失败，正在重试 (${state.currentMirrorState.retryCount}/${state.currentMirrorState.maxRetriesPerMirror})...`;
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
            if (state.currentMirrorState.mirrorIndex < GITHUB_MIRRORS.length - 1) {
                // 重置当前镜像的重试计数
                state.currentMirrorState.retryCount = 0;
                state.currentMirrorState.mirrorIndex++;
                const nextMirror = GITHUB_MIRRORS[state.currentMirrorState.mirrorIndex];
                console.log(`尝试切换到下一个镜像: ${nextMirror.name}`);
                
                // 如果有部分下载的文件，记录信息
                if (partialDownloadInfo) {
                    console.log(`注意: 检测到部分下载文件 (${(partialDownloadInfo.size / (1024 * 1024)).toFixed(2)} MB)，electron-updater 应该会自动断点续传`);
                }
                
                // 恢复原始 URL 并转换为新镜像 URL
                if (autoUpdater.updateInfo && autoUpdater.updateInfo.files) {
                    autoUpdater.updateInfo.files.forEach((file, index) => {
                        // 优先使用已保存的原始 URL，否则从当前 URL 提取
                        let originalUrl = state.currentMirrorState.originalUrls[index];
                        if (!originalUrl && file.url) {
                            originalUrl = extractOriginalUrl(file.url);
                            // 保存原始 URL（如果还没有保存）
                            state.currentMirrorState.originalUrls[index] = originalUrl;
                        }
                        
                        if (originalUrl && originalUrl.includes('github.com')) {
                            const mirrorUrl = transformToMirrorUrl(originalUrl, state.currentMirrorState.mirrorIndex);
                            file.url = mirrorUrl;
                            console.log(`文件 ${index + 1} 切换到镜像 ${nextMirror.name}: ${mirrorUrl}`);
                        }
                    });
                }
                
                // 同步更新 state.currentUpdateInfo
                state.currentUpdateInfo.files.forEach((file, index) => {
                    // 优先使用已保存的原始 URL，否则从当前 URL 提取
                    let originalUrl = state.currentMirrorState.originalUrls[index];
                    if (!originalUrl && file.url) {
                        originalUrl = extractOriginalUrl(file.url);
                        // 保存原始 URL（如果还没有保存）
                        state.currentMirrorState.originalUrls[index] = originalUrl;
                    }
                    
                    if (originalUrl && originalUrl.includes('github.com')) {
                        file.url = transformToMirrorUrl(originalUrl, state.currentMirrorState.mirrorIndex);
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
                        if (state.currentMirrorState.mirrorIndex >= GITHUB_MIRRORS.length - 1) {
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
}

module.exports = { registerUpdaterEvents };
