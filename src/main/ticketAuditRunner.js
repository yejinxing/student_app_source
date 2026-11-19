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

    if (child.stdout) {
        child.stdout.on('data', (data) => process.stdout.write(data));
    }
    if (child.stderr) {
        child.stderr.on('data', (data) => process.stderr.write(data));
    }

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

function runExamScheduleDetection({ pdfDir, maxFiles, onResult, onError }) {
    const child = utilityProcess.fork(getWorkerPath(), [], { serviceName: 'ticket-audit-detect' });
    let settled = false;

    if (child.stdout) {
        child.stdout.on('data', (data) => process.stdout.write(data));
    }
    if (child.stderr) {
        child.stderr.on('data', (data) => process.stderr.write(data));
    }

    const settle = (callback, payload) => {
        if (settled) return;
        settled = true;
        if (callback) callback(payload);
    };

    child.on('message', (message) => {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'detect-result') {
            settle(onResult, message.result);
        } else if (message.type === 'error') {
            settle(onError, new Error(message.message || '识别考试安排失败'));
        }
    });

    child.on('exit', (code) => {
        if (!settled) {
            settle(onError, new Error(`识别进程已退出 (code: ${code})`));
        }
    });

    child.postMessage({ type: 'detect', pdfDir, maxFiles });

    return {
        cancel() {
            if (!settled) {
                settled = true;
                child.kill();
            }
        }
    };
}

function detectExamScheduleViaWorker(pdfDir, maxFiles = 50) {
    return new Promise((resolve, reject) => {
        let timer = null;
        const run = runExamScheduleDetection({
            pdfDir,
            maxFiles,
            onResult: (result) => {
                clearTimeout(timer);
                resolve(result);
            },
            onError: (error) => {
                clearTimeout(timer);
                reject(error);
            }
        });

        timer = setTimeout(() => {
            run.cancel();
            reject(new Error('识别考试安排超时'));
        }, 120000);
    });
}

module.exports = { runTicketAudit, getWorkerPath, getPdfjsDirs, runExamScheduleDetection, detectExamScheduleViaWorker };
