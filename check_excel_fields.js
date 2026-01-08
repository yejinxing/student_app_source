
const xlsx = require('xlsx');
const path = require('path');

// 读取 Excel 文件
const excelPath = path.join(__dirname, 'test_students.xlsx');
const workbook = xlsx.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet);

console.log('Excel 文件内容:');
console.log(data);

if (data.length > 0) {
    console.log('字段名称:');
    console.log(Object.keys(data[0]));
} else {
    console.log('Excel 文件为空');
}
