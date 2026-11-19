const { TableCell, Paragraph, TextRun, AlignmentType, VerticalAlign, BorderStyle } = require('docx');

// 将厘米转换为 twip（Word 文档单位，1cm = 567 twip）
const cmToTwip = (cm) => Math.round(cm * 567);

// 创建无边框单元格
function createNoBorderCell(children, options = {}) {
    return new TableCell({
        children: children,
        width: options.width,
        columnSpan: options.columnSpan,
        rowSpan: options.rowSpan,
        verticalAlign: options.verticalAlign || VerticalAlign.CENTER,
        borders: {
            top: { style: BorderStyle.SINGLE, size: 4 },
            bottom: { style: BorderStyle.SINGLE, size: 4 },
            left: { style: BorderStyle.SINGLE, size: 4 },
            right: { style: BorderStyle.SINGLE, size: 4 },
        }
    });
}

// 创建居中段落
function createCenteredParagraph(text, options = {}) {
    return new Paragraph({
        children: [new TextRun({ 
            text: text, 
            size: options.size || 20, 
            font: options.font || "宋体",
            bold: options.bold || false
        })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 }
    });
}

// 创建表头单元格
function createHeaderCell(text, options = {}) {
    return new TableCell({
        children: [createCenteredParagraph(text, { size: 20, font: "宋体", bold: true })],
        width: options.width,
        columnSpan: options.columnSpan,
        rowSpan: options.rowSpan,
        verticalAlign: VerticalAlign.CENTER,
        borders: {
            top: { style: BorderStyle.SINGLE, size: 4 },
            bottom: { style: BorderStyle.SINGLE, size: 4 },
            left: { style: BorderStyle.SINGLE, size: 4 },
            right: { style: BorderStyle.SINGLE, size: 4 },
        }
    });
}

// 创建数据单元格
// options.fillZero: 为true时，空值显示为0（用于统计表格）
function createDataCell(text, options = {}) {
    let displayText;
    if (options.fillZero) {
        // 统计表格：空值显示为0
        displayText = (text === null || text === undefined || text === '') ? '0' : String(text);
    } else {
        // 其他表格：空值显示为空字符串，但数字0正常显示
        displayText = (text === null || text === undefined) ? '' : String(text);
    }
    return new TableCell({
        children: [createCenteredParagraph(displayText, { size: 20, font: "宋体" })],
        width: options.width,
        columnSpan: options.columnSpan,
        rowSpan: options.rowSpan,
        verticalAlign: VerticalAlign.CENTER,
        borders: {
            top: { style: BorderStyle.SINGLE, size: 4 },
            bottom: { style: BorderStyle.SINGLE, size: 4 },
            left: { style: BorderStyle.SINGLE, size: 4 },
            right: { style: BorderStyle.SINGLE, size: 4 },
        }
    });
}

// 数据行行高（1.22cm）
const DATA_ROW_HEIGHT = cmToTwip(1.22);

// 统计表格列宽常量
const SUMMARY_COL_WIDTHS = {
    DEPT: cmToTwip(2.19),           // 总统计表系部列宽 2.19cm
    DEPT_LEVEL: cmToTwip(3.61),     // 分层统计表（子表格）系部列宽 3.61cm
    CLASS_COUNT: cmToTwip(1.32),    // 班级数列宽 1.32cm
    TOTAL: cmToTwip(1.32),          // 总计列宽 1.32cm
    SUB_COL: cmToTwip(1.2),         // 子列宽度 1.2cm（层次、性别、政治面貌、民族的子列）
};

// 统计表格表头行高常量
const SUMMARY_HEADER_HEIGHTS = {
    ROW1: cmToTwip(0.8),   // 第一行表头行高 0.8cm
    ROW2: cmToTwip(1.2),   // 第二行表头行高 1.2cm
};

// 清理文本中的空格和换行符（用于统计表格子列内容）
function cleanSubColText(text) {
    if (!text) return '';
    return String(text).replace(/[\s\n\r]/g, '');
}

module.exports = {
    cmToTwip,
    createNoBorderCell,
    createCenteredParagraph,
    createHeaderCell,
    createDataCell,
    DATA_ROW_HEIGHT,
    SUMMARY_COL_WIDTHS,
    SUMMARY_HEADER_HEIGHTS,
    cleanSubColText
};
