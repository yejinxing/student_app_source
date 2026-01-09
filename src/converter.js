const xlsx = require('xlsx');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun, BorderStyle, PageNumber } = require('docx');
const fs = require('fs-extra');

async function convertExcelToWord(excelPath, outputPath) {
    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    // 按系、专业、班级分组
    const groups = {};
    data.forEach(row => {
        const key = `${row['系（部）']}_${row['专业名称']}_${row['班级名称']}_${row['学制']}`;
        if (!groups[key]) {
            groups[key] = {
                dept: row['系（部）'] || '',
                major: row['专业名称'] || '',
                className: row['班级名称'] || '',
                duration: row['学制'] || '',
                students: []
            };
        }
        groups[key].students.push(row);
    });

    const sections = [];

    // 将厘米转换为 twip（Word 文档单位，1cm = 567 twip）
    const cmToTwip = (cm) => Math.round(cm * 567);
    
    // 计算文本的字符宽度（估算）
    // 中文字符约占 2 个英文字符宽度，英文字符、数字、标点占 1 个宽度
    const calculateTextWidth = (text) => {
        let width = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            // 中文字符（包括中文标点）
            if (/[\u4e00-\u9fff]/.test(char)) {
                width += 2;
            } else if (/[^\x00-\x7f]/.test(char)) { // 其他非英文字符
                width += 2;
            } else { // 英文字符、数字、标点
                width += 1;
            }
        }
        return width;
    };
    
    // 计算表格列宽的动态分配算法
    // 第一列包含标签（如"系（部）："），第二列包含变量值（如专业名称）
    // 目标：第二列内容完整显示，贴右对齐，第一列自动调整
    const calculateColumnWidths = (label1, value1, label2, value2) => {
        // 页面总宽度（A4纸宽度 21cm 减去左右页边距）
        const PAGE_WIDTH = 21.0; // A4纸宽度
        const LEFT_MARGIN = 2.58; // 左页边距
        const RIGHT_MARGIN = 1.98; // 右页边距
        const AVAILABLE_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN; // 可用宽度
        
        // 固定第一列宽度，根据内容调整第二列
        // 第一列包含标签文字，固定为30%宽度
        // 第二列包含变量值，占据剩余70%宽度
        
        // 或者根据内容长度动态调整
        const minCol1Width = 25; // 最小25%宽度
        const maxCol1Width = 40; // 最大40%宽度
        
        // 计算专业名称的长度
        const majorLength = value2.length; // 专业名称字符数
        
        // 根据专业名称长度调整列宽
        let col1Percent;
        if (majorLength <= 8) {
            col1Percent = 35; // 较短专业名称，第一列占35%
        } else if (majorLength <= 12) {
            col1Percent = 30; // 中等长度，第一列占30%
        } else if (majorLength <= 16) {
            col1Percent = 28; // 较长，第一列占28%
        } else {
            col1Percent = 25; // 非常长，第一列占25%
        }
        
        // 确保在合理范围内
        col1Percent = Math.max(minCol1Width, Math.min(maxCol1Width, col1Percent));
        const col2Percent = 100 - col1Percent;
        
        return {
            col1Percent: col1Percent,
            col2Percent: col2Percent
        };
    };

    for (const key in groups) {
        const group = groups[key];
        
        // 使用隐形表格（无边框）实现页眉精准对齐
        const createHeaderTable = () => {
            // 计算动态列宽
            const colWidths = calculateColumnWidths(
                "系（部）：", group.dept, 
                "专业名称：", group.major
            );
            
            return new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                    top: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.NONE },
                    left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                    insideHorizontal: { style: BorderStyle.NONE },
                    insideVertical: { style: BorderStyle.NONE },
                },
                rows: [
                    new TableRow({
                        height: { value: cmToTwip(0.52), rule: "exact" }, // 固定行高 0.52cm
                        children: [
                            new TableCell({
                                width: { size: colWidths.col1Percent, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({
                                    children: [new TextRun({ text: `系（部）：${group.dept}`, size: 20, font: "宋体" })], // 10号字体对应 size: 20
                                })],
                            }),
                            new TableCell({
                                width: { size: colWidths.col2Percent, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({
                                    children: [new TextRun({ text: `专业名称：${group.major}`, size: 20, font: "宋体" })],
                                    alignment: AlignmentType.RIGHT // 右对齐，使内容贴右边界
                                })],
                            }),
                        ],
                    }),
                    new TableRow({
                        height: { value: cmToTwip(0.52), rule: "exact" }, // 固定行高 0.52cm
                        children: [
                            new TableCell({
                                width: { size: colWidths.col1Percent, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({
                                    children: [new TextRun({ text: `班级名称：${group.className}`, size: 20, font: "宋体" })],
                                })],
                            }),
                            new TableCell({
                                width: { size: colWidths.col2Percent, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({
                                    children: [new TextRun({ text: `学  制：${group.duration}`, size: 20, font: "宋体" })],
                                    alignment: AlignmentType.RIGHT // 右对齐，使内容贴右边界
                                })],
                            }),
                        ],
                    }),
                ],
            });
        };

        // 表头
        const tableHeader = new TableRow({
            height: { value: cmToTwip(1.02), rule: "exact" }, // 固定行高 1.02cm
            children: [
                "学号", "姓名", "性别", "出生年月", "政治面貌", "民族", "生源所在地", "备注"
            ].map(text => new TableCell({
                children: [new Paragraph({ 
                    children: [new TextRun({ text, bold: true, size: 20, font: "宋体" })], // 10号字体，加粗
                    alignment: AlignmentType.CENTER 
                })],
                verticalAlign: "center",
            }))
        });

        // 分页处理：每页固定行数
        const ROWS_PER_PAGE = 49;
        for (let i = 0; i < group.students.length; i += ROWS_PER_PAGE) {
            const pageStudents = group.students.slice(i, i + ROWS_PER_PAGE);
            const tableRows = [tableHeader];

            pageStudents.forEach(student => {
                tableRows.push(new TableRow({
                    height: { value: cmToTwip(0.51), rule: "exact" }, // 固定行高 0.51cm
                    children: [
                        "学号", "姓名", "性别", "出生年月", "政治面貌", "民族", "生源所在地", "备注"
                    ].map(field => new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: String(student[field] || ""), size: 20, font: "宋体" })], // 10号字体
                            alignment: AlignmentType.CENTER 
                        })],
                        verticalAlign: "center"
                    }))
                }));
            });

            // 移除自动添加空白行的逻辑，只显示实际有数据的行

            const mainTable = new Table({
                rows: tableRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 4 },
                    bottom: { style: BorderStyle.SINGLE, size: 4 },
                    left: { style: BorderStyle.SINGLE, size: 4 },
                    right: { style: BorderStyle.SINGLE, size: 4 },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 2 },
                    insideVertical: { style: BorderStyle.SINGLE, size: 2 },
                }
            });

            sections.push({
                properties: {
                    page: {
                        margin: { 
                            top: cmToTwip(0.98), // 上页边距：0.98cm
                            right: cmToTwip(1.98), // 右页边距：1.98cm
                            bottom: cmToTwip(1.04), // 下页边距：1.04cm
                            left: cmToTwip(2.58) // 左页边距：2.58cm
                        }
                    }
                },
                children: [
                    createHeaderTable(),
                    new Paragraph({ 
                        text: "", 
                        spacing: { line: 100, before: 0, after: 0 } // 固定行间距5磅（1磅=20 twip，5磅=100 twip）
                    }), // 间距
                    mainTable
                ],
            });
        }
    }

    const doc = new Document({ 
        sections,
        features: { updateFields: true }
    });
    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(outputPath, buffer);
}

module.exports = { convertExcelToWord };
