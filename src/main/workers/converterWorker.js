const { handleStart } = require('./converterWorkerCore');

function send(message) {
    if (process.parentPort) {
        process.parentPort.postMessage(message);
    }
}

if (process.parentPort) {
    process.parentPort.on('message', async (event) => {
        const message = event.data;
        if (!message || message.type !== 'start') return;

        const { convertExcelToWord } = require('../../converter');
        const success = await handleStart(message, { convertExcelToWord, send });
        process.exit(success ? 0 : 1);
    });
}
