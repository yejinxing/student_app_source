const path = require('path');
const fs = require('fs-extra');
const { ipcMain, dialog } = require('electron');
const { convertExcelToWord } = require('../../converter');
const { getMainWindow } = require('../window');
const { assetPath } = require('../paths');
const { runConversion } = require('../converterRunner');

function registerConversionIpc() {
    async function runInline(event, excelPath, outputPath) {
        try {
            await convertExcelToWord(excelPath, outputPath);
            event.reply('conversion-success', outputPath);
        } catch (error) {
            event.reply('conversion-error', error.message);
        }
    }

    ipcMain.handle('select-file', async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
            properties: ['openFile'],
            filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
        });
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.on('start-conversion', async (event, { excelPath }) => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;

        const outputPath = path.join(path.dirname(excelPath), `新生名册_${timestamp}.docx`);

        if (process.env.STUDENT_APP_CONVERT_INLINE === '1') {
            await runInline(event, excelPath, outputPath);
            return;
        }

        try {
            runConversion({
                excelPath,
                outputPath,
                onResult: (resultPath) => event.reply('conversion-success', resultPath),
                onError: (error) => event.reply('conversion-error', error.message)
            });
        } catch (error) {
            console.error('启动转换进程失败，回退到主进程:', error);
            await runInline(event, excelPath, outputPath);
        }
    });

    ipcMain.on('download-template', async (event) => {
        const templatePath = assetPath('学生信息模板.xlsx');

        const result = await dialog.showSaveDialog(getMainWindow(), {
            title: '保存模板文件',
            defaultPath: '学生信息模板.xlsx',
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });

        if (result.canceled || !result.filePath) {
            event.reply('template-downloaded', { success: false, message: '已取消' });
            return;
        }

        try {
            await fs.copyFile(templatePath, result.filePath);
            event.reply('template-downloaded', { success: true, path: result.filePath });
        } catch (error) {
            event.reply('template-downloaded', { success: false, message: error.message });
        }
    });

    ipcMain.on('download-audit-template', async (event) => {
        const templatePath = assetPath('准考证审核数据模板.xlsx');

        const result = await dialog.showSaveDialog(getMainWindow(), {
            title: '保存审核模板',
            defaultPath: '准考证审核数据模板.xlsx',
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });

        if (result.canceled || !result.filePath) {
            event.reply('audit-template-downloaded', { success: false, message: '已取消' });
            return;
        }

        try {
            if (!fs.existsSync(templatePath)) {
                event.reply('audit-template-downloaded', { success: false, message: '未找到模板源文件，请更新程序资产。' });
                return;
            }
            await fs.copyFile(templatePath, result.filePath);
            event.reply('audit-template-downloaded', { success: true, path: result.filePath });
        } catch (error) {
            event.reply('audit-template-downloaded', { success: false, message: error.message });
        }
    });
}

module.exports = { registerConversionIpc };
