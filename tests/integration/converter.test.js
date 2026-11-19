const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');

const { convertExcelToWord } = require('../../src/converter');
const { writeStudentWorkbook } = require('../helpers/fixtures');
const { makeTempDir, removeTempDir } = require('../helpers/tmp');

test('convertExcelToWord 生成可解析的 docx', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));

    const excelPath = path.join(dir, 'students.xlsx');
    const outputPath = path.join(dir, 'students.docx');
    writeStudentWorkbook(excelPath);

    await convertExcelToWord(excelPath, outputPath);

    const buffer = await fs.readFile(outputPath);
    assert.equal(buffer.subarray(0, 2).toString(), 'PK');
    assert.ok(buffer.length > 1000, '生成的 docx 应有实际内容');
});
