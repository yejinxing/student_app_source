const path = require('path');
const xlsx = require('xlsx');

const headers = [
    '姓名', '身份证号码', '考生号', '性别', '层次', '层次代码',
    '省份', '院系名称', '院系代码', '专业名称', '专业代码', '班级数量'
];

const worksheet = xlsx.utils.aoa_to_sheet([headers]);
worksheet['!cols'] = headers.map(header => ({ wch: Math.max(12, header.length * 2) }));
const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
xlsx.writeFile(workbook, path.resolve(__dirname, '..', 'assets', '学生分班模板.xlsx'), { bookType: 'xlsx' });
console.log('生成 assets/学生分班模板.xlsx');
