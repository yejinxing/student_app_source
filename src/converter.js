const xlsx = require('xlsx');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun, BorderStyle, PageBreak, VerticalAlign, HeadingLevel, TableOfContents, Footer, PageNumber, NumberFormat } = require('docx');
const fs = require('fs-extra');

// 将厘米转换为 twip（Word 文档单位，1cm = 567 twip）
const cmToTwip = (cm) => Math.round(cm * 567);

// 从班级名称中提取年份（如"25gb机器人1班"→2025，"24gb机制1班"→2024）
function extractYearFromClassName(className) {
    if (!className) return null;
    
    // 匹配开头的2位数字（如25、24等）
    const match = className.match(/^(\d{2})/);
    if (match) {
        const yearSuffix = parseInt(match[1], 10);
        // 假设20xx年，如25→2025，24→2024
        return 2000 + yearSuffix;
    }
    return null;
}

// 从所有班级名称中获取统一的年份
function getYearFromClasses(classes) {
    for (const classInfo of classes) {
        const year = extractYearFromClassName(classInfo.className);
        if (year) return year;
    }
    // 如果无法从班级名称获取，使用当前年份
    return new Date().getFullYear();
}

// 根据学制判断层次
function getLevel(duration, className) {
    // 优先根据班级名称判断
    if (className) {
        const lowerClassName = className.toLowerCase();
        if (lowerClassName.includes('gbs') || lowerClassName.includes('专升本')) {
            return '专升本';
        }
        if (lowerClassName.includes('gz') || lowerClassName.includes('专科')) {
            return '专科';
        }
        if (lowerClassName.includes('gb') || lowerClassName.includes('本科')) {
            return '本科';
        }
    }
    
    // 根据学制判断
    if (duration) {
        if (duration.includes('四') || duration.includes('4')) {
            return '本科';
        }
        if (duration.includes('三') || duration.includes('3')) {
            return '专科';
        }
        if (duration.includes('二') || duration.includes('2')) {
            return '专升本';
        }
    }
    
    return '本科'; // 默认本科
}

// 系部排序顺序
const DEPT_ORDER = [
    '机械工程系',
    '电气与电子工程系',
    '计算机系',
    '生化工程系',
    '土木工程系',
    '经济系',
    '管理系',
    '外国语系',
    '艺术设计系'
];

// 获取系部排序索引
function getDeptIndex(dept) {
    const index = DEPT_ORDER.indexOf(dept);
    return index === -1 ? DEPT_ORDER.length : index;
}

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
function createDataCell(text, options = {}) {
    return new TableCell({
        children: [createCenteredParagraph(String(text || ''), { size: 20, font: "宋体" })],
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

// 创建第一页总统计表
function createSummaryTable(statistics, year) {
    const rows = [];
    
    // 表头第一行
    rows.push(new TableRow({
        children: [
            createHeaderCell('系  部', { rowSpan: 2 }),
            createHeaderCell('班级数', { rowSpan: 2 }),
            createHeaderCell('总计', { rowSpan: 2 }),
            createHeaderCell('层次', { columnSpan: 3 }),
            createHeaderCell('性别', { columnSpan: 2 }),
            createHeaderCell('政治面貌', { columnSpan: 4 }),
            createHeaderCell('民族', { columnSpan: 2 }),
        ]
    }));
    
    // 表头第二行
    rows.push(new TableRow({
        children: [
            createHeaderCell('本科'),
            createHeaderCell('专科'),
            createHeaderCell('专升本'),
            createHeaderCell('男'),
            createHeaderCell('女'),
            createHeaderCell('群众'),
            createHeaderCell('共青\n团员'),
            createHeaderCell('中共\n预备党员'),
            createHeaderCell('中共\n党员'),
            createHeaderCell('汉族'),
            createHeaderCell('少数\n民族'),
        ]
    }));
    
    // 数据行
    const depts = Object.keys(statistics.byDept).sort((a, b) => getDeptIndex(a) - getDeptIndex(b));
    
    for (const dept of depts) {
        const deptStats = statistics.byDept[dept];
        rows.push(new TableRow({
            height: { value: DATA_ROW_HEIGHT, rule: "exact" },
            children: [
                createDataCell(dept),
                createDataCell(deptStats.classCount),
                createDataCell(deptStats.total),
                createDataCell(deptStats.levels['本科'] || 0),
                createDataCell(deptStats.levels['专科'] || 0),
                createDataCell(deptStats.levels['专升本'] || 0),
                createDataCell(deptStats.gender['男'] || 0),
                createDataCell(deptStats.gender['女'] || 0),
                createDataCell(deptStats.politics['群众'] || 0),
                createDataCell(deptStats.politics['共青团员'] || 0),
                createDataCell(deptStats.politics['中共预备党员'] || 0),
                createDataCell(deptStats.politics['中共党员'] || 0),
                createDataCell(deptStats.ethnicity['汉族'] || 0),
                createDataCell(deptStats.ethnicity['少数民族'] || 0),
            ]
        }));
    }
    
    // 总计行
    rows.push(new TableRow({
        height: { value: DATA_ROW_HEIGHT, rule: "exact" },
        children: [
            createHeaderCell('总计'),
            createDataCell(statistics.totalClassCount),
            createDataCell(statistics.totalStudents),
            createDataCell(statistics.totalLevels['本科'] || 0),
            createDataCell(statistics.totalLevels['专科'] || 0),
            createDataCell(statistics.totalLevels['专升本'] || 0),
            createDataCell(statistics.totalGender['男'] || 0),
            createDataCell(statistics.totalGender['女'] || 0),
            createDataCell(statistics.totalPolitics['群众'] || 0),
            createDataCell(statistics.totalPolitics['共青团员'] || 0),
            createDataCell(statistics.totalPolitics['中共预备党员'] || 0),
            createDataCell(statistics.totalPolitics['中共党员'] || 0),
            createDataCell(statistics.totalEthnicity['汉族'] || 0),
            createDataCell(statistics.totalEthnicity['少数民族'] || 0),
        ]
    }));
    
    return new Table({
        rows: rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: 'autofit', // 列宽自适应
    });
}

// 创建分层统计表（如本科新生情况统计表）
function createLevelSummaryTable(statistics, level, year) {
    const rows = [];
    
    // 表头第一行
    rows.push(new TableRow({
        children: [
            createHeaderCell('系部', { rowSpan: 2 }),
            createHeaderCell('班级数', { rowSpan: 2 }),
            createHeaderCell('性别', { columnSpan: 2 }),
            createHeaderCell('总计', { rowSpan: 2 }),
            createHeaderCell('政治面貌', { columnSpan: 2 }),
            createHeaderCell('民族', { columnSpan: 2 }),
        ]
    }));
    
    // 表头第二行
    rows.push(new TableRow({
        children: [
            createHeaderCell('男'),
            createHeaderCell('女'),
            createHeaderCell('共青\n团员'),
            createHeaderCell('群众'),
            createHeaderCell('汉族'),
            createHeaderCell('少数\n民族'),
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
                createDataCell(dept),
                createDataCell(deptStats.classCount),
                createDataCell(deptStats.gender['男'] || 0),
                createDataCell(deptStats.gender['女'] || 0),
                createDataCell(deptStats.total),
                createDataCell(deptStats.politics['共青团员'] || 0),
                createDataCell(deptStats.politics['群众'] || 0),
                createDataCell(deptStats.ethnicity['汉族'] || 0),
                createDataCell(deptStats.ethnicity['少数民族'] || 0),
            ]
        }));
    }
    
    // 总计行
    const levelTotal = levelData.total || {};
    rows.push(new TableRow({
        height: { value: DATA_ROW_HEIGHT, rule: "exact" },
        children: [
            createHeaderCell('总计'),
            createDataCell(levelTotal.classCount || 0),
            createDataCell(levelTotal.gender?.['男'] || 0),
            createDataCell(levelTotal.gender?.['女'] || 0),
            createDataCell(levelTotal.studentCount || 0),
            createDataCell(levelTotal.politics?.['共青团员'] || 0),
            createDataCell(levelTotal.politics?.['群众'] || 0),
            createDataCell(levelTotal.ethnicity?.['汉族'] || 0),
            createDataCell(levelTotal.ethnicity?.['少数民族'] || 0),
        ]
    }));
    
    return new Table({
        rows: rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: 'autofit', // 列宽自适应
    });
}

// 计算统计数据
function calculateStatistics(data) {
    const statistics = {
        byDept: {},          // 按系部统计
        byLevel: {},         // 按层次统计
        totalClassCount: 0,
        totalStudents: 0,
        totalLevels: {},
        totalGender: {},
        totalPolitics: {},
        totalEthnicity: {},
        classes: []          // 所有班级信息，用于生成目录
    };
    
    // 先按系、专业、班级分组
    const groups = {};
    data.forEach(row => {
        const level = getLevel(row['学制'], row['班级名称']);
        const key = `${row['系（部）']}_${row['专业名称']}_${row['班级名称']}_${row['学制']}`;
        
        if (!groups[key]) {
            groups[key] = {
                dept: row['系（部）'] || '',
                major: row['专业名称'] || '',
                className: row['班级名称'] || '',
                duration: row['学制'] || '',
                level: level,
                students: []
            };
        }
        groups[key].students.push({
            ...row,
            level: level
        });
    });
    
    // 统计每个班级
    const classKeys = Object.keys(groups);
    statistics.totalClassCount = classKeys.length;
    
    for (const key of classKeys) {
        const group = groups[key];
        const dept = group.dept;
        const level = group.level;
        
        // 初始化系部统计
        if (!statistics.byDept[dept]) {
            statistics.byDept[dept] = {
                classCount: 0,
                total: 0,
                levels: {},
                gender: {},
                politics: {},
                ethnicity: {},
                classes: []
            };
        }
        
        // 初始化层次统计
        if (!statistics.byLevel[level]) {
            statistics.byLevel[level] = {
                byDept: {},
                total: {
                    classCount: 0,
                    studentCount: 0,
                    gender: {},
                    politics: {},
                    ethnicity: {}
                },
                classes: []
            };
        }
        
        if (!statistics.byLevel[level].byDept[dept]) {
            statistics.byLevel[level].byDept[dept] = {
                classCount: 0,
                total: 0,
                gender: {},
                politics: {},
                ethnicity: {},
                classes: []
            };
        }
        
        // 更新班级数
        statistics.byDept[dept].classCount++;
        statistics.byLevel[level].byDept[dept].classCount++;
        statistics.byLevel[level].total.classCount++;
        
        // 记录班级信息
        const classInfo = {
            dept: dept,
            className: group.className,
            level: level,
            studentCount: group.students.length,
            students: group.students,
            major: group.major,
            duration: group.duration
        };
        
        statistics.byDept[dept].classes.push(classInfo);
        statistics.byLevel[level].byDept[dept].classes.push(classInfo);
        statistics.byLevel[level].classes.push(classInfo);
        statistics.classes.push(classInfo);
        
        // 统计学生
        for (const student of group.students) {
            statistics.totalStudents++;
            statistics.byDept[dept].total++;
            statistics.byLevel[level].byDept[dept].total++;
            statistics.byLevel[level].total.studentCount++;
            
            // 层次统计
            statistics.totalLevels[level] = (statistics.totalLevels[level] || 0) + 1;
            statistics.byDept[dept].levels[level] = (statistics.byDept[dept].levels[level] || 0) + 1;
            
            // 性别统计
            const gender = student['性别'] || '未知';
            statistics.totalGender[gender] = (statistics.totalGender[gender] || 0) + 1;
            statistics.byDept[dept].gender[gender] = (statistics.byDept[dept].gender[gender] || 0) + 1;
            statistics.byLevel[level].byDept[dept].gender[gender] = (statistics.byLevel[level].byDept[dept].gender[gender] || 0) + 1;
            statistics.byLevel[level].total.gender[gender] = (statistics.byLevel[level].total.gender[gender] || 0) + 1;
            
            // 政治面貌统计
            const politics = student['政治面貌'] || '群众';
            statistics.totalPolitics[politics] = (statistics.totalPolitics[politics] || 0) + 1;
            statistics.byDept[dept].politics[politics] = (statistics.byDept[dept].politics[politics] || 0) + 1;
            statistics.byLevel[level].byDept[dept].politics[politics] = (statistics.byLevel[level].byDept[dept].politics[politics] || 0) + 1;
            statistics.byLevel[level].total.politics[politics] = (statistics.byLevel[level].total.politics[politics] || 0) + 1;
            
            // 民族统计（汉族/少数民族）
            const ethnicityRaw = student['民族'] || '汉族';
            const ethnicity = ethnicityRaw === '汉族' ? '汉族' : '少数民族';
            statistics.totalEthnicity[ethnicity] = (statistics.totalEthnicity[ethnicity] || 0) + 1;
            statistics.byDept[dept].ethnicity[ethnicity] = (statistics.byDept[dept].ethnicity[ethnicity] || 0) + 1;
            statistics.byLevel[level].byDept[dept].ethnicity[ethnicity] = (statistics.byLevel[level].byDept[dept].ethnicity[ethnicity] || 0) + 1;
            statistics.byLevel[level].total.ethnicity[ethnicity] = (statistics.byLevel[level].total.ethnicity[ethnicity] || 0) + 1;
        }
    }
    
    return { statistics, groups };
}

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
    
    // 计算文本的字符宽度（估算）
    const calculateTextWidth = (text) => {
        let width = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (/[\u4e00-\u9fff]/.test(char)) {
                width += 2;
            } else if (/[^\x00-\x7f]/.test(char)) {
                width += 2;
            } else {
                width += 1;
            }
        }
        return width;
    };
    
    // 计算表格列宽的动态分配算法
    const calculateColumnWidths = (label1, value1, label2, value2) => {
        const PAGE_WIDTH = 21.0;
        const LEFT_MARGIN = 2.58;
        const RIGHT_MARGIN = 1.98;
        const AVAILABLE_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
        
        const minCol1Width = 25;
        const maxCol1Width = 40;
        
        const majorLength = value2.length;
        
        let col1Percent;
        if (majorLength <= 8) {
            col1Percent = 35;
        } else if (majorLength <= 12) {
            col1Percent = 30;
        } else if (majorLength <= 16) {
            col1Percent = 28;
        } else {
            col1Percent = 25;
        }
        
        col1Percent = Math.max(minCol1Width, Math.min(maxCol1Width, col1Percent));
        const col2Percent = 100 - col1Percent;
        
        return {
            col1Percent: col1Percent,
            col2Percent: col2Percent
        };
    };
    
    // ============= 第一页：总统计表 =============
    sections.push({
        properties: {
            page: {
                margin: {
                    top: cmToTwip(2.54),
                    right: cmToTwip(2.54),
                    bottom: cmToTwip(2.54),
                    left: cmToTwip(2.54)
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
                    top: cmToTwip(2.54),
                    right: cmToTwip(2.54),
                    bottom: cmToTwip(2.54),
                    left: cmToTwip(2.54)
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
                    top: cmToTwip(2.54),
                    right: cmToTwip(2.54),
                    bottom: cmToTwip(2.54),
                    left: cmToTwip(2.54)
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
                    spacing: { after: 400 }
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
                                    left: cmToTwip(2.58)
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
