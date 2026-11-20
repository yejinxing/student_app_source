const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');
const xlsx = require('xlsx');

const { mapHeaders, buildOutputLayout } = require('../../src/classAssigner/columns');
const { readWorkbook, writeWorkbook, buildOutputPath } = require('../../src/classAssigner/excel');
const { makeTempDir, removeTempDir } = require('../helpers/tmp');

test('识别表头别名与缺失列', () => {
    const headerMap = mapHeaders([
        '姓名', '身份证号', '性别', '层次代码', '院系名称', '院系代码', '专业名称', '专业代码'
    ]);
    assert.equal(headerMap.index['身份证号码'], 1);
    assert.deepEqual(headerMap.missing, []);
    assert.deepEqual(headerMap.duplicates, []);

    const missing = mapHeaders(['姓名']);
    assert.ok(missing.missing.includes('性别'));
});

test('检测重复表头', () => {
    const duplicate = mapHeaders(['姓名', '姓名', '性别']);
    assert.ok(duplicate.duplicates.includes('姓名'));

    const aliasDuplicate = mapHeaders(['姓名', '身份证号', '身份证号码', '性别']);
    assert.ok(aliasDuplicate.duplicates.includes('身份证号码/身份证号'));
});

test('输出列原位覆盖或追加', () => {
    const headerMap = mapHeaders(['姓名', '学号', '班级名称']);
    const layout = buildOutputLayout(headerMap, { addNumber: true });
    assert.deepEqual(layout.headers, ['姓名', '学号', '班级名称', '编号', '班号', '班级数量']);
    assert.equal(layout.index['学号'], 1);
    assert.equal(layout.index['班级名称'], 2);
    assert.equal(layout.index['编号'], 3);
    assert.equal(layout.index['班号'], 4);
    assert.equal(layout.index['班级数量'], 5);
});

test('读写 Excel 并生成不覆盖的输出路径', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));

    const inputPath = path.join(dir, 'input.xlsx');
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
        ['姓名', '性别'],
        ['张三', '男']
    ]);
    xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    xlsx.writeFile(workbook, inputPath);

    const book = readWorkbook(inputPath);
    assert.equal(book.sheetName, 'Sheet1');
    assert.deepEqual(book.headerRow, ['姓名', '性别']);
    assert.equal(book.headerRowIndex, 0);
    assert.deepEqual(book.dataRows[0], ['张三', '男']);
    assert.match(book.fingerprint, /^\d+:\d+/);

    const outputPath = buildOutputPath(inputPath, new Date(2026, 10, 20, 12, 34, 56));
    assert.match(path.basename(outputPath), /^input_分班学号_20261120_123456\.xlsx$/);

    await fs.writeFile(outputPath, 'occupied');
    const nextPath = buildOutputPath(inputPath, new Date(2026, 10, 20, 12, 34, 56));
    assert.match(path.basename(nextPath), /^input_分班学号_20261120_123456_1\.xlsx$/);

    const writtenPath = path.join(dir, 'written.xlsx');
    writeWorkbook(writtenPath, 'Sheet1', ['姓名', '学号'], [['张三', '20261011101']]);
    const written = readWorkbook(writtenPath);
    assert.deepEqual(written.headerRow, ['姓名', '学号']);
    assert.deepEqual(written.dataRows[0], ['张三', '20261011101']);
});
