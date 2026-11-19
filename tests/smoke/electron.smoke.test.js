const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const xlsx = require('xlsx');
const { _electron: electron } = require('playwright-core');
const { writeStudentWorkbook } = require('../helpers/fixtures');

const APP_ROOT = path.resolve(__dirname, '..', '..');

async function writeColumnsFixture(dir) {
    const excelPath = path.join(dir, 'columns.xlsx');
    const worksheet = xlsx.utils.json_to_sheet([
        { ksh: 'A1001', sfz: '110101200001010011', '英语考场号': '01' }
    ]);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    xlsx.writeFile(workbook, excelPath);
    return excelPath;
}

function buildMinimalPdf() {
    const stream = 'BT /F1 12 Tf 72 720 Td (2025-04-18 | 09:00 - 11:00 | English | | 054 | 21) Tj ET';
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf, 'latin1'));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((offset) => {
        pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf, 'latin1');
}

function writeMinimalPdf(dir) {
    const pdfPath = path.join(dir, 'minimal.pdf');
    fs.writeFileSync(pdfPath, buildMinimalPdf());
    return pdfPath;
}

test('Electron 应用启动并可切换五个页面', async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'student-app-smoke-'));
    const excelPath = await writeColumnsFixture(dir);
    const studentExcelPath = path.join(dir, 'students.xlsx');
    writeStudentWorkbook(studentExcelPath);
    writeMinimalPdf(dir);
    t.after(() => fs.remove(dir));

    const executablePath = process.env.STUDENT_APP_EXECUTABLE;
    const launchOptions = executablePath
        ? { executablePath, args: ['--no-sandbox'] }
        : { args: [APP_ROOT, '--no-sandbox'] };
    const app = await electron.launch(launchOptions);
    const stderrChunks = [];
    app.process().stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()));
    t.after(async () => {
        await app.close();
    });

    const page = await app.firstWindow();
    const pageErrors = [];
    const httpRequests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
        if (/^https?:/i.test(request.url())) httpRequests.push(request.url());
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof window.showPageByName === 'function');

    assert.equal(await page.title(), '学生信息处理工具');

    const bridge = await page.evaluate(() => ({
        hasApi: typeof window.electronAPI === 'object' && window.electronAPI !== null,
        hasRequire: typeof window.require !== 'undefined',
        platform: window.electronAPI && window.electronAPI.platform
    }));
    assert.equal(bridge.hasApi, true);
    assert.equal(bridge.hasRequire, false);
    assert.ok(typeof bridge.platform === 'string' && bridge.platform.length > 0);
    assert.deepEqual(httpRequests, []);

    const assets = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('link[href^="src/renderer/css/"]'));
        const scripts = Array.from(document.querySelectorAll('script[src^="src/renderer/js/"]'));
        return {
            cssCount: links.length,
            cssLoaded: links.every((link) => !!link.sheet),
            jsCount: scripts.length
        };
    });
    assert.equal(assets.cssCount, 8);
    assert.equal(assets.cssLoaded, true);
    assert.equal(assets.jsCount, 7);

    const vendor = await page.evaluate(() => ({
        marked: typeof marked !== 'undefined' && typeof marked.parse === 'function',
        dompurify: typeof DOMPurify !== 'undefined' && typeof DOMPurify.sanitize === 'function'
    }));
    assert.equal(vendor.marked, true);
    assert.equal(vendor.dompurify, true);

    await page.evaluate(() => document.querySelectorAll('.sidebar-nav .nav-item')[1].click());
    const convertDisplay = await page.evaluate(() => document.getElementById('convert-page').style.display);
    assert.notEqual(convertDisplay, 'none');

    const inlineHandlers = await page.evaluate(() => {
        return document.querySelectorAll('[onclick],[onchange],[oninput],[onmouseover],[onmouseout]').length;
    });
    assert.equal(inlineHandlers, 0);

    await page.evaluate(() => document.querySelector('[data-action="open-about"]').click());
    assert.equal(await page.evaluate(() => document.getElementById('about-modal').classList.contains('active')), true);
    await page.evaluate(() => document.querySelector('[data-action="close-about"]').click());
    assert.equal(await page.evaluate(() => document.getElementById('about-modal').classList.contains('active')), false);

    await page.evaluate(() => document.getElementById('update-modal').classList.add('active'));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.getElementById('update-modal').classList.contains('active')), false);

    await page.waitForFunction(
        () => document.getElementById('home-version')?.textContent === 'v1.0.1',
        { timeout: 5000 }
    );
    const cacheSize = await page.textContent('#cache-size');
    assert.notEqual(cacheSize, '计算中...');

    const columns = await page.evaluate((filePath) => {
        return window.electronAPI.invoke('get-excel-columns', filePath);
    }, excelPath);
    assert.deepEqual(columns, ['ksh', 'sfz', '英语考场号']);

    const detection = await page.evaluate((pdfDir) => {
        return window.electronAPI.invoke('detect-exam-schedule', { pdfDir });
    }, dir);
    assert.equal(detection.scannedFiles, 1);
    assert.deepEqual(detection.subjects, [
        { subject: 'English', timeStart: '09:00', timeEnd: '11:00', time: '09:00-11:00', count: 1 }
    ]);

    const autoFilled = await page.evaluate(({ pdfDir, excelPath: auditExcel }) => {
        auditPdfDir = pdfDir;
        auditExcelFile = auditExcel;
        renderSubjectConfig(['英语科目考场号', '专业课1考场号', '专业课2考场号']);
        applyDetectedSchedule({
            subjects: [{ subject: '大学英语', timeStart: '09:00', timeEnd: '11:00', time: '09:00-11:00', count: 10 }]
        });
        return Array.from(document.querySelectorAll('.subject-config-item')).map(item => ({
            prefix: item.querySelector('.conf-excel-prefix').value,
            pdfName: item.querySelector('.conf-pdf-name').value,
            start: item.querySelector('.conf-time-start').value,
            end: item.querySelector('.conf-time-end').value
        }));
    }, { pdfDir: dir, excelPath });
    assert.deepEqual(autoFilled[0], {
        prefix: '英语科目',
        pdfName: '大学英语',
        start: '09:00',
        end: '11:00'
    });

    const auditError = await page.evaluate(() => new Promise((resolve) => {
        const timer = setTimeout(() => resolve('timeout'), 8000);
        window.electronAPI.once('audit-error', (event, message) => {
            clearTimeout(timer);
            resolve(message);
        });
        window.electronAPI.send('start-ticket-audit', {
            pdfDir: '/nonexistent-pdf-dir',
            excelPath: '/nonexistent-excel.xlsx',
            subjectConfigs: []
        });
    }));
    assert.notEqual(auditError, 'timeout');
    assert.equal(String(auditError).includes('准考证审核进程已退出'), false);

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(stderrChunks.join('').includes('回退到主进程'), false);

    const auditSuccess = await page.evaluate(({ pdfDir, excelPath: auditExcelPath }) => new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ timeout: true }), 15000);
        window.electronAPI.once('audit-success', (event, results) => {
            clearTimeout(timer);
            resolve({ results });
        });
        window.electronAPI.once('audit-error', (event, message) => {
            clearTimeout(timer);
            resolve({ error: message });
        });
        window.electronAPI.send('start-ticket-audit', {
            pdfDir,
            excelPath: auditExcelPath,
            subjectConfigs: []
        });
    }), { pdfDir: dir, excelPath });

    assert.equal(auditSuccess.timeout, undefined);
    assert.equal(auditSuccess.error, undefined);
    assert.deepEqual(auditSuccess.results, []);

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(stderrChunks.join('').includes('fetch failed'), false);
    assert.equal(stderrChunks.join('').includes('loadFont - translateFont failed'), false);
    assert.equal(stderrChunks.join('').includes('无法临时覆盖 process.type'), false);

    const conversion = await page.evaluate((filePath) => new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ timeout: true }), 15000);
        window.electronAPI.once('conversion-success', (event, outputPath) => {
            clearTimeout(timer);
            resolve({ outputPath });
        });
        window.electronAPI.once('conversion-error', (event, message) => {
            clearTimeout(timer);
            resolve({ error: message });
        });
        window.electronAPI.send('start-conversion', { excelPath: filePath });
    }), studentExcelPath);

    assert.equal(conversion.timeout, undefined);
    assert.equal(conversion.error, undefined);
    const docx = await fs.readFile(conversion.outputPath);
    assert.equal(docx.subarray(0, 2).toString(), 'PK');

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(stderrChunks.join('').includes('启动转换进程失败'), false);

    for (const name of ['home', 'convert', 'ticket-audit', 'photo-rename', 'settings']) {
        await page.evaluate((pageName) => window.showPageByName(pageName), name);
        const display = await page.evaluate((pageName) => {
            const element = document.getElementById(`${pageName}-page`);
            return element ? element.style.display : null;
        }, name);
        assert.notEqual(display, 'none', `${name} 页面应可见`);
    }

    const missingHandlers = await page.evaluate(() => [
        'startConversion',
        'startTicketAudit',
        'startPhotoRenaming',
        'saveSettings',
        'checkUpdate',
        'openAboutModal',
        'showToast'
    ].filter((name) => typeof window[name] !== 'function'));

    assert.deepEqual(missingHandlers, []);
    assert.deepEqual(pageErrors, []);
});
