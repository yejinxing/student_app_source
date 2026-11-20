const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

function findAsar(dir) {
    if (!fs.existsSync(dir)) return null;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const found = findAsar(fullPath);
            if (found) return found;
        } else if (entry.name === 'app.asar') {
            return fullPath;
        }
    }
    return null;
}

const asarPath = findAsar(distDir);
if (!asarPath) {
    console.error('未找到 app.asar，请先运行 npm run build');
    process.exit(1);
}

const files = asar.listPackage(asarPath).map((file) => file.replace(/\\/g, '/'));
const required = [
    '/main.js',
    '/index.html',
    '/src/preload.js',
    '/src/main/window.js',
    '/src/main/updater/index.js',
    '/src/main/workers/ticketAuditWorker.js',
    '/src/main/workers/converterWorker.js',
    '/src/main/converterRunner.js',
    '/src/main/settingsSchema.js',
    '/src/main/urlPolicy.js',
    '/src/converter/index.js',
    '/src/converter/document.js',
    '/src/renderer/js/core.js',
    '/src/renderer/css/base.css',
    '/assets/icon.png',
    '/assets/学生信息模板.xlsx',
    '/assets/准考证审核数据模板.xlsx',
    '/assets/学生分班模板.xlsx',
    '/node_modules/marked/lib/marked.umd.js',
    '/node_modules/dompurify/dist/purify.min.js',
    '/node_modules/pdfjs-dist/legacy/build/pdf.js',
    '/node_modules/pdfjs-dist/legacy/build/pdf.worker.js'
];

const missing = required.filter((file) => !files.includes(file));
if (missing.length > 0) {
    console.error('asar 缺少必需文件:', missing);
    process.exit(1);
}

const forbiddenPrefixes = ['/tests/', '/.github/', '/dev-app-update.yml'];
const forbidden = files.filter((file) => forbiddenPrefixes.some((prefix) => file.startsWith(prefix)));
if (forbidden.length > 0) {
    console.error('asar 包含不应打包的文件:', forbidden.slice(0, 20));
    process.exit(1);
}

const resourcesDir = path.dirname(asarPath);
const licensePath = path.join(resourcesDir, 'LICENSE');
if (!fs.existsSync(licensePath)) {
    console.error('resources 缺少 LICENSE:', licensePath);
    process.exit(1);
}

const unpackedBase = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'pdfjs-dist');
for (const subDir of ['cmaps', 'standard_fonts']) {
    const target = path.join(unpackedBase, subDir);
    if (!fs.existsSync(target)) {
        console.error('app.asar.unpacked 缺少:', target);
        process.exit(1);
    }
}

console.log('打包产物校验通过:', asarPath);
console.log('asar 文件数:', files.length);
