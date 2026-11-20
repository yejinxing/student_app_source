const xlsx = require('xlsx');

const STUDENT_COLUMNS = [
    '系（部）', '专业名称', '班级名称', '学制', '层次',
    '学号', '姓名', '性别', '出生日期', '政治面貌',
    '民族', '生源地所在地', '备注'
];

const CLASS_ASSIGN_COLUMNS = [
    '姓名', '身份证号码', '考生号', '性别', '层次', '层次代码',
    '省份', '院系名称', '院系代码', '专业名称', '专业代码', '班级数量'
];

function defaultStudentRows() {
    return [
        {
            '系（部）': '计算机系',
            '专业名称': '软件技术',
            '班级名称': '25gb软件1班',
            '学制': '四年',
            '层次': '本科',
            '学号': '2025001',
            '姓名': '张三',
            '性别': '男',
            '出生日期': '2006-01',
            '政治面貌': '共青团员',
            '民族': '汉族',
            '生源地所在地': '河北',
            '备注': ''
        },
        {
            '系（部）': '计算机系',
            '专业名称': '软件技术',
            '班级名称': '25gb软件1班',
            '学制': '四年',
            '层次': '本科',
            '学号': '2025002',
            '姓名': '李四',
            '性别': '女',
            '出生日期': '2006-02',
            '政治面貌': '群众',
            '民族': '回族',
            '生源地所在地': '河南',
            '备注': ''
        },
        {
            '系（部）': '机械工程系',
            '专业名称': '机械制造',
            '班级名称': '25gz机械1班',
            '学制': '三年',
            '层次': '专科',
            '学号': '2025003',
            '姓名': '王五',
            '性别': '男',
            '出生日期': '2007-03',
            '政治面貌': '群众',
            '民族': '汉族',
            '生源地所在地': '山东',
            '备注': ''
        }
    ];
}

function writeStudentWorkbook(filePath, rows = defaultStudentRows()) {
    const worksheet = xlsx.utils.json_to_sheet(rows, { header: STUDENT_COLUMNS });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '学生信息');
    xlsx.writeFile(workbook, filePath);
}

function writeClassAssignWorkbook(filePath, rows) {
    const worksheet = xlsx.utils.json_to_sheet(rows, { header: CLASS_ASSIGN_COLUMNS });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    xlsx.writeFile(workbook, filePath);
}

module.exports = {
    STUDENT_COLUMNS,
    CLASS_ASSIGN_COLUMNS,
    defaultStudentRows,
    writeStudentWorkbook,
    writeClassAssignWorkbook
};
