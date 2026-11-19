const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const xlsx = require('xlsx');

const {
    normalizeDate,
    extractInfoFromText,
    parseExcelData,
    parseExamRow,
    aggregateExamSchedules,
    findUnconfiguredExamRows
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

test('parseExamRow 解析日期、时间与科目行', () => {
    assert.deepEqual(
        parseExamRow('2025-04-18  | 09:00 - 11:00  | 大学英语 |   | 054  | 21'),
        {
            date: '2025-04-18',
            timeStart: '09:00',
            timeEnd: '11:00',
            time: '09:00-11:00',
            subject: '大学英语'
        }
    );
    assert.equal(parseExamRow('不是考试行'), null);
});

test('aggregateExamSchedules 选择每个科目出现最多的时间', () => {
    const result = aggregateExamSchedules([
        { subject: '大学英语', timeStart: '09:00', timeEnd: '11:00' },
        { subject: '大学英语', timeStart: '09:00', timeEnd: '11:00' },
        { subject: '大学英语', timeStart: '10:00', timeEnd: '12:00' },
        { subject: '专业课一', timeStart: '14:00', timeEnd: '15:30' }
    ]);

    assert.equal(result[0].subject, '大学英语');
    assert.equal(result[0].timeStart, '09:00');
    assert.equal(result[0].timeEnd, '11:00');
    assert.equal(result[0].count, 2);
    assert.ok(result.some(item => item.subject === '专业课一' && item.time === '14:00-15:30'));
});

test('findUnconfiguredExamRows 识别 PDF 中未配置的考试行', () => {
    const lines = [
        '2025-04-18 | 09:00 - 11:00 | 大学英语 | | 054 | 21',
        '2025-04-18 | 14:00 - 15:30 | 专业课一 | | 054 | 21'
    ];

    assert.deepEqual(findUnconfiguredExamRows(lines, [{ pdfName: '大学英语' }]), ['专业课一']);
    assert.deepEqual(
        findUnconfiguredExamRows(lines, [{ pdfName: '大学英语' }, { pdfName: '专业课一' }]),
        []
    );
});
