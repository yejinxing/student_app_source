const { ipcMain, dialog } = require('electron');
const xlsx = require('xlsx');
const PhotoRenamer = require('../../photoRenamer');
const { getMainWindow } = require('../window');

function registerPhotoRenameIpc() {
    ipcMain.on('select-photo-folder', async (event) => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
            properties: ['openDirectory']
        });
        if (!result.canceled) {
            event.reply('selected-photo-folder', result.filePaths[0]);
        }
    });

    ipcMain.on('select-photo-excel-file', async (event) => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
            properties: ['openFile'],
            filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
        });
        if (!result.canceled) {
            event.reply('selected-photo-excel-file', result.filePaths[0]);
        }
    });

    ipcMain.on('select-photo-output-folder', async (event) => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
            properties: ['openDirectory']
        });
        if (!result.canceled) {
            event.reply('selected-photo-output-folder', result.filePaths[0]);
        }
    });

    ipcMain.handle('get-excel-columns', async (event, excelPath) => {
        try {
            const workbook = xlsx.readFile(excelPath);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
            return jsonData.length > 0 ? jsonData[0] : [];
        } catch (error) {
            console.error('读取Excel列名失败:', error);
            return [];
        }
    });

    let activeRenamer = null;
    let activeRunId = 0;

    ipcMain.on('start-renaming', async (event, options) => {
        const { photoDir, excelPath, outputDir, outputExt, inputField, outputField } = options;

        if (activeRenamer) {
            activeRenamer.stop();
        }

        const runId = ++activeRunId;
        const renamer = new PhotoRenamer({
            photoDir,
            excelPath,
            outputDir,
            outputExt,
            inputField,
            outputField
        });
        activeRenamer = renamer;

        renamer.setStatusCallback((message) => {
            if (runId === activeRunId) event.reply('renaming-status', message);
        });

        renamer.setProgressCallback((progress) => {
            if (runId === activeRunId) event.reply('renaming-progress', progress);
        });

        renamer.setFinishCallback((success) => {
            if (runId !== activeRunId) return;
            activeRenamer = null;
            event.reply('renaming-finished', success);
        });

        try {
            await renamer.run();
        } catch (error) {
            if (runId === activeRunId) {
                activeRenamer = null;
                event.reply('renaming-status', `处理出错: ${error.message}`);
                event.reply('renaming-finished', false);
            }
        }
    });

    ipcMain.on('stop-renaming', (event) => {
        if (activeRenamer) {
            activeRenamer.stop();
            event.reply('renaming-status', '正在停止...');
        } else {
            event.reply('renaming-status', '没有正在进行的任务');
            event.reply('renaming-finished', false);
        }
    });
}

module.exports = { registerPhotoRenameIpc };
