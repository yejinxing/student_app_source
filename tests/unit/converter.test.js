const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    cmToTwip,
    extractYearFromClassName,
    getYearFromClasses,
    getLevel,
    getDeptIndex,
    DEPT_ORDER,
    calculateStatistics
} = require('../../src/converter');

test('cmToTwip 按 1cm=567twip 四舍五入', () => {
    assert.equal(cmToTwip(1), 567);
    assert.equal(cmToTwip(1.22), 692);
});

test('extractYearFromClassName 解析两位年份前缀', () => {
    assert.equal(extractYearFromClassName('25gb机器人1班'), 2025);
    assert.equal(extractYearFromClassName('24gz机制1班'), 2024);
    assert.equal(extractYearFromClassName('机器人1班'), null);
    assert.equal(extractYearFromClassName(''), null);
    assert.equal(extractYearFromClassName(null), null);
});

test('getYearFromClasses 取首个可解析班级的年份', () => {
    assert.equal(getYearFromClasses([
        { className: '机器人1班' },
        { className: '25gb机器人1班' }
    ]), 2025);
});

test('getLevel 优先使用层次字段，缺失时从班级名称推断', () => {
    assert.equal(getLevel('专升本', '25gb机器人1班'), '专升本');
    assert.equal(getLevel('专科', '25gb机器人1班'), '专科');
    assert.equal(getLevel('本科', '25gz机器人1班'), '本科');
    assert.equal(getLevel('', '25gbs机器人1班'), '专升本');
    assert.equal(getLevel('', '25gz机器人1班'), '专科');
    assert.equal(getLevel('', '25gb机器人1班'), '本科');
    assert.equal(getLevel('', ''), '本科');
});

test('getDeptIndex 按预定义顺序返回，未知系部排在末尾', () => {
    assert.equal(getDeptIndex('机械工程系'), 0);
    assert.equal(getDeptIndex('计算机系'), 2);
    assert.equal(getDeptIndex('不存在的系'), DEPT_ORDER.length);
});

test('calculateStatistics 汇总班级、层次、性别、政治面貌与民族', () => {
    const data = [
        {
            '系（部）': '计算机系',
            '专业名称': '软件技术',
            '班级名称': '25gb软件1班',
            '学制': '四年',
            '层次': '本科',
            '姓名': '张三',
            '性别': '男',
            '政治面貌': '共青团员',
            '民族': '汉族'
        },
        {
            '系（部）': '计算机系',
            '专业名称': '软件技术',
            '班级名称': '25gb软件1班',
            '学制': '四年',
            '层次': '本科',
            '姓名': '李四',
            '性别': '女',
            '政治面貌': '群众',
            '民族': '回族'
        },
        {
            '系（部）': '机械工程系',
            '专业名称': '机械制造',
            '班级名称': '25gz机械1班',
            '学制': '三年',
            '层次': '专科',
            '姓名': '王五',
            '性别': '男',
            '政治面貌': '群众',
            '民族': '汉族'
        }
    ];

    const { statistics, groups } = calculateStatistics(data);

    assert.equal(statistics.totalStudents, 3);
    assert.equal(statistics.totalClassCount, 2);
    assert.equal(Object.keys(groups).length, 2);
    assert.equal(statistics.classes.length, 2);
    assert.equal(statistics.byDept['计算机系'].classCount, 1);
    assert.equal(statistics.byDept['计算机系'].total, 2);
    assert.equal(statistics.byDept['机械工程系'].total, 1);
    assert.equal(statistics.byLevel['本科'].total.studentCount, 2);
    assert.equal(statistics.byLevel['专科'].total.studentCount, 1);
    assert.deepEqual(statistics.totalGender, { '男': 2, '女': 1 });
    assert.deepEqual(statistics.totalPolitics, { '共青团员': 1, '群众': 2 });
    assert.deepEqual(statistics.totalEthnicity, { '汉族': 2, '少数民族': 1 });
});
