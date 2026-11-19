const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');
const xlsx = require('xlsx');
const sharp = require('sharp');

const PhotoRenamer = require('../../src/photoRenamer');
const { makeTempDir, removeTempDir } = require('../helpers/tmp');

function writeMappingWorkbook(filePath, rows) {
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    xlsx.writeFile(workbook, filePath);
}

async function writePng(filePath, background) {
    await sharp({ create: { width: 4, height: 4, channels: 3, background } })
        .png()
        .toFile(filePath);
}

async function writeJpeg(filePath, background) {
    await sharp({ create: { width: 4, height: 4, channels: 3, background } })
        .jpeg()
        .toFile(filePath);
}

test('PhotoRenamer 按 ksh 匹配、忽略大小写并转换输出格式', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));

    const excelPath = path.join(dir, 'students.xlsx');
    const inputDir = path.join(dir, 'photos');
    const outputDir = path.join(dir, 'output');
    await fs.ensureDir(inputDir);

    writeMappingWorkbook(excelPath, [
        { ksh: 'A1001', sfz: '110101200001010011' },
        { ksh: 'a1002', sfz: '110101200001010022' },
        { ksh: 'A1003', sfz: '110101200001010033' }
    ]);

    await writePng(path.join(inputDir, 'A1001.png'), { r: 255, g: 0, b: 0 });
    await writePng(path.join(inputDir, 'a1002.png'), { r: 0, g: 255, b: 0 });
    await writePng(path.join(inputDir, 'A1003.png'), { r: 0, g: 0, b: 255 });
    await writeJpeg(path.join(inputDir, 'A1003.jpg'), { r: 255, g: 255, b: 0 });
    await writePng(path.join(inputDir, 'unmatched.png'), { r: 0, g: 0, b: 0 });

    const statuses = [];
    const progressValues = [];
    let finished = null;
    const renamer = new PhotoRenamer({
        excelPath,
        photoDir: inputDir,
        outputDir,
        outputExt: 'jpg',
        inputField: 'ksh',
        outputField: 'sfz'
    });
    renamer.setStatusCallback((message) => statuses.push(message));
    renamer.setProgressCallback((progress) => progressValues.push(progress));
    renamer.setFinishCallback((success) => {
        finished = success;
    });

    await renamer.run();

    assert.equal(finished, true);
    assert.equal(progressValues[0], 0);
    assert.equal(progressValues[progressValues.length - 1], 100);
    assert.equal(await fs.pathExists(path.join(outputDir, '110101200001010011.jpg')), true);
    assert.equal(await fs.pathExists(path.join(outputDir, '110101200001010022.jpg')), true);
    assert.equal(await fs.pathExists(path.join(outputDir, '110101200001010033.jpg')), true);
    assert.equal(await fs.pathExists(path.join(outputDir, '110101200001010033_1.jpg')), true);
    assert.equal(await fs.pathExists(path.join(outputDir, 'unmatched.jpg')), false);
    assert.ok(statuses.some((message) => message.includes('未匹配: unmatched.png')));

    const header = await fs.readFile(path.join(outputDir, '110101200001010011.jpg'));
    assert.deepEqual([...header.subarray(0, 3)], [0xff, 0xd8, 0xff]);
});

test('PhotoRenamer 支持停止且不会把进度补到 100%', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));

    const excelPath = path.join(dir, 'students.xlsx');
    const inputDir = path.join(dir, 'photos');
    const outputDir = path.join(dir, 'output');
    await fs.ensureDir(inputDir);

    writeMappingWorkbook(excelPath, [
        { ksh: 'B1001', sfz: '110101200001010101' },
        { ksh: 'B1002', sfz: '110101200001010102' },
        { ksh: 'B1003', sfz: '110101200001010103' }
    ]);
    await writePng(path.join(inputDir, 'B1001.png'), { r: 255, g: 0, b: 0 });
    await writePng(path.join(inputDir, 'B1002.png'), { r: 0, g: 255, b: 0 });
    await writePng(path.join(inputDir, 'B1003.png'), { r: 0, g: 0, b: 255 });

    const progressValues = [];
    let finished = null;
    const renamer = new PhotoRenamer({
        excelPath,
        photoDir: inputDir,
        outputDir,
        outputExt: 'keep',
        inputField: 'ksh',
        outputField: 'sfz'
    });
    renamer.setStatusCallback(() => {});
    renamer.setFinishCallback((success) => {
        finished = success;
    });
    renamer.setProgressCallback((progress) => {
        progressValues.push(progress);
        if (progress > 0) renamer.stop();
    });

    await renamer.run();

    assert.equal(finished, false);
    assert.equal(progressValues[0], 0);
    assert.ok(!progressValues.includes(100));
});

test('PhotoRenamer 支持 WebP 输出转换', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));

    const excelPath = path.join(dir, 'students.xlsx');
    const inputDir = path.join(dir, 'photos');
    const outputDir = path.join(dir, 'output');
    await fs.ensureDir(inputDir);

    writeMappingWorkbook(excelPath, [{ ksh: 'C1001', sfz: '110101200001010201' }]);
    await writePng(path.join(inputDir, 'C1001.png'), { r: 10, g: 20, b: 30 });

    let finished = null;
    const renamer = new PhotoRenamer({
        excelPath,
        photoDir: inputDir,
        outputDir,
        outputExt: 'webp',
        inputField: 'ksh',
        outputField: 'sfz'
    });
    renamer.setStatusCallback(() => {});
    renamer.setProgressCallback(() => {});
    renamer.setFinishCallback((success) => {
        finished = success;
    });

    await renamer.run();

    assert.equal(finished, true);
    const outputPath = path.join(outputDir, '110101200001010201.webp');
    assert.equal(await fs.pathExists(outputPath), true);
    const outputBuffer = await fs.readFile(outputPath);
    const metadata = await sharp(outputBuffer).metadata();
    assert.equal(metadata.format, 'webp');
});

test('PhotoRenamer 重复执行时覆盖同名输出而不是追加后缀', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));

    const excelPath = path.join(dir, 'students.xlsx');
    const inputDir = path.join(dir, 'photos');
    const outputDir = path.join(dir, 'output');
    await fs.ensureDir(inputDir);

    writeMappingWorkbook(excelPath, [{ ksh: 'D1001', sfz: '110101200001010301' }]);

    const createRenamer = () => {
        const renamer = new PhotoRenamer({
            excelPath,
            photoDir: inputDir,
            outputDir,
            outputExt: 'png',
            inputField: 'ksh',
            outputField: 'sfz'
        });
        renamer.setStatusCallback(() => {});
        renamer.setProgressCallback(() => {});
        return renamer;
    };

    await writePng(path.join(inputDir, 'D1001.png'), { r: 255, g: 0, b: 0 });
    let firstFinished = null;
    const first = createRenamer();
    first.setFinishCallback((success) => {
        firstFinished = success;
    });
    await first.run();
    assert.equal(firstFinished, true);

    const outputPath = path.join(outputDir, '110101200001010301.png');
    const firstBuffer = await fs.readFile(outputPath);
    assert.equal((await sharp(firstBuffer).metadata()).width, 4);

    // 覆盖源图后再次执行，应直接覆盖同名输出
    await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 255 } } })
        .png()
        .toFile(path.join(inputDir, 'D1001.png'));

    let secondFinished = null;
    const second = createRenamer();
    second.setFinishCallback((success) => {
        secondFinished = success;
    });
    await second.run();

    assert.equal(secondFinished, true);
    assert.equal(await fs.pathExists(outputPath), true);
    assert.equal(await fs.pathExists(path.join(outputDir, '110101200001010301_1.png')), false);
    const secondBuffer = await fs.readFile(outputPath);
    assert.equal((await sharp(secondBuffer).metadata()).width, 8);
});
