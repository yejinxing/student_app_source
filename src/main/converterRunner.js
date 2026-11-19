const path = require('path');
const { utilityProcess } = require('electron');
const { appRoot } = require('./paths');

function getConverterWorkerPath() {
    return path.join(appRoot(), 'src', 'main', 'workers', 'converterWorker.js');
}

function runConversion({ excelPath, outputPath, onResult, onError }) {
    const child = utilityProcess.fork(getConverterWorkerPath(), [], { serviceName: 'excel-converter' });
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
        if (message.type === 'result') {
            settle(onResult, message.outputPath);
        } else if (message.type === 'error') {
            settle(onError, new Error(message.message || '转换失败'));
        }
    });

    child.on('exit', (code) => {
        if (!settled) {
            settle(onError, new Error(`转换进程已退出 (code: ${code})`));
        }
    });

    child.postMessage({ type: 'start', excelPath, outputPath });

    return {
        cancel() {
            if (!settled) {
                settled = true;
                child.kill();
            }
        }
    };
}

module.exports = { runConversion, getConverterWorkerPath };
