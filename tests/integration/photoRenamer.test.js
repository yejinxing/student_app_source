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
    renamer.setProgressCallback(() => {});
    renamer.setFinishCallback((success) => {
        finished = success;
    });

    await renamer.run();

    assert.equal(finished, true);
    assert.equal(await fs.pathExists(path.join(outputDir, '110101200001010011.jpg')), true);
    assert.equal(await fs.pathExists(path.join(outputDir, '110101200001010022.jpg')), true);
    assert.equal(await fs.pathExists(path.join(outputDir, '110101200001010033.jpg')), true);
    assert.equal(await fs.pathExists(path.join(outputDir, '110101200001010033_1.jpg')), true);
    assert.equal(await fs.pathExists(path.join(outputDir, 'unmatched.jpg')), false);
    assert.ok(statuses.some((message) => message.includes('未匹配: unmatched.png')));

    const header = await fs.readFile(path.join(outputDir, '110101200001010011.jpg'));
    assert.deepEqual([...header.subarray(0, 3)], [0xff, 0xd8, 0xff]);
});
