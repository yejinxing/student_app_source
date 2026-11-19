const { Table, TableRow, WidthType, TableLayoutType, AlignmentType } = require('docx');
const { createHeaderCell, createDataCell, cleanSubColText, DATA_ROW_HEIGHT, SUMMARY_COL_WIDTHS, SUMMARY_HEADER_HEIGHTS } = require('./styles');
const { getDeptIndex } = require('./statistics');


// 创建第一页总统计表
function createSummaryTable(statistics, year) {
    const rows = [];
    
    // 表头第一行（行高0.8cm）
    rows.push(new TableRow({
        height: { value: SUMMARY_HEADER_HEIGHTS.ROW1, rule: "exact" },
        children: [
            createHeaderCell('系  部', { rowSpan: 2, width: { size: SUMMARY_COL_WIDTHS.DEPT, type: WidthType.DXA } }),
            createHeaderCell('班级数', { rowSpan: 2, width: { size: SUMMARY_COL_WIDTHS.CLASS_COUNT, type: WidthType.DXA } }),
            createHeaderCell('总计', { rowSpan: 2, width: { size: SUMMARY_COL_WIDTHS.TOTAL, type: WidthType.DXA } }),
            createHeaderCell('层次', { columnSpan: 3 }),
            createHeaderCell('性别', { columnSpan: 2 }),
            createHeaderCell('政治面貌', { columnSpan: 4 }),
            createHeaderCell('民族', { columnSpan: 2 }),
        ]
    }));
    
    // 表头第二行（行高1.2cm）- 子列内容不允许空格和换行
    rows.push(new TableRow({
        height: { value: SUMMARY_HEADER_HEIGHTS.ROW2, rule: "exact" },
        children: [
            createHeaderCell(cleanSubColText('本科'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('专科'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('专升本'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('男'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('女'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('群众'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('共青团员'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('中共预备党员'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('中共党员'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('汉族'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('少数民族'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
        ]
    }));
    
    // 数据行
    const depts = Object.keys(statistics.byDept).sort((a, b) => getDeptIndex(a) - getDeptIndex(b));
    
    for (const dept of depts) {
        const deptStats = statistics.byDept[dept];
        rows.push(new TableRow({
            height: { value: DATA_ROW_HEIGHT, rule: "exact" },
            children: [
                createDataCell(dept, { width: { size: SUMMARY_COL_WIDTHS.DEPT, type: WidthType.DXA } }),
                createDataCell(deptStats.classCount, { width: { size: SUMMARY_COL_WIDTHS.CLASS_COUNT, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.total, { width: { size: SUMMARY_COL_WIDTHS.TOTAL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.levels['本科'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.levels['专科'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.levels['专升本'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.gender['男'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.gender['女'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.politics['群众'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.politics['共青团员'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.politics['中共预备党员'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.politics['中共党员'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.ethnicity['汉族'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.ethnicity['少数民族'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            ]
        }));
    }
    
    // 总计行
    rows.push(new TableRow({
        height: { value: DATA_ROW_HEIGHT, rule: "exact" },
        children: [
            createHeaderCell('总计', { width: { size: SUMMARY_COL_WIDTHS.DEPT, type: WidthType.DXA } }),
            createDataCell(statistics.totalClassCount, { width: { size: SUMMARY_COL_WIDTHS.CLASS_COUNT, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalStudents, { width: { size: SUMMARY_COL_WIDTHS.TOTAL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalLevels['本科'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalLevels['专科'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalLevels['专升本'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalGender['男'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalGender['女'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalPolitics['群众'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalPolitics['共青团员'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalPolitics['中共预备党员'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalPolitics['中共党员'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalEthnicity['汉族'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(statistics.totalEthnicity['少数民族'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
        ]
    }));
    
    // 总统计表列宽数组：系部 + 班级数 + 总计 + 层次(3) + 性别(2) + 政治面貌(4) + 民族(2) = 14列
    const summaryColumnWidths = [
        SUMMARY_COL_WIDTHS.DEPT,        // 系部
        SUMMARY_COL_WIDTHS.CLASS_COUNT, // 班级数
        SUMMARY_COL_WIDTHS.TOTAL,       // 总计
        SUMMARY_COL_WIDTHS.SUB_COL,     // 本科
        SUMMARY_COL_WIDTHS.SUB_COL,     // 专科
        SUMMARY_COL_WIDTHS.SUB_COL,     // 专升本
        SUMMARY_COL_WIDTHS.SUB_COL,     // 男
        SUMMARY_COL_WIDTHS.SUB_COL,     // 女
        SUMMARY_COL_WIDTHS.SUB_COL,     // 群众
        SUMMARY_COL_WIDTHS.SUB_COL,     // 共青团员
        SUMMARY_COL_WIDTHS.SUB_COL,     // 中共预备党员
        SUMMARY_COL_WIDTHS.SUB_COL,     // 中共党员
        SUMMARY_COL_WIDTHS.SUB_COL,     // 汉族
        SUMMARY_COL_WIDTHS.SUB_COL,     // 少数民族
    ];
    
    return new Table({
        rows: rows,
        layout: TableLayoutType.FIXED,
        columnWidths: summaryColumnWidths,
        alignment: AlignmentType.CENTER, // 表格居中
    });
}

// 创建分层统计表（如本科新生情况统计表）
function createLevelSummaryTable(statistics, level, year) {
    const rows = [];
    
    // 表头第一行（行高0.8cm）
    rows.push(new TableRow({
        height: { value: SUMMARY_HEADER_HEIGHTS.ROW1, rule: "exact" },
        children: [
            createHeaderCell('系  部', { rowSpan: 2, width: { size: SUMMARY_COL_WIDTHS.DEPT_LEVEL, type: WidthType.DXA } }),
            createHeaderCell('班级数', { rowSpan: 2, width: { size: SUMMARY_COL_WIDTHS.CLASS_COUNT, type: WidthType.DXA } }),
            createHeaderCell('性别', { columnSpan: 2 }),
            createHeaderCell('总计', { rowSpan: 2, width: { size: SUMMARY_COL_WIDTHS.TOTAL, type: WidthType.DXA } }),
            createHeaderCell('政治面貌', { columnSpan: 2 }),
            createHeaderCell('民族', { columnSpan: 2 }),
        ]
    }));
    
    // 表头第二行（行高1.2cm）- 子列内容不允许空格和换行
    rows.push(new TableRow({
        height: { value: SUMMARY_HEADER_HEIGHTS.ROW2, rule: "exact" },
        children: [
            createHeaderCell(cleanSubColText('男'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('女'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('共青团员'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('群众'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('汉族'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
            createHeaderCell(cleanSubColText('少数民族'), { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA } }),
        ]
    }));
    
    // 数据行 - 只显示该层次有数据的系部
    const levelData = statistics.byLevel[level] || {};
    const depts = Object.keys(levelData.byDept || {}).sort((a, b) => getDeptIndex(a) - getDeptIndex(b));
    
    for (const dept of depts) {
        const deptStats = levelData.byDept[dept];
        rows.push(new TableRow({
            height: { value: DATA_ROW_HEIGHT, rule: "exact" },
            children: [
                createDataCell(dept, { width: { size: SUMMARY_COL_WIDTHS.DEPT_LEVEL, type: WidthType.DXA } }),
                createDataCell(deptStats.classCount, { width: { size: SUMMARY_COL_WIDTHS.CLASS_COUNT, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.gender['男'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.gender['女'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.total, { width: { size: SUMMARY_COL_WIDTHS.TOTAL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.politics['共青团员'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.politics['群众'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.ethnicity['汉族'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
                createDataCell(deptStats.ethnicity['少数民族'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            ]
        }));
    }
    
    // 总计行
    const levelTotal = levelData.total || {};
    rows.push(new TableRow({
        height: { value: DATA_ROW_HEIGHT, rule: "exact" },
        children: [
            createHeaderCell('总计', { width: { size: SUMMARY_COL_WIDTHS.DEPT_LEVEL, type: WidthType.DXA } }),
            createDataCell(levelTotal.classCount, { width: { size: SUMMARY_COL_WIDTHS.CLASS_COUNT, type: WidthType.DXA }, fillZero: true }),
            createDataCell(levelTotal.gender?.['男'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(levelTotal.gender?.['女'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(levelTotal.studentCount, { width: { size: SUMMARY_COL_WIDTHS.TOTAL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(levelTotal.politics?.['共青团员'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(levelTotal.politics?.['群众'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(levelTotal.ethnicity?.['汉族'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
            createDataCell(levelTotal.ethnicity?.['少数民族'], { width: { size: SUMMARY_COL_WIDTHS.SUB_COL, type: WidthType.DXA }, fillZero: true }),
        ]
    }));
    
    // 分层统计表列宽数组：系部 + 班级数 + 性别(2) + 总计 + 政治面貌(2) + 民族(2) = 9列
    const levelColumnWidths = [
        SUMMARY_COL_WIDTHS.DEPT_LEVEL,  // 系部 3.61cm
        SUMMARY_COL_WIDTHS.CLASS_COUNT, // 班级数
        SUMMARY_COL_WIDTHS.SUB_COL,     // 男
        SUMMARY_COL_WIDTHS.SUB_COL,     // 女
        SUMMARY_COL_WIDTHS.TOTAL,       // 总计
        SUMMARY_COL_WIDTHS.SUB_COL,     // 共青团员
        SUMMARY_COL_WIDTHS.SUB_COL,     // 群众
        SUMMARY_COL_WIDTHS.SUB_COL,     // 汉族
        SUMMARY_COL_WIDTHS.SUB_COL,     // 少数民族
    ];
    
    return new Table({
        rows: rows,
        layout: TableLayoutType.FIXED,
        columnWidths: levelColumnWidths,
        alignment: AlignmentType.CENTER, // 表格居中
    });
}

module.exports = { createSummaryTable, createLevelSummaryTable };
