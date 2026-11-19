async function handleStart(message, { convertExcelToWord, send }) {
    if (!message || message.type !== 'start') {
        return false;
    }

    try {
        await convertExcelToWord(message.excelPath, message.outputPath);
        send({ type: 'result', outputPath: message.outputPath });
        return true;
    } catch (error) {
        send({ type: 'error', message: error.message });
        return false;
    }
}

module.exports = { handleStart };
