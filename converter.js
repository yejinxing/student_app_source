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

    for (const key in groups) {
        const group = groups[key];
        
        // 使用隐形表格（无边框）实现页眉精准对齐
        const createHeaderTable = () => {
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
                                width: { size: 50, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({
                                    children: [new TextRun({ text: `系（部）：${group.dept}`, size: 20, font: "宋体" })], // 10号字体对应 size: 20
                                })],
                            }),
                            new TableCell({
                                width: { size: 50, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({
                                    children: [new TextRun({ text: `专业名称：${group.major}`, size: 20, font: "宋体" })],
                                })],
                            }),
                        ],
                    }),
                    new TableRow({
                        height: { value: cmToTwip(0.52), rule: "exact" }, // 固定行高 0.52cm
                        children: [
                            new TableCell({
                                width: { size: 50, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({
                                    children: [new TextRun({ text: `班级名称：${group.className}`, size: 20, font: "宋体" })],
                                })],
                            }),
                            new TableCell({
                                width: { size: 50, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({
                                    children: [new TextRun({ text: `学  制：${group.duration}`, size: 20, font: "宋体" })],
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
                "学号", "姓名", "性别", "出生日期", "政治面貌", "民族", "生源地所在地", "备注"
            ].map(text => new TableCell({
                children: [new Paragraph({ 
                    children: [new TextRun({ text, bold: true, size: 20, font: "宋体" })], // 10号字体，加粗
                    alignment: AlignmentType.CENTER 
                })],
                verticalAlign: "center",
            }))
        });

        // 分页处理：每页固定行数
        const ROWS_PER_PAGE = 28;
        for (let i = 0; i < group.students.length; i += ROWS_PER_PAGE) {
            const pageStudents = group.students.slice(i, i + ROWS_PER_PAGE);
            const tableRows = [tableHeader];

            pageStudents.forEach(student => {
                tableRows.push(new TableRow({
                    height: { value: cmToTwip(0.51), rule: "exact" }, // 固定行高 0.51cm
                    children: [
                        "学号", "姓名", "性别", "出生日期", "政治面貌", "民族", "生源地所在地", "备注"
                    ].map(field => new TableCell({
                        children: [new Paragraph({ 
                            children: [new TextRun({ text: String(student[field] || ""), size: 20, font: "宋体" })], // 10号字体
                            alignment: AlignmentType.CENTER 
                        })],
                        verticalAlign: "center"
                    }))
                }));
            });

            // 补齐空白行
            while (tableRows.length <= ROWS_PER_PAGE + 1) {
                tableRows.push(new TableRow({
                    height: { value: cmToTwip(0.51), rule: "exact" }, // 固定行高 0.51cm
                    children: Array(8).fill(0).map(() => new TableCell({ children: [] }))
                }));
            }

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
                    mainTable,
                    new Paragraph({
                        children: [
                            new TextRun({
                                children: [PageNumber.CURRENT],
                                size: 20, // 10号字体
                                font: "宋体"
                            }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 200 }
                    })
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
