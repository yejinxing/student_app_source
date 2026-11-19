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
        event.reply('renaming-status', '操作已停止');
        event.reply('renaming-finished', false);
    });
}

module.exports = { registerPhotoRenameIpc };
