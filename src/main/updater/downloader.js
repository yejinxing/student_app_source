const { ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const { getMainWindow } = require('../window');
const { GITHUB_MIRRORS, extractOriginalUrl, transformToMirrorUrl } = require('./mirror');
const { getDownloadDir } = require('./cacheCleanup');
const { checkExistingDownload } = require('./installerFinder');
const state = require('./state');

function registerDownloadIpc() {
    // IPC: 开始下载更新
    // 使用 electron-updater 的 downloadUpdate() 实现差量更新
    // 通过修改 updateInfo 中的 URL 实现镜像加速
    ipcMain.on('download-update', async (event) => {
        console.log('=== 开始下载更新 ===');
        
        try {
            // 检查是否有更新信息
            if (!state.currentUpdateInfo) {
                throw new Error('没有可用的更新信息，请先检查更新');
            }
            
            const version = state.currentUpdateInfo.version;
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
                            releaseNotes: state.currentUpdateInfo.releaseNotes || '',
                            releaseDate: state.currentUpdateInfo.releaseDate || ''
                        });
                    }
                    console.log('✓ 使用已有安装包，无需重新下载');
                }, 500);
                
                return;
            }
            
            console.log('未找到已有安装包，开始下载...');
            // ============ 检查结束 ============
            
            // 重置镜像状态（开始新的下载尝试）
            state.currentMirrorState.mirrorIndex = 0;
            state.currentMirrorState.originalUrls = {};
            state.currentMirrorState.retryCount = 0;  // 重置重试计数
            
            // 获取当前使用的镜像名称（重置后应该是第一个镜像）
            let mirrorName = null;
            const currentMirror = GITHUB_MIRRORS[state.currentMirrorState.mirrorIndex];
            if (currentMirror) {
                mirrorName = currentMirror.name;
            }
            
            // 发送下载开始事件，包含镜像信息
            event.reply('update-downloading', {
                mirrorName: mirrorName
            });
            
            // 修改 updateInfo 中的 URL 为镜像 URL（加速下载）
            // electron-updater 会使用 autoUpdater.updateInfo 中的 URL 下载
            // 同时也要修改 state.currentUpdateInfo，确保一致性
            if (state.currentUpdateInfo && state.currentUpdateInfo.files) {
                console.log('=== 下载前确保使用镜像 URL ===');
                state.currentUpdateInfo.files.forEach((file, index) => {
                    if (file.url && file.url.includes('github.com')) {
                        // 先提取原始 URL（如果已经是镜像 URL，先还原）
                        const originalUrl = extractOriginalUrl(file.url);
                        // 保存原始 URL（用于镜像切换）
                        state.currentMirrorState.originalUrls[index] = originalUrl;
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
                    let originalUrl = state.currentMirrorState.originalUrls[index];
                    if (!originalUrl && file.url) {
                        originalUrl = extractOriginalUrl(file.url);
                        // 保存原始 URL
                        state.currentMirrorState.originalUrls[index] = originalUrl;
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
}

module.exports = { registerDownloadIpc };
