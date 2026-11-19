const xlsx = require('xlsx');
const fs = require('fs-extra');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun, BorderStyle, PageBreak, VerticalAlign, HeadingLevel, TableOfContents, Footer, PageNumber, NumberFormat, TableLayoutType } = require('docx');
const { cmToTwip } = require('./styles');
const { createSummaryTable, createLevelSummaryTable } = require('./summaryTables');
const { calculateStatistics, getYearFromClasses, getDeptIndex } = require('./statistics');
const { calculateColumnWidths } = require('./textWidth');

async function convertExcelToWord(excelPath, outputPath) {
    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    // 计算统计数据
    const { statistics, groups } = calculateStatistics(data);
    
    // 从班级名称获取年份（如"25gb"→2025年）
    const year = getYearFromClasses(statistics.classes);
    
    const sections = [];
    

    
    // ============= 第一页：总统计表 =============
    sections.push({
        properties: {
            page: {
                margin: {
                    top: cmToTwip(0.98),
                    right: cmToTwip(1.98),
                    bottom: cmToTwip(1.04),
                    left: cmToTwip(2.58),
                    header: cmToTwip(0.9),  // 页眉上边距 0.9cm
                    footer: cmToTwip(0.6)   // 页脚下边距 0.6cm
                }
            }
        },
        children: [
            new Paragraph({
                children: [new TextRun({ text: `${year}年普通本、专科及专升本新生情况统计表`, size: 36, font: "黑体", bold: true })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }),
            createSummaryTable(statistics, year),
        ]
    });
    
    // ============= 第二页：目录 =============
    // 预计算页码 - 从第一个子统计表格"本科新生情况统计表"开始计数为第1页
    let currentPage = 1; // 第一个层次统计表从第1页开始
    const ROWS_PER_PAGE = 49;
    
    // 计算每个层次需要的页数
    const levelPageInfo = {};
    const levelOrder = ['本科', '专科', '专升本'];
    
    // 计算各班级页码 - 页码从第一个层次统计表开始计数为1
    const classPageNumbers = {};
    for (const level of levelOrder) {
        if (!statistics.byLevel[level]) continue;
        
        levelPageInfo[level] = { startPage: currentPage };
        currentPage++; // 层次统计表占1页
        
        // 按系部排序
        const depts = Object.keys(statistics.byLevel[level].byDept).sort((a, b) => getDeptIndex(a) - getDeptIndex(b));
        
        for (const dept of depts) {
            const classes = statistics.byLevel[level].byDept[dept].classes;
            // 按班级名称排序
            classes.sort((a, b) => a.className.localeCompare(b.className, 'zh-CN'));
            
            for (const classInfo of classes) {
                classPageNumbers[`${level}_${dept}_${classInfo.className}`] = currentPage;
                // 计算该班级需要多少页
                const pagesNeeded = Math.ceil(classInfo.studentCount / ROWS_PER_PAGE);
                currentPage += Math.max(1, pagesNeeded);
            }
        }
        
        levelPageInfo[level].endPage = currentPage - 1;
    }
    
    // 创建目录内容
    // 宋体四号 = 14pt = size 28，行距17磅 = 340 twip
    const TOC_FONT_SIZE = 28; // 四号字体
    const TOC_LINE_SPACING = 340; // 17磅固定行距 (17 * 20 twip)
    // 目录字体：中文宋体，英文Times New Roman
    const TOC_FONT = {
        eastAsia: "宋体",
        ascii: "Times New Roman",
        hAnsi: "Times New Roman"
    };
    
    const tocChildren = [
        new Paragraph({
            children: [new TextRun({ text: "目    录", size: 48, font: "黑体", bold: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
        })
    ];
    
    for (const level of levelOrder) {
        if (!statistics.byLevel[level]) continue;
        
        // 层次标题和起始页码
        tocChildren.push(new Paragraph({
            children: [
                new TextRun({ text: `${level}新生情况统计表`, size: TOC_FONT_SIZE, font: TOC_FONT, bold: true }),
                new TextRun({ text: '\t' }),
                new TextRun({ text: String(levelPageInfo[level].startPage), size: TOC_FONT_SIZE, font: TOC_FONT })
            ],
            spacing: { line: TOC_LINE_SPACING, lineRule: 'exact' },
            tabStops: [{ type: 'right', position: cmToTwip(14), leader: 'dot' }]
        }));
        
        // 按系部分组
        const depts = Object.keys(statistics.byLevel[level].byDept).sort((a, b) => getDeptIndex(a) - getDeptIndex(b));
        let deptIndex = 1;
        const chineseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        
        for (const dept of depts) {
            // 系部标题
            tocChildren.push(new Paragraph({
                children: [new TextRun({ 
                    text: `${chineseNumbers[deptIndex - 1] || deptIndex}、${dept}`, 
                    size: TOC_FONT_SIZE, 
                    font: TOC_FONT, 
                    bold: true 
                })],
                spacing: { line: TOC_LINE_SPACING, lineRule: 'exact' }
            }));
            
            // 该系部的班级列表
            const classes = statistics.byLevel[level].byDept[dept].classes;
            classes.sort((a, b) => a.className.localeCompare(b.className, 'zh-CN'));
            
            for (const classInfo of classes) {
                const pageNum = classPageNumbers[`${level}_${dept}_${classInfo.className}`];
                tocChildren.push(new Paragraph({
                    children: [
                        new TextRun({ text: classInfo.className, size: TOC_FONT_SIZE, font: TOC_FONT }),
                        new TextRun({ text: '\t' }),
                        new TextRun({ text: String(pageNum), size: TOC_FONT_SIZE, font: TOC_FONT })
                    ],
                    spacing: { line: TOC_LINE_SPACING, lineRule: 'exact' },
                    indent: { left: cmToTwip(0.5) },
                    tabStops: [{ type: 'right', position: cmToTwip(14), leader: 'dot' }]
                }));
            }
            
            deptIndex++;
        }
        
        // 层次之间添加分页符
        if (level !== levelOrder[levelOrder.length - 1]) {
            tocChildren.push(new Paragraph({
                children: [new PageBreak()]
            }));
        }
    }
    
    sections.push({
        properties: {
            page: {
                margin: {
                    top: cmToTwip(0.98),
                    right: cmToTwip(1.98),
                    bottom: cmToTwip(1.04),
                    left: cmToTwip(2.58),
                    header: cmToTwip(0.9),  // 页眉上边距 0.9cm
                    footer: cmToTwip(0.6)   // 页脚下边距 0.6cm
                }
            }
        },
        children: tocChildren
    });
    
    // ============= 各层次统计表和班级数据 =============
    // 创建页脚（包含页码）- Times New Roman 11号字 居中
    const createPageFooter = () => {
        return new Footer({
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({
                            children: [PageNumber.CURRENT],
                            font: "Times New Roman",
                            size: 22 // 11号字 = 22 half-points
                        })
                    ]
                })
            ]
        });
    };
    
    let isFirstPageNumberedSection = true; // 标记是否是第一个带页码的section
    
    for (const level of levelOrder) {
        if (!statistics.byLevel[level]) continue;
        
        // 层次统计表 - 第一个section需要设置页码从1开始
        const sectionProperties = {
            page: {
                margin: {
                    top: cmToTwip(0.98),
                    right: cmToTwip(1.98),
                    bottom: cmToTwip(1.04),
                    left: cmToTwip(2.58),
                    header: cmToTwip(0.9),  // 页眉上边距 0.9cm
                    footer: cmToTwip(0.6)   // 页脚下边距 0.6cm
                },
                pageNumbers: isFirstPageNumberedSection ? {
                    start: 1,
                    formatType: NumberFormat.DECIMAL
                } : undefined
            }
        };
        
        if (isFirstPageNumberedSection) {
            isFirstPageNumberedSection = false;
        }
        
        sections.push({
            properties: sectionProperties,
            footers: {
                default: createPageFooter()
            },
            children: [
                new Paragraph({
                    children: [new TextRun({ text: `${year}年${level}新生情况统计表`, size: 36, font: "黑体", bold: true })],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 1200, after: 400 }  // 段前60磅，段后20磅
                }),
                createLevelSummaryTable(statistics, level, year)
            ]
        });
        
        // 按系部排序
        const depts = Object.keys(statistics.byLevel[level].byDept).sort((a, b) => getDeptIndex(a) - getDeptIndex(b));
        
        for (const dept of depts) {
            const classes = statistics.byLevel[level].byDept[dept].classes;
            classes.sort((a, b) => a.className.localeCompare(b.className, 'zh-CN'));
            
            for (const classInfo of classes) {
                // 创建班级详情页
                const createHeaderTable = () => {
                    const colWidths = calculateColumnWidths(
                        "系（部）：", classInfo.dept,
                        "专业名称：", classInfo.major
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
                                height: { value: cmToTwip(0.52), rule: "exact" },
                                children: [
                                    new TableCell({
                                        width: { size: colWidths.col1Percent, type: WidthType.PERCENTAGE },
                                        children: [new Paragraph({
                                            children: [new TextRun({ text: `系（部）：${classInfo.dept}`, size: 20, font: "宋体" })],
                                        })],
                                    }),
                                    new TableCell({
                                        width: { size: colWidths.col2Percent, type: WidthType.PERCENTAGE },
                                        children: [new Paragraph({
                                            children: [new TextRun({ text: `专业名称：${classInfo.major}`, size: 20, font: "宋体" })],
                                            alignment: AlignmentType.RIGHT
                                        })],
                                    }),
                                ],
                            }),
                            new TableRow({
                                height: { value: cmToTwip(0.52), rule: "exact" },
                                children: [
                                    new TableCell({
                                        width: { size: colWidths.col1Percent, type: WidthType.PERCENTAGE },
                                        children: [new Paragraph({
                                            children: [new TextRun({ text: `班级名称：${classInfo.className}`, size: 20, font: "宋体" })],
                                        })],
                                    }),
                                    new TableCell({
                                        width: { size: colWidths.col2Percent, type: WidthType.PERCENTAGE },
                                        children: [new Paragraph({
                                            children: [new TextRun({ text: `学  制：${classInfo.duration}`, size: 20, font: "宋体" })],
                                            alignment: AlignmentType.RIGHT
                                        })],
                                    }),
                                ],
                            }),
                        ],
                    });
                };
                
                // 表头
                const tableHeader = new TableRow({
                    height: { value: cmToTwip(1.02), rule: "exact" },
                    children: [
                        "学号", "姓名", "性别", "出生年月", "政治面貌", "民族", "生源所在地", "备注"
                    ].map(text => new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text, bold: true, size: 20, font: "宋体" })],
                            alignment: AlignmentType.CENTER
                        })],
                        verticalAlign: "center",
                    }))
                });
                
                // 分页处理
                for (let i = 0; i < classInfo.students.length; i += ROWS_PER_PAGE) {
                    const pageStudents = classInfo.students.slice(i, i + ROWS_PER_PAGE);
                    const tableRows = [tableHeader];
                    
                    pageStudents.forEach(student => {
                        tableRows.push(new TableRow({
                            height: { value: cmToTwip(0.51), rule: "exact" },
                            children: [
                                { field: "学号", value: student['学号'] },
                                { field: "姓名", value: student['姓名'] },
                                { field: "性别", value: student['性别'] },
                                { field: "出生年月", value: student['出生日期'] || student['出生年月'] },
                                { field: "政治面貌", value: student['政治面貌'] },
                                { field: "民族", value: student['民族'] },
                                { field: "生源所在地", value: student['生源地所在地'] || student['生源所在地'] },
                                { field: "备注", value: student['备注'] }
                            ].map(item => new TableCell({
                                children: [new Paragraph({
                                    children: [new TextRun({ text: String(item.value || ""), size: 20, font: "宋体" })],
                                    alignment: AlignmentType.CENTER
                                })],
                                verticalAlign: "center"
                            }))
                        }));
                    });
                    
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
                                    top: cmToTwip(0.98),
                                    right: cmToTwip(1.98),
                                    bottom: cmToTwip(1.04),
                                    left: cmToTwip(2.58),
                                    header: cmToTwip(0.9),  // 页眉上边距 0.9cm
                                    footer: cmToTwip(0.6)   // 页脚下边距 0.6cm
                                }
                            }
                        },
                        footers: {
                            default: createPageFooter()
                        },
                        children: [
                            createHeaderTable(),
                            new Paragraph({
                                text: "",
                                spacing: { line: 100, before: 0, after: 0 }
                            }),
                            mainTable
                        ],
                    });
                }
            }
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
