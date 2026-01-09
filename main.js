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

// 更新源配置（Gitee 优先，GitHub 备用）
const UPDATE_SOURCES = [
    {
        name: 'Gitee',
        apiUrl: 'https://gitee.com/api/v5/repos/yejinxing/student_app_source/releases/latest',
        downloadBase: 'https://gitee.com/yejinxing/student_app_source/releases/download/'
    },
    {
        name: 'GitHub',
        apiUrl: 'https://api.github.com/repos/yejinxing/student_app_source/releases/latest',
        downloadBase: 'https://github.com/yejinxing/student_app_source/releases/download/'
    }
];

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

// 检查更新
ipcMain.on('check-for-updates', async (event) => {
    const currentVersion = app.getVersion();
    
    // 依次尝试更新源
    for (const source of UPDATE_SOURCES) {
        try {
            console.log(`正在从 ${source.name} 检查更新...`);
            const release = await fetchJSON(source.apiUrl);
            
            // 解析版本信息
            const latestVersion = release.tag_name || release.name;
            
            if (compareVersion(latestVersion, currentVersion) > 0) {
                // 找到安装包
                const assets = release.assets || [];
                const exeAsset = assets.find(a => a.name && a.name.endsWith('.exe'));
                
                event.reply('update-available', {
                    currentVersion: currentVersion,
                    version: latestVersion.replace(/^v/, ''),
                    releaseDate: release.published_at ? release.published_at.split('T')[0] : '未知',
                    releaseNotes: release.body || '暂无更新说明',
                    size: exeAsset ? formatSize(exeAsset.size) : '未知',
                    downloadUrl: exeAsset ? exeAsset.browser_download_url : null,
                    source: source.name
                });
                return;
            } else {
                event.reply('update-not-available', {
                    currentVersion: currentVersion
                });
                return;
            }
        } catch (error) {
            console.log(`${source.name} 检查失败:`, error.message);
            continue;
        }
    }
    
    // 所有源都失败
    event.reply('update-error', '无法连接到更新服务器，请检查网络连接');
});

// 下载更新
ipcMain.on('download-update', async (event) => {
    // 这里可以实现下载逻辑，但由于浏览器下载更简单可靠，
    // 我们直接打开下载链接让用户手动下载
    event.reply('update-error', '请从 Gitee 或 GitHub 发布页面手动下载最新版本');
});

// 安装更新
ipcMain.on('install-update', (event) => {
    if (downloadPath && fs.existsSync(downloadPath)) {
        shell.openPath(downloadPath);
        app.quit();
    }
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
