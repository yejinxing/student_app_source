const { test } = require('node:test');
const assert = require('node:assert/strict');

const { handleStart, handleDetect } = require('../../src/main/workers/ticketAuditWorkerCore');

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

test('handleDetect 转发识别结果', async () => {
    const messages = [];
    const success = await handleDetect(
        { type: 'detect', pdfDir: 'pdfs', maxFiles: 10 },
        {
            detectExamSchedule: async (pdfDir, options) => {
                assert.equal(pdfDir, 'pdfs');
                assert.deepEqual(options, { maxFiles: 10 });
                return {
                    subjects: [{ subject: '大学英语', timeStart: '09:00', timeEnd: '11:00', time: '09:00-11:00', count: 8 }],
                    scannedFiles: 5,
                    totalFiles: 20
                };
            },
            send: (message) => messages.push(message)
        }
    );

    assert.equal(success, true);
    assert.deepEqual(messages[0], {
        type: 'detect-result',
        result: {
            subjects: [{ subject: '大学英语', timeStart: '09:00', timeEnd: '11:00', time: '09:00-11:00', count: 8 }],
            scannedFiles: 5,
            totalFiles: 20
        }
    });
});

test('handleDetect 捕获识别错误', async () => {
    const messages = [];
    const success = await handleDetect(
        { type: 'detect', pdfDir: 'pdfs' },
        {
            detectExamSchedule: async () => {
                throw new Error('识别失败');
            },
            send: (message) => messages.push(message)
        }
    );

    assert.equal(success, false);
    assert.deepEqual(messages[0], { type: 'error', message: '识别失败' });
});
