const { convertExcelToWord } = require('./converter');
const path = require('path');

async function test() {
    const excelPath = path.join(__dirname, 'test_students.xlsx');
    const outputPath = path.join(__dirname, 'test_output.docx');
    
    console.log('开始转换...');
    try {
        await convertExcelToWord(excelPath, outputPath);
        console.log('转换成功！输出文件：', outputPath);
    } catch (err) {
        console.error('转换失败：', err);
    }
}

test();
