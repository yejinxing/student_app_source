const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { convertExcelToWord } = require('./converter');
const fs = require('fs-extra');
const PhotoRenamer = require('./photoRenamer');
const xlsx = require('xlsx');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        title: "学生信息管理系统",
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
        const outputPath = path.join(path.dirname(excelPath), `生成结果_${Date.now()}.docx`);
        await convertExcelToWord(excelPath, outputPath);
        event.reply('conversion-success', outputPath);
    } catch (error) {
        event.reply('conversion-error', error.message);
    }
});

// 模拟自动更新检查
ipcMain.on('check-for-updates', (event) => {
    setTimeout(() => {
        event.reply('update-status', '当前已是最新版本 (v1.0.0)');
    }, 2000);
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

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
