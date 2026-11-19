const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const state = require('./state');
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
                state.cachedInstallerPath = updaterFile;
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
    if (state.cachedInstallerPath && fs.existsSync(state.cachedInstallerPath)) {
        try {
            const stat = fs.statSync(state.cachedInstallerPath);
            if (stat.size > 10 * 1024 * 1024) {
                console.log(`✓ 使用缓存的安装包路径: ${state.cachedInstallerPath}`);
                return {
                    path: state.cachedInstallerPath,
                    size: stat.size,
                    fileName: path.basename(state.cachedInstallerPath)
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
                    state.cachedInstallerPath = expectedPath;
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
                            state.cachedInstallerPath = filePath;
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

module.exports = { checkExistingDownload };
