const path = require('path');
const { app, utilityProcess } = require('electron');
const { appRoot } = require('./paths');

function getWorkerPath() {
    return path.join(appRoot(), 'src', 'main', 'workers', 'ticketAuditWorker.js');
}

function getPdfjsDirs() {
    if (app.isPackaged) {
        const base = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'pdfjs-dist');
        return {
            cmapsDir: path.join(base, 'cmaps'),
            standardFontsDir: path.join(base, 'standard_fonts')
        };
    }

    const base = path.join(appRoot(), 'node_modules', 'pdfjs-dist');
    return {
        cmapsDir: path.join(base, 'cmaps'),
        standardFontsDir: path.join(base, 'standard_fonts')
    };
}

function runTicketAudit({ pdfDir, excelPath, subjectConfigs, onProgress, onResult, onError }) {
    const child = utilityProcess.fork(getWorkerPath(), [], { serviceName: 'ticket-audit' });
    let settled = false;

    const settle = (callback, payload) => {
        if (settled) return;
        settled = true;
        if (callback) callback(payload);
    };

    child.on('message', (message) => {
        if (!message || typeof message !== 'object') return;

        if (message.type === 'progress') {
            if (onProgress) onProgress(message);
        } else if (message.type === 'result') {
            settle(onResult, message.results);
        } else if (message.type === 'error') {
            settle(onError, new Error(message.message || '准考证审核失败'));
        }
    });

    child.on('exit', (code) => {
        if (!settled) {
            settle(onError, new Error(`准考证审核进程已退出 (code: ${code})`));
        }
    });

    const { cmapsDir, standardFontsDir } = getPdfjsDirs();
    child.postMessage({
        type: 'start',
        pdfDir,
        excelPath,
        subjectConfigs,
        cmapsDir,
        standardFontsDir
    });

    return {
        cancel() {
            if (!settled) {
                settled = true;
                child.kill();
            }
        }
    };
}

module.exports = { runTicketAudit, getWorkerPath, getPdfjsDirs };
