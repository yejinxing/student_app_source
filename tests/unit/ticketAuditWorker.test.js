const { test } = require('node:test');
const assert = require('node:assert/strict');

const { handleStart } = require('../../src/main/workers/ticketAuditWorkerCore');

test('handleStart 转发进度与结果', async () => {
    const messages = [];
    const success = await handleStart(
        {
            type: 'start',
            pdfDir: 'pdfs',
            excelPath: 'data.xlsx',
            subjectConfigs: [],
            cmapsDir: 'cmaps',
            standardFontsDir: 'fonts'
        },
        {
            auditTickets: async (pdfDir, excelPath, subjectConfigs, progress, options) => {
                assert.equal(pdfDir, 'pdfs');
                assert.equal(excelPath, 'data.xlsx');
                assert.deepEqual(options, { cmapsDir: 'cmaps', standardFontsDir: 'fonts' });
                progress(0, 1, 1, 2, 'a.pdf');
                return [{ status: 'success' }];
            },
            send: (message) => messages.push(message)
        }
    );

    assert.equal(success, true);
    assert.deepEqual(messages[0], {
        type: 'progress',
        pFiles: 0,
        tFiles: 1,
        pPages: 1,
        tPages: 2,
        currentFile: 'a.pdf'
    });
    assert.deepEqual(messages[1], { type: 'result', results: [{ status: 'success' }] });
});

test('handleStart 捕获解析错误', async () => {
    const messages = [];
    const success = await handleStart(
        { type: 'start', pdfDir: 'pdfs', excelPath: 'data.xlsx', subjectConfigs: [] },
        {
            auditTickets: async () => {
                throw new Error('解析失败');
            },
            send: (message) => messages.push(message)
        }
    );

    assert.equal(success, false);
    assert.deepEqual(messages[0], { type: 'error', message: '解析失败' });
});

test('handleStart 忽略非 start 消息', async () => {
    const success = await handleStart(
        { type: 'cancel' },
        { auditTickets: async () => [], send: () => {} }
    );

    assert.equal(success, false);
});
