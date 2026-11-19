const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const { rootPath } = require('../paths');
const { GITEE_OWNER, GITEE_REPO } = require('./config');
const { getDownloadDir } = require('./cacheCleanup');

function setupAutoUpdater() {
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
}

module.exports = { setupAutoUpdater };
