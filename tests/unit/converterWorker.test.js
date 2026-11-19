const { test } = require('node:test');
const assert = require('node:assert/strict');

const { handleStart } = require('../../src/main/workers/converterWorkerCore');

test('handleStart 调用转换并回传结果', async () => {
    const messages = [];
    const calls = [];
    const success = await handleStart(
        { type: 'start', excelPath: 'students.xlsx', outputPath: 'students.docx' },
        {
            convertExcelToWord: async (excelPath, outputPath) => {
                calls.push({ excelPath, outputPath });
            },
            send: (message) => messages.push(message)
        }
    );

    assert.equal(success, true);
    assert.deepEqual(calls, [{ excelPath: 'students.xlsx', outputPath: 'students.docx' }]);
    assert.deepEqual(messages[0], { type: 'result', outputPath: 'students.docx' });
});

test('handleStart 捕获转换错误', async () => {
    const messages = [];
    const success = await handleStart(
        { type: 'start', excelPath: 'students.xlsx', outputPath: 'students.docx' },
        {
            convertExcelToWord: async () => {
                throw new Error('转换失败');
            },
            send: (message) => messages.push(message)
        }
    );

    assert.equal(success, false);
    assert.deepEqual(messages[0], { type: 'error', message: '转换失败' });
});

test('handleStart 忽略非 start 消息', async () => {
    const success = await handleStart(
        { type: 'cancel' },
        { convertExcelToWord: async () => {}, send: () => {} }
    );
    assert.equal(success, false);
});
