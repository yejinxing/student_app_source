const path = require('path');
const fs = require('fs-extra');
const { ipcMain, dialog } = require('electron');
const { getMainWindow } = require('../window');
const { assetPath } = require('../paths');
const { analyzeWorkbook, generateWorkbook } = require('../../classAssigner');

function assertExcelPath(filePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) {
        const error = new Error('文件不存在，请重新选择');
        error.code = 'FILE_NOT_FOUND';
        throw error;
    }
    const realPath = fs.realpathSync(resolved);
    const stat = fs.statSync(realPath);
    if (!stat.isFile()) {
        const error = new Error('所选路径不是文件');
        error.code = 'FILE_TYPE_INVALID';
        throw error;
    }
    const extension = path.extname(realPath).toLowerCase();
    if (!['.xls', '.xlsx'].includes(extension)) {
        const error = new Error('只支持 .xls 和 .xlsx 文件');
        error.code = 'FILE_TYPE_INVALID';
        throw error;
    }
    return realPath;
}

function toErrorPayload(error) {
    return {
        code: error && error.code ? error.code : 'UNEXPECTED_ERROR',
        message: error && error.message ? error.message : String(error),
        details: error && error.details
    };
}

function registerClassAssignIpc() {
    ipcMain.handle('select-class-assign-excel', async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
            properties: ['openFile'],
            filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
        });
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle('analyze-class-assign-excel', async (event, options) => {
        try {
            const filePath = assertExcelPath(options && options.filePath);
            return analyzeWorkbook(filePath);
        } catch (error) {
            return { ok: false, error: toErrorPayload(error), warnings: [] };
        }
    });

    ipcMain.handle('generate-class-assign', async (event, options) => {
        try {
            const filePath = assertExcelPath(options && options.filePath);
            return generateWorkbook({
                filePath,
                fingerprint: options && options.fingerprint,
                classCounts: options && options.classCounts,
                year: options && options.year
            });
        } catch (error) {
            return { ok: false, error: toErrorPayload(error), warnings: [] };
        }
    });

    ipcMain.handle('download-class-assign-template', async () => {
        try {
            const templatePath = assetPath('学生分班模板.xlsx');
            if (!fs.existsSync(templatePath)) {
                return {
                    success: false,
                    code: 'TEMPLATE_NOT_FOUND',
                    message: '未找到分班模板，请重新安装或更新应用。'
                };
            }
            const result = await dialog.showSaveDialog(getMainWindow(), {
                title: '保存分班模板',
                defaultPath: '学生分班模板.xlsx',
                filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
            });
            if (result.canceled || !result.filePath) {
                return { success: false, code: 'CANCELED', message: '已取消' };
            }
            await fs.copyFile(templatePath, result.filePath);
            return { success: true, path: result.filePath };
        } catch (error) {
            return {
                success: false,
                code: 'TEMPLATE_COPY_FAILED',
                message: error.message
            };
        }
    });
}

module.exports = { registerClassAssignIpc, assertExcelPath };
