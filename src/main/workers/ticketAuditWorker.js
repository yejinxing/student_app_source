const { handleStart } = require('./ticketAuditWorkerCore');

function send(message) {
    if (process.parentPort) {
        process.parentPort.postMessage(message);
    }
}

if (process.parentPort) {
    process.parentPort.on('message', async (event) => {
        const message = event.data;
        if (!message || message.type !== 'start') return;

        const { auditTickets } = require('../../ticketAuditor');
        const success = await handleStart(message, { auditTickets, send });
        process.exit(success ? 0 : 1);
    });
}
