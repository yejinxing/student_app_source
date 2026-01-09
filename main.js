const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { convertExcelToWord } = require('./src/converter');
const fs = require('fs-extra');
const PhotoRenamer = require('./src/photoRenamer');
const xlsx = require('xlsx');

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

app.whenReady().then(createWindow);

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

// ===== 自动更新功能 =====
const https = require('https');
const http = require('http');

// 仓库信息
const REPO_OWNER = 'yejinxing';
const REPO_NAME = 'student_app_source';

// GitHub 镜像加速列表（按优先级排序）
const GITHUB_MIRRORS = [
    { name: 'ghproxy', prefix: 'https://mirror.ghproxy.com/' },
    { name: 'ghproxy.net', prefix: 'https://ghproxy.net/' },
    { name: 'gh-proxy', prefix: 'https://gh-proxy.com/' },
    { name: '直连', prefix: '' }
];

// API 端点
const API_ENDPOINTS = {
    // Gitee Tags API（用于检查版本，国内访问快）
    giteeTags: `https://gitee.com/api/v5/repos/${REPO_OWNER}/${REPO_NAME}/tags`,
    // GitHub Release API（用于获取安装包信息）
    githubRelease: `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
    githubReleaseByTag: (tag) => `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${tag}`
};

// 下载状态管理
let currentDownload = {
    path: null,
    controller: null,
    inProgress: false
};

let downloadPath = null;

// 获取远程 JSON 数据
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const options = {
            headers: {
                'User-Agent': 'StudentApp/' + app.getVersion()
            },
            timeout: 10000
        };
        
        const req = client.get(url, options, (res) => {
            // 处理重定向
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJSON(res.headers.location).then(resolve).catch(reject);
            }
            
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
    });
}

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

// 根据平台获取对应的安装包扩展名
function getPlatformAssetInfo() {
    const platform = process.platform;
    const arch = process.arch;
    
    switch (platform) {
        case 'win32':
            // Windows: 优先 Setup 安装版，其次 Portable 便携版
            return {
                extensions: ['-Setup-', '.exe'],
                patterns: [
                    (name) => name.includes('-Setup-') && name.endsWith('.exe'),
                    (name) => name.includes('-Portable-') && name.endsWith('.exe'),
                    (name) => name.endsWith('.exe') && !name.includes('.blockmap')
                ],
                platformName: 'Windows'
            };
        case 'darwin':
            // macOS: 根据架构选择 arm64 或 x64
            const macArch = arch === 'arm64' ? 'arm64' : 'x64';
            return {
                extensions: ['.dmg'],
                patterns: [
                    (name) => name.includes(`-macOS-${macArch}`) && name.endsWith('.dmg'),
                    (name) => name.includes('-macOS-') && name.endsWith('.dmg'),
                    (name) => name.endsWith('.dmg')
                ],
                platformName: `macOS (${macArch})`
            };
        case 'linux':
            // Linux: 优先 AppImage，其次 deb
            return {
                extensions: ['.AppImage', '.deb'],
                patterns: [
                    (name) => name.endsWith('.AppImage'),
                    (name) => name.endsWith('.deb'),
                    (name) => name.endsWith('.rpm')
                ],
                platformName: 'Linux'
            };
        default:
            return {
                extensions: ['.exe'],
                patterns: [(name) => name.endsWith('.exe')],
                platformName: '未知平台'
            };
    }
}

// 检查更新（使用 Gitee Tags API）
ipcMain.on('check-for-updates', async (event) => {
    const currentVersion = app.getVersion();
    const platformInfo = getPlatformAssetInfo();
    
    console.log(`当前平台: ${platformInfo.platformName}, 架构: ${process.arch}`);
    console.log(`当前版本: v${currentVersion}`);
    
    try {
        // 步骤1: 从 Gitee Tags API 获取最新版本
        console.log('正在从 Gitee 检查版本...');
        let latestVersion = null;
        let releaseInfo = null;
        
        try {
            const tags = await fetchJSON(API_ENDPOINTS.giteeTags);
            if (tags && tags.length > 0) {
                // 找到最新的版本标签（以 v 开头的）
                const versionTags = tags.filter(t => t.name && t.name.startsWith('v'));
                if (versionTags.length > 0) {
                    // 按版本号排序，取最新的
                    versionTags.sort((a, b) => compareVersion(b.name, a.name));
                    latestVersion = versionTags[0].name;
                    console.log(`Gitee 最新版本: ${latestVersion}`);
                }
            }
        } catch (e) {
            console.log('Gitee Tags API 失败:', e.message);
        }
        
        // 如果 Gitee 失败，尝试从 GitHub 获取
        if (!latestVersion) {
            console.log('尝试从 GitHub 获取版本信息...');
            try {
                releaseInfo = await fetchJSON(API_ENDPOINTS.githubRelease);
                latestVersion = releaseInfo.tag_name;
                console.log(`GitHub 最新版本: ${latestVersion}`);
            } catch (e) {
                console.log('GitHub API 也失败:', e.message);
                event.reply('update-error', '无法连接到更新服务器，请检查网络连接');
                return;
            }
        }
        
        // 步骤2: 比较版本
        if (compareVersion(latestVersion, currentVersion) <= 0) {
            console.log('当前已是最新版本');
            event.reply('update-not-available', { currentVersion });
            return;
        }
        
        console.log(`发现新版本: ${latestVersion}`);
        
        // 步骤3: 从 GitHub 获取 Release 详细信息和安装包
        if (!releaseInfo) {
            try {
                releaseInfo = await fetchJSON(API_ENDPOINTS.githubReleaseByTag(latestVersion));
            } catch (e) {
                console.log('获取 Release 详情失败:', e.message);
            }
        }
        
        // 步骤4: 查找对应平台的安装包
        let targetAsset = null;
        let downloadUrl = null;
        
        if (releaseInfo && releaseInfo.assets) {
            for (const pattern of platformInfo.patterns) {
                targetAsset = releaseInfo.assets.find(a => a.name && pattern(a.name));
                if (targetAsset) break;
            }
        }
        
        if (targetAsset) {
            downloadUrl = targetAsset.browser_download_url;
            console.log(`找到安装包: ${targetAsset.name}`);
        } else {
            // 如果找不到，构造下载链接（基于命名规则）
            const fileName = constructFileName(latestVersion, platformInfo);
            downloadUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${latestVersion}/${fileName}`;
            console.log(`构造下载链接: ${downloadUrl}`);
        }
        
        event.reply('update-available', {
            currentVersion: currentVersion,
            version: latestVersion.replace(/^v/, ''),
            releaseDate: releaseInfo?.published_at ? releaseInfo.published_at.split('T')[0] : '未知',
            releaseNotes: releaseInfo?.body || '暂无更新说明',
            size: targetAsset ? formatSize(targetAsset.size) : '未知',
            downloadUrl: downloadUrl,
            fileName: targetAsset?.name || constructFileName(latestVersion, platformInfo),
            platform: platformInfo.platformName
        });
        
    } catch (error) {
        console.error('检查更新出错:', error);
        event.reply('update-error', `检查更新失败: ${error.message}`);
    }
});

// 根据版本和平台构造文件名
function constructFileName(version, platformInfo) {
    const ver = version.replace(/^v/, '');
    switch (process.platform) {
        case 'win32':
            return `StudentInfoTool-Setup-${ver}.exe`;
        case 'darwin':
            const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
            return `StudentInfoTool-${ver}-macOS-${arch}.dmg`;
        case 'linux':
            return `StudentInfoTool-${ver}-Linux-x86_64.AppImage`;
        default:
            return `StudentInfoTool-Setup-${ver}.exe`;
    }
}

// 下载文件（带镜像重试和进度显示）
async function downloadFile(url, destPath, event, mirrorIndex = 0) {
    return new Promise((resolve, reject) => {
        // 应用镜像加速
        let downloadUrl = url;
        if (mirrorIndex < GITHUB_MIRRORS.length && url.includes('github.com')) {
            const mirror = GITHUB_MIRRORS[mirrorIndex];
            downloadUrl = mirror.prefix + url;
            console.log(`使用镜像 [${mirror.name}]: ${downloadUrl}`);
        }
        
        const client = downloadUrl.startsWith('https') ? https : http;
        
        const request = client.get(downloadUrl, {
            headers: { 'User-Agent': 'StudentApp/' + app.getVersion() },
            timeout: 30000
        }, (response) => {
            // 处理重定向
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                console.log('重定向到:', response.headers.location);
                downloadFile(response.headers.location, destPath, event, mirrorIndex)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            if (response.statusCode !== 200) {
                // 当前镜像失败，尝试下一个
                if (mirrorIndex < GITHUB_MIRRORS.length - 1) {
                    console.log(`镜像 ${GITHUB_MIRRORS[mirrorIndex].name} 失败 (${response.statusCode})，尝试下一个...`);
                    downloadFile(url, destPath, event, mirrorIndex + 1)
                        .then(resolve)
                        .catch(reject);
                    return;
                }
                reject(new Error(`下载失败: HTTP ${response.statusCode}`));
                return;
            }
            
            const totalSize = parseInt(response.headers['content-length'], 10) || 0;
            let downloadedSize = 0;
            const startTime = Date.now();
            
            const fileStream = fs.createWriteStream(destPath);
            currentDownload.path = destPath;
            
            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                
                // 计算进度和速度
                const percent = totalSize > 0 ? (downloadedSize / totalSize * 100) : 0;
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = elapsed > 0 ? downloadedSize / elapsed : 0;
                const speedText = formatSize(speed) + '/s';
                const remaining = speed > 0 ? Math.round((totalSize - downloadedSize) / speed) : 0;
                
                event.reply('update-progress', {
                    percent: Math.round(percent * 10) / 10,
                    downloaded: formatSize(downloadedSize),
                    total: formatSize(totalSize),
                    speed: speedText,
                    remaining: remaining > 60 ? `${Math.round(remaining / 60)}分钟` : `${remaining}秒`,
                    mirror: GITHUB_MIRRORS[mirrorIndex].name
                });
            });
            
            response.pipe(fileStream);
            
            fileStream.on('finish', () => {
                fileStream.close();
                console.log('下载完成:', destPath);
                resolve(destPath);
            });
            
            fileStream.on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        });
        
        request.on('error', (err) => {
            // 当前镜像失败，尝试下一个
            if (mirrorIndex < GITHUB_MIRRORS.length - 1) {
                console.log(`镜像 ${GITHUB_MIRRORS[mirrorIndex].name} 连接失败，尝试下一个...`);
                downloadFile(url, destPath, event, mirrorIndex + 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            reject(err);
        });
        
        request.on('timeout', () => {
            request.destroy();
            // 超时也尝试下一个镜像
            if (mirrorIndex < GITHUB_MIRRORS.length - 1) {
                console.log(`镜像 ${GITHUB_MIRRORS[mirrorIndex].name} 超时，尝试下一个...`);
                downloadFile(url, destPath, event, mirrorIndex + 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            reject(new Error('下载超时'));
        });
    });
}

// 开始下载更新
ipcMain.on('download-update', async (event, updateInfo) => {
    if (currentDownload.inProgress) {
        event.reply('update-error', '已有下载任务在进行中');
        return;
    }
    
    currentDownload.inProgress = true;
    
    try {
        const downloadUrl = updateInfo.downloadUrl;
        const fileName = updateInfo.fileName || 'update-installer.exe';
        
        // 下载到临时目录
        const tempDir = app.getPath('temp');
        const destPath = path.join(tempDir, fileName);
        
        console.log('开始下载:', downloadUrl);
        console.log('保存到:', destPath);
        
        event.reply('update-downloading');
        
        await downloadFile(downloadUrl, destPath, event);
        
        currentDownload.path = destPath;
        currentDownload.inProgress = false;
        
        event.reply('update-downloaded', {
            filePath: destPath,
            fileName: fileName
        });
        
    } catch (error) {
        console.error('下载失败:', error);
        currentDownload.inProgress = false;
        event.reply('update-error', `下载失败: ${error.message}`);
    }
});

// 安装更新
ipcMain.on('install-update', (event) => {
    const installerPath = currentDownload.path;
    
    if (!installerPath || !fs.existsSync(installerPath)) {
        event.reply('update-error', '安装包不存在，请重新下载');
        return;
    }
    
    console.log('启动安装程序:', installerPath);
    
    // 根据平台执行安装
    const platform = process.platform;
    
    try {
        if (platform === 'win32') {
            // Windows: 直接运行 exe 安装程序
            const { spawn } = require('child_process');
            spawn(installerPath, [], {
                detached: true,
                stdio: 'ignore'
            }).unref();
        } else if (platform === 'darwin') {
            // macOS: 打开 dmg 文件
            shell.openPath(installerPath);
        } else {
            // Linux: 根据文件类型处理
            if (installerPath.endsWith('.AppImage')) {
                // 设置可执行权限并运行
                fs.chmodSync(installerPath, '755');
                shell.openPath(installerPath);
            } else {
                shell.openPath(installerPath);
            }
        }
        
        // 延迟退出，让安装程序有时间启动
        setTimeout(() => {
            app.quit();
        }, 1000);
        
    } catch (error) {
        console.error('启动安装程序失败:', error);
        event.reply('update-error', `启动安装程序失败: ${error.message}`);
    }
});

// 取消下载
ipcMain.on('cancel-download', () => {
    if (currentDownload.controller) {
        currentDownload.controller.abort();
    }
    currentDownload.inProgress = false;
    console.log('下载已取消');
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
