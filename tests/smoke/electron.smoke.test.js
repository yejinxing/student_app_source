const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const xlsx = require('xlsx');
const { _electron: electron } = require('playwright-core');

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

test('Electron 应用启动并可切换五个页面', async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'student-app-smoke-'));
    const excelPath = await writeColumnsFixture(dir);
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
