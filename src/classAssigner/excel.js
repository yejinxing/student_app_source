const path = require('path');
const fs = require('fs-extra');
const xlsx = require('xlsx');
const { findHeaderRowIndex } = require('./columns');

function readWorkbook(filePath) {
    const stat = fs.statSync(filePath);
    const fingerprint = `${stat.size}:${stat.mtimeMs}`;
    const workbook = xlsx.readFile(filePath, { cellDates: false });

    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;
        const rows = xlsx.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            raw: false,
            blankrows: true
        });
        const headerRowIndex = findHeaderRowIndex(rows);
        if (headerRowIndex === -1) continue;
        return {
            sheetName,
            headerRow: rows[headerRowIndex],
            dataRows: rows.slice(headerRowIndex + 1),
            headerRowIndex,
            fingerprint
        };
    }

    const error = new Error('Excel 中没有可读取的数据');
    error.code = 'SHEET_EMPTY';
    throw error;
}

function writeWorkbook(filePath, sheetName, headers, rows) {
    const worksheet = xlsx.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName || 'Sheet1');
    xlsx.writeFile(workbook, filePath, { bookType: 'xlsx' });
}

function buildOutputPath(filePath, now = new Date()) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    const date = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('');
    const time = [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
    ].join('');
    const stamp = `${date}_${time}`;

    let outputPath = path.join(dir, `${base}_分班学号_${stamp}.xlsx`);
    let suffix = 1;
    while (fs.existsSync(outputPath)) {
        outputPath = path.join(dir, `${base}_分班学号_${stamp}_${suffix}.xlsx`);
        suffix += 1;
    }
    return outputPath;
}

module.exports = {
    readWorkbook,
    writeWorkbook,
    buildOutputPath
};
