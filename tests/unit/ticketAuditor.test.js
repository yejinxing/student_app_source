const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const xlsx = require('xlsx');

const {
    normalizeDate,
    extractInfoFromText,
    parseExcelData
} = require('../../src/ticketAuditor');
const { makeTempDir, removeTempDir } = require('../helpers/tmp');

test('normalizeDate 统一补零为 YYYYMMDD', () => {
    assert.equal(normalizeDate('2025-04-18'), '20250418');
    assert.equal(normalizeDate('2025年4月18日'), '20250418');
    assert.equal(normalizeDate('2025/4/8'), '20250408');
    assert.equal(normalizeDate('20250418'), '20250418');
    assert.equal(normalizeDate(''), '');
    assert.equal(normalizeDate(null), '');
});

test('extractInfoFromText 提取姓名、准考证号与身份证号', () => {
    const info = extractInfoFromText(
        '姓名：张三\n准考证号：1234567890\n身份证号：11010120000101123X'
    );

    assert.equal(info.name, '张三');
    assert.equal(info.ticketNo, '1234567890');
    assert.equal(info.idCard, '11010120000101123X');
});

test('extractInfoFromText 对缺失字段返回空对象', () => {
    assert.deepEqual(extractInfoFromText('没有可识别字段'), {});
});

test('parseExcelData 同时按准考证号、身份证号和姓名建立索引', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));

    const excelPath = path.join(dir, 'audit.xlsx');
    const worksheet = xlsx.utils.json_to_sheet([
        {
            '准考证号': '1001',
            '身份证号': '110101200001010011',
            '姓名': '张三',
            '考试日期': '2025-04-18',
            '英语考场号': '01',
            '英语座位号': '1'
        }
    ]);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    xlsx.writeFile(workbook, excelPath);

    const { idMap, nameMap } = parseExcelData(excelPath);

    assert.equal(idMap.get('1001').姓名, '张三');
    assert.equal(idMap.get('110101200001010011').姓名, '张三');
    assert.equal(nameMap.get('张三').length, 1);
    assert.equal(nameMap.get('张三')[0].考试日期, '2025-04-18');
});
