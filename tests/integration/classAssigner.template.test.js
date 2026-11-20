const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const xlsx = require('xlsx');

const { CLASS_ASSIGN_COLUMNS } = require('../helpers/fixtures');

test('分班模板只有表头，没有数据行', () => {
    const templatePath = path.resolve(__dirname, '..', '..', 'assets', '学生分班模板.xlsx');
    const workbook = xlsx.readFile(templatePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    assert.deepEqual(rows, [CLASS_ASSIGN_COLUMNS]);
});
