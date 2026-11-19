const path = require('path');
const fs = require('fs-extra');
const { ipcMain, dialog, shell } = require('electron');
const { auditTickets } = require('../../ticketAuditor');
const { getMainWindow } = require('../window');
const { runTicketAudit } = require('../ticketAuditRunner');

function registerTicketAuditIpc() {
    let activeAudit = null;

    async function runInline(event, options) {
        try {
            const results = await auditTickets(
                options.pdfDir,
                options.excelPath,
                options.subjectConfigs,
                (pFiles, tFiles, pPages, tPages, currentFile) => {
                    event.reply('audit-progress', { pFiles, tFiles, pPages, tPages, currentFile });
                }
            );
            event.reply('audit-success', results);
        } catch (error) {
            event.reply('audit-error', error.message);
        }
    }

    ipcMain.handle('select-pdf-dir', async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
            properties: ['openDirectory'],
            title: '选择准考证 PDF 文件夹'
        });
        if (!result.canceled) {
            return result.filePaths[0];
        }
        return null;
    });

    ipcMain.on('start-ticket-audit', async (event, options) => {
        const { pdfDir, excelPath, subjectConfigs } = options;

        if (process.env.STUDENT_APP_AUDIT_INLINE === '1') {
            await runInline(event, options);
            return;
        }

        try {
            activeAudit = runTicketAudit({
                pdfDir,
                excelPath,
                subjectConfigs,
                onProgress: ({ type, ...progress }) => {
                    event.reply('audit-progress', progress);
                },
                onResult: (results) => {
                    event.reply('audit-success', results);
                    activeAudit = null;
                },
                onError: (error) => {
                    event.reply('audit-error', error.message);
                    activeAudit = null;
                }
            });
        } catch (error) {
            console.error('启动审核进程失败，回退到主进程:', error);
            await runInline(event, options);
        }
    });

    ipcMain.on('cancel-ticket-audit', () => {
        if (activeAudit) {
            activeAudit.cancel();
            activeAudit = null;
        }
    });

    ipcMain.on('open-pdf-file', (event, filePath) => {
        try {
            const resolved = path.resolve(String(filePath));
            if (path.extname(resolved).toLowerCase() !== '.pdf') return;
            if (!fs.existsSync(resolved)) return;
            shell.openPath(resolved);
        } catch (e) {
            console.warn('打开 PDF 失败:', e.message);
        }
    });
}

module.exports = { registerTicketAuditIpc };
