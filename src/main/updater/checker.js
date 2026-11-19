const fs = require('fs-extra');
const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const { getMainWindow } = require('../window');
const { GITEE_OWNER, GITEE_REPO } = require('./config');
const { GITHUB_MIRRORS, extractOriginalUrl, transformToMirrorUrl } = require('./mirror');
const { httpGet } = require('./http');
const { getLatestVersionFromGitee } = require('./gitee');
const { formatSize, getPlatformName, compareVersion } = require('./utils');
const { getDownloadDir } = require('./cacheCleanup');
const state = require('./state');

function registerCheckerIpc() {
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
                state.currentMirrorState.mirrorIndex = 0;
                state.currentMirrorState.originalUrls = {};
                
                updateInfo.files.forEach((file, index) => {
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
            state.currentUpdateInfo = updateInfo;
            
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
            state.manualReleaseInfo = {
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
                            let originalUrl = state.currentMirrorState.originalUrls[index];
                            if (!originalUrl && file.url) {
                                originalUrl = extractOriginalUrl(file.url);
                                // 保存原始 URL（如果还没有保存）
                                state.currentMirrorState.originalUrls[index] = originalUrl;
                            }
                            
                            if (originalUrl) {
                                const mirrorUrl = transformToMirrorUrl(originalUrl, state.currentMirrorState.mirrorIndex);
                                file.url = mirrorUrl;
                                console.log(`文件 ${index + 1}:`);
                                console.log(`  原始 URL: ${originalUrl}`);
                                console.log(`  镜像 URL: ${mirrorUrl} (镜像: ${GITHUB_MIRRORS[state.currentMirrorState.mirrorIndex].name})`);
                            }
                        }
                    });
                    // 同步更新 state.currentUpdateInfo
                    if (state.currentUpdateInfo && state.currentUpdateInfo.files) {
                        state.currentUpdateInfo.files = autoUpdater.updateInfo.files;
                    }
                }
            } catch (checkError) {
                console.error('checkForUpdates() 调用失败:', checkError);
                // 如果 checkForUpdates 失败，我们需要确保 electron-updater 知道有更新可用
                // 手动触发 update-available 事件，并保存更新信息
                if (getMainWindow()) {
                    // 确保 state.currentUpdateInfo 已设置，这样 downloadUpdate() 可以使用它
                    state.currentUpdateInfo = updateInfo;
                    
                    getMainWindow().webContents.send('update-available', {
                        currentVersion: currentVersion,
                        version: updateVersion,
                        releaseDate: manualReleaseDate,
                        releaseNotes: manualReleaseNotes,
                        size: updateInfo.files?.[0]?.size ? formatSize(updateInfo.files[0].size) : '未知',
                        platform: getPlatformName()
                    });
                    state.manualReleaseInfo = null; // 清除
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
}

module.exports = { registerCheckerIpc };
