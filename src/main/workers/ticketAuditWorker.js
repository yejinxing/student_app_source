const { handleStart, handleDetect } = require('./ticketAuditWorkerCore');

function send(message) {
    if (process.parentPort) {
        process.parentPort.postMessage(message);
    }
}

if (process.parentPort) {
    process.parentPort.on('message', async (event) => {
        const message = event.data;
        if (!message) return;

        const { auditTickets, detectExamSchedule } = require('../../ticketAuditor');
        let success = false;

        if (message.type === 'start') {
            success = await handleStart(message, { auditTickets, send });
        } else if (message.type === 'detect') {
            success = await handleDetect(message, { detectExamSchedule, send });
        } else {
            return;
        }

        process.exit(success ? 0 : 1);
    });
}
