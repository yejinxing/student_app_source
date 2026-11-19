const path = require('path');
const fs = require('fs-extra');
const { ipcMain, app } = require('electron');
const { forceRemoveDir } = require('../fs-utils');
const { cleanupUpdateCache, getDownloadDir } = require('../updater');

function registerCacheIpc() {
    ipcMain.on('clear-cache', async (event) => {
        console.log('开始清理缓存...');
        let success = true;
        const errorMessages = [];

        try {
            const cachePath = app.getPath('userData');
            const cacheDir = path.join(cachePath, 'Cache');
            const gpuCacheDir = path.join(cachePath, 'GPUCache');

            if (fs.existsSync(cacheDir)) {
                try {
                    console.log('清理 Cache 目录:', cacheDir);
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

            if (fs.existsSync(gpuCacheDir)) {
                try {
                    console.log('清理 GPUCache 目录:', gpuCacheDir);
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

            console.log('开始清理安装包...');
            try {
                await cleanupUpdateCache();
                console.log('✓ 安装包清理完成');
            } catch (e) {
                console.warn('清理安装包失败:', e.message);
                errorMessages.push(`安装包: ${e.message}`);
            }

            if (success && errorMessages.length === 0) {
                console.log('✓ 所有缓存清理完成');
                event.reply('cache-cleared', true);
            } else {
                if (errorMessages.length > 0) {
                    console.warn('部分清理失败:', errorMessages.join('; '));
                }
                event.reply('cache-cleared', true);
            }
        } catch (e) {
            console.error('清理缓存时发生严重错误:', e);
            console.error('错误堆栈:', e.stack);
            event.reply('cache-cleared', false);
        }
    });

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
                            console.warn(`无法获取文件大小: ${filePath}`, e.message);
                        }
                    }
                } catch (e) {
                    console.warn(`无法读取目录: ${dirPath}`, e.message);
                }
                return size;
            };

            const cacheDir = path.join(cachePath, 'Cache');
            const gpuCacheDir = path.join(cachePath, 'GPUCache');

            totalSize += await getDirSize(cacheDir);
            totalSize += await getDirSize(gpuCacheDir);

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

            const defaultPendingDir = path.join(cachePath, 'pending');
            const updaterCacheDir = path.join(cachePath, app.getName() + '-updater');

            totalSize += await getDirSize(defaultPendingDir);
            totalSize += await getDirSize(updaterCacheDir);

            const resourcesDir = getDownloadDir();
            if (fs.existsSync(resourcesDir)) {
                try {
                    const files = await fs.readdir(resourcesDir);
                    for (const file of files) {
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
                    const pendingDir = path.join(resourcesDir, 'pending');
                    totalSize += await getDirSize(pendingDir);
                } catch (e) {
                    console.warn('获取 resources 目录安装包大小失败:', e.message);
                }
            }

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
}

module.exports = { registerCacheIpc };
