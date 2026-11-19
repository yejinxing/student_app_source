const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const { appRoot } = require('../paths');
const { forceRemoveDir, cleanupDirRecursively } = require('../fs-utils');

function getAppInstallDir() {
    if (!app.isPackaged) {
        return appRoot();
    }

    const exePath = app.getPath('exe');
    const exeDir = path.dirname(exePath);

    console.log('[Debug] 可执行文件路径:', exePath);
    console.log('[Debug] 可执行文件目录:', exeDir);

    if (exeDir.includes('resources')) {
        const installDir = path.dirname(path.dirname(exeDir));
        console.log('[Debug] 检测到 resources 目录，应用安装目录:', installDir);
        return installDir;
    }

    console.log('[Debug] exe 在安装目录下，应用安装目录:', exeDir);
    return exeDir;
}

function getDownloadDir() {
    if (!app.isPackaged) {
        return path.join(appRoot(), 'resources');
    }

    const installDir = getAppInstallDir();
    const downloadDir = path.join(installDir, 'resources');
    console.log('[Debug] 下载目录:', downloadDir);
    return downloadDir;
}

async function cleanupUpdateCache() {
    const timestamp = new Date().toISOString();
    console.log(`=== [${timestamp}] 开始清理更新缓存 ===`);
    let cleanedCount = 0;
    const cleanedCountRef = { count: 0 };

    const cleanupMarkerPath = path.join(app.getPath('userData'), 'cleanup-marker.json');
    const hasCleanupMarker = fs.existsSync(cleanupMarkerPath);
    if (hasCleanupMarker) {
        console.log('检测到清理标记，这是安装后的首次启动，将执行完整清理');
    } else {
        console.log('未检测到清理标记，执行常规清理检查');
    }

    try {
        if (fs.existsSync(cleanupMarkerPath)) {
            try {
                const marker = JSON.parse(fs.readFileSync(cleanupMarkerPath, 'utf8'));
                console.log('发现清理标记（版本:', marker.version || '未知', '），开始清理安装包...');

                if (marker.actualPendingDir && fs.existsSync(marker.actualPendingDir)) {
                    try {
                        await forceRemoveDir(marker.actualPendingDir);
                        console.log('✓ 已清理安装包目录:', marker.actualPendingDir);
                        cleanedCount++;
                    } catch (e) {
                        console.warn('清理安装包目录失败:', marker.actualPendingDir, e.message);
                    }
                }

                const dirsToClean = [
                    marker.defaultPendingDir,
                    marker.updaterPendingDir,
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

                if (marker.updaterCacheDir && fs.existsSync(marker.updaterCacheDir)) {
                    try {
                        await forceRemoveDir(marker.updaterCacheDir);
                        console.log('✓ 已清理 updater 缓存目录:', marker.updaterCacheDir);
                        cleanedCount++;
                    } catch (e) {
                        console.warn('清理 updater 缓存目录失败:', marker.updaterCacheDir, e.message);
                    }
                }

                fs.unlinkSync(cleanupMarkerPath);
                console.log('已删除清理标记');
            } catch (e) {
                console.warn('处理清理标记失败:', e.message);
            }
        }

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

        let localPendingDir = null;
        if (process.platform === 'win32') {
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
                await cleanupDirRecursively(updaterCacheDir, cleanedCountRef);
            }
        }

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
                    await cleanupDirRecursively(localUpdaterCacheDir, cleanedCountRef);
                }
            }

            const localAppDir = path.join(localAppData, app.getName());
            if (fs.existsSync(localAppDir)) {
                const files = fs.readdirSync(localAppDir);
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

        const resourcesDir = getDownloadDir();
        if (fs.existsSync(resourcesDir)) {
            try {
                const files = fs.readdirSync(resourcesDir);
                files.forEach(file => {
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

module.exports = { getAppInstallDir, getDownloadDir, cleanupUpdateCache };
