async function handleStart(message, { auditTickets, send }) {
    if (!message || message.type !== 'start') {
        return false;
    }

    try {
        const results = await auditTickets(
            message.pdfDir,
            message.excelPath,
            message.subjectConfigs,
            (pFiles, tFiles, pPages, tPages, currentFile) => {
                send({ type: 'progress', pFiles, tFiles, pPages, tPages, currentFile });
            },
            {
                cmapsDir: message.cmapsDir,
                standardFontsDir: message.standardFontsDir
            }
        );
        send({ type: 'result', results });
        return true;
    } catch (error) {
        send({ type: 'error', message: error.message });
        return false;
    }
}

module.exports = { handleStart };
