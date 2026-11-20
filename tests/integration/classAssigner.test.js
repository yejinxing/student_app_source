const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');
const xlsx = require('xlsx');

const { analyzeWorkbook, generateWorkbook } = require('../../src/classAssigner');
const { makeTempDir, removeTempDir } = require('../helpers/tmp');
const { writeClassAssignWorkbook, CLASS_ASSIGN_COLUMNS } = require('../helpers/fixtures');

function writeSheet(filePath, headers, rows) {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([headers, ...rows]), 'Sheet1');
    xlsx.writeFile(workbook, filePath);
}

function rowsToAoa(headers, rows) {
    return rows.map(row => headers.map(name => (row[name] === undefined ? '' : row[name])));
}

function makeRows({ prefix, total, maleCount, majorCode, majorName, classCount = '', offset = 0 }) {
    const provinces = ['湖北', '河南', '山东', '江西', '湖南'];
    return Array.from({ length: total }, (_, index) => ({
        '姓名': `${prefix}${String(index + 1).padStart(3, '0')}`,
        '身份证号码': `11010120000101${String(offset + index + 1).padStart(4, '0')}`,
        '考生号': `${prefix}${String(index + 1).padStart(6, '0')}`,
        '性别': index < maleCount ? '男' : '女',
        '层次': '本科',
        '层次代码': '1',
        '省份': provinces[index % provinces.length],
        '院系名称': '机械工程系',
        '院系代码': '01',
        '专业名称': majorName,
        '专业代码': majorCode,
        '班级数量': classCount
    }));
}

function readOutput(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

test('分析并生成分班学号 Excel', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'students.xlsx');

    writeClassAssignWorkbook(inputPath, [
        ...makeRows({ prefix: 'A', total: 50, maleCount: 30, majorCode: '1', majorName: '专业A', offset: 0 }),
        ...makeRows({ prefix: 'B', total: 82, maleCount: 54, majorCode: '2', majorName: '专业B', classCount: '2', offset: 50 }),
        ...makeRows({ prefix: 'C', total: 72, maleCount: 60, majorCode: '3', majorName: '专业C', offset: 132 })
    ]);

    const analysis = analyzeWorkbook(inputPath);
    assert.equal(analysis.ok, true);
    assert.equal(analysis.data.groups.length, 3);
    assert.equal(analysis.data.defaultYear, new Date().getFullYear());
    assert.equal(analysis.data.groups[0].initialClassCount, 2);
    assert.equal(analysis.data.groups[1].initialClassCount, 2);
    assert.equal(analysis.data.groups[2].initialClassCount, 2);

    const classCounts = Object.fromEntries(
        analysis.data.groups.map(group => [group.key, group.initialClassCount])
    );
    const result = generateWorkbook({
        filePath: inputPath,
        fingerprint: analysis.data.fingerprint,
        classCounts,
        year: 2027
    });
    assert.equal(result.ok, true);
    assert.equal(await fs.pathExists(result.data.outputPath), true);

    const rows = readOutput(result.data.outputPath);
    const header = rows[0];
    assert.ok(header.includes('班级名称'));
    assert.ok(header.includes('班号'));
    assert.ok(header.includes('班级数量'));
    assert.ok(header.includes('学号'));

    const dataRows = rows.slice(1);
    assert.equal(dataRows.length, 204);

    const classIndex = header.indexOf('班级名称');
    const countIndex = header.indexOf('班级数量');
    const idIndex = header.indexOf('学号');
    const majorIndex = header.indexOf('专业代码');

    const byMajor = { '1': [], '2': [], '3': [] };
    for (const row of dataRows) {
        byMajor[row[majorIndex]].push(row);
        assert.match(row[idIndex], /^2027\d{7}$/);
        assert.equal(row[idIndex].slice(7, 8), row[majorIndex]);
    }

    assert.deepEqual(
        [1, 2].map(classNo => byMajor['1'].filter(row => row[classIndex] === `${classNo}班`).length),
        [25, 25]
    );
    assert.deepEqual(
        [1, 2].map(classNo => byMajor['2'].filter(row => row[classIndex] === `${classNo}班`).length),
        [41, 41]
    );
    assert.deepEqual(
        [1, 2].map(classNo => byMajor['3'].filter(row => row[classIndex] === `${classNo}班`).length),
        [36, 36]
    );
    assert.ok(byMajor['1'].every(row => Number(row[countIndex]) === 2));

    const aNames = byMajor['1'].map(row => row[header.indexOf('姓名')]);
    assert.equal(aNames.length, 50);
    assert.ok(aNames.every(name => name.startsWith('A')));

    const bNames = byMajor['2'].map(row => row[header.indexOf('姓名')]);
    assert.equal(bNames.length, 82);
    assert.ok(bNames.every(name => name.startsWith('B')));

    const cNames = byMajor['3'].map(row => row[header.indexOf('姓名')]);
    assert.equal(cNames.length, 72);
    assert.ok(cNames.every(name => name.startsWith('C')));
});

test('文件指纹变化拒绝生成', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'students.xlsx');
    writeClassAssignWorkbook(inputPath, makeRows({
        prefix: 'D', total: 50, maleCount: 30, majorCode: '1', majorName: '专业D'
    }));

    analyzeWorkbook(inputPath);
    const result = generateWorkbook({
        filePath: inputPath,
        fingerprint: '0:0',
        classCounts: { '1|01|1': 2 },
        year: 2027
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'FILE_CHANGED');
});

test('非法年份拒绝生成', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'students.xlsx');
    writeClassAssignWorkbook(inputPath, makeRows({
        prefix: 'E', total: 50, maleCount: 30, majorCode: '1', majorName: '专业E'
    }));
    const analysis = analyzeWorkbook(inputPath);
    const result = generateWorkbook({
        filePath: inputPath,
        fingerprint: analysis.data.fingerprint,
        classCounts: { '1|01|1': 2 },
        year: '26'
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'INVALID_YEAR');
});

test('缺列和重复表头直接报错', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));

    const missingPath = path.join(dir, 'missing.xlsx');
    const missingWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(missingWorkbook, xlsx.utils.aoa_to_sheet([
        ['姓名', '性别', '层次代码', '院系名称', '院系代码', '专业名称'],
        ['张三', '男', '1', '机械工程系', '01', '专业A']
    ]), 'Sheet1');
    xlsx.writeFile(missingWorkbook, missingPath);
    const missing = analyzeWorkbook(missingPath);
    assert.equal(missing.ok, false);
    assert.equal(missing.error.code, 'HEADER_MISSING');

    const duplicatePath = path.join(dir, 'duplicate.xlsx');
    const duplicateWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(duplicateWorkbook, xlsx.utils.aoa_to_sheet([
        ['姓名', '姓名', '性别', '层次代码', '院系名称', '院系代码', '专业名称', '专业代码'],
        ['张三', '张三', '男', '1', '机械工程系', '01', '专业A', '1']
    ]), 'Sheet1');
    xlsx.writeFile(duplicateWorkbook, duplicatePath);
    const duplicate = analyzeWorkbook(duplicatePath);
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.error.code, 'HEADER_DUPLICATE');
});

test('无可用班级方案报错', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'too-many.xlsx');
    writeClassAssignWorkbook(inputPath, makeRows({
        prefix: 'F', total: 892, maleCount: 500, majorCode: '1', majorName: '专业F'
    }));

    const result = analyzeWorkbook(inputPath);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'NO_VALID_CLASS_PLAN');
});

test('无效班级数阻止生成', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'invalid-count.xlsx');
    writeClassAssignWorkbook(inputPath, makeRows({
        prefix: 'G', total: 50, maleCount: 30, majorCode: '1', majorName: '专业G'
    }));
    const analysis = analyzeWorkbook(inputPath);
    const result = generateWorkbook({
        filePath: inputPath,
        fingerprint: analysis.data.fingerprint,
        classCounts: { '1|01|1': 0 },
        year: 2027
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'CLASS_COUNT_INVALID');
});

test('分析时提示将覆盖已有目标列', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'existing-columns.xlsx');
    const headers = [
        '姓名', '身份证号码', '考生号', '性别', '层次', '层次代码', '省份',
        '院系名称', '院系代码', '专业名称', '专业代码', '学号', '班级名称'
    ];
    const rows = makeRows({ prefix: 'H', total: 50, maleCount: 30, majorCode: '1', majorName: '专业H' });
    writeSheet(inputPath, headers, rowsToAoa(headers, rows));

    const analysis = analyzeWorkbook(inputPath);
    assert.equal(analysis.ok, true);
    assert.ok(analysis.data.existingTargetColumns.includes('学号'));
    assert.ok(analysis.data.existingTargetColumns.includes('班级名称'));

    const warning = analysis.warnings.find(item => item.code === 'EXISTING_TARGET_COLUMNS');
    assert.ok(warning);
    assert.match(warning.message, /学号/);
    assert.match(warning.message, /班级名称/);
});

test('分析时提示编号重复且不阻止生成', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'duplicate-number.xlsx');
    const headers = ['编号', ...CLASS_ASSIGN_COLUMNS];
    const rows = rowsToAoa(headers, makeRows({
        prefix: 'I', total: 50, maleCount: 30, majorCode: '1', majorName: '专业I'
    }));
    rows[0][0] = '001';
    rows[1][0] = '002';
    rows[2][0] = '002';
    writeSheet(inputPath, headers, rows);

    const analysis = analyzeWorkbook(inputPath);
    assert.equal(analysis.ok, true);
    const warning = analysis.warnings.find(item => item.code === 'DUPLICATE_NUMBER');
    assert.ok(warning);
    assert.match(warning.message, /002/);

    const result = generateWorkbook({
        filePath: inputPath,
        fingerprint: analysis.data.fingerprint,
        classCounts: { '1|01|1': 2 },
        year: 2027
    });
    assert.equal(result.ok, true);
    assert.ok(result.warnings.some(item => item.code === 'EXISTING_TARGET_COLUMNS'));

    const output = readOutput(result.data.outputPath);
    const numberIndex = output[0].indexOf('编号');
    const values = output.slice(1).map(row => row[numberIndex]);
    assert.equal(values.filter(value => value === '002').length, 2);
    assert.ok(values.includes('001'));
});

test('无编号列时生成连续文本编号', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'auto-number.xlsx');
    writeClassAssignWorkbook(inputPath, makeRows({
        prefix: 'J', total: 50, maleCount: 30, majorCode: '1', majorName: '专业J'
    }));

    const analysis = analyzeWorkbook(inputPath);
    const result = generateWorkbook({
        filePath: inputPath,
        fingerprint: analysis.data.fingerprint,
        classCounts: { '1|01|1': 2 },
        year: 2027
    });
    assert.equal(result.ok, true);

    const output = readOutput(result.data.outputPath);
    const numberIndex = output[0].indexOf('编号');
    assert.ok(numberIndex >= 0);
    const numbers = output.slice(1).map(row => row[numberIndex]);
    assert.equal(numbers.length, 50);
    assert.ok(numbers.every(value => typeof value === 'string'));
    const expected = Array.from({ length: 50 }, (_, index) => String(index + 1));
    assert.deepEqual(numbers.slice().sort((a, b) => Number(a) - Number(b)), expected);
});

test('已有编号列时保留原值', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'keep-number.xlsx');
    const headers = ['编号', ...CLASS_ASSIGN_COLUMNS];
    const aoa = rowsToAoa(headers, makeRows({
        prefix: 'K', total: 50, maleCount: 30, majorCode: '1', majorName: '专业K'
    }));
    const expected = [];
    for (let index = 0; index < aoa.length; index += 1) {
        const value = `K${String(index + 1).padStart(3, '0')}`;
        aoa[index][0] = value;
        expected.push(value);
    }
    writeSheet(inputPath, headers, aoa);

    const analysis = analyzeWorkbook(inputPath);
    const result = generateWorkbook({
        filePath: inputPath,
        fingerprint: analysis.data.fingerprint,
        classCounts: { '1|01|1': 2 },
        year: 2027
    });
    assert.equal(result.ok, true);

    const output = readOutput(result.data.outputPath);
    const numberIndex = output[0].indexOf('编号');
    const values = output.slice(1).map(row => row[numberIndex]);
    assert.deepEqual(values.slice().sort(), expected.slice().sort());
});

test('文件读取失败返回错误对象而不抛出', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const missingPath = path.join(dir, 'missing.xlsx');

    const analysis = analyzeWorkbook(missingPath);
    assert.equal(analysis.ok, false);
    assert.equal(typeof analysis.error.code, 'string');
    assert.ok(analysis.error.message);
    assert.deepEqual(analysis.warnings, []);

    const result = generateWorkbook({
        filePath: missingPath,
        fingerprint: '1:1',
        classCounts: {},
        year: 2027
    });
    assert.equal(result.ok, false);
    assert.equal(typeof result.error.code, 'string');
    assert.ok(result.error.message);
    assert.deepEqual(result.warnings, []);
});
