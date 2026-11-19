const fs = require('fs-extra');
const path = require('path');
const xlsx = require('xlsx');
const originalProcessType = process.type;
let overrodeProcessType = false;

// pdfjs 通过 process.type 判断是否运行在 Electron 主进程；utilityProcess 中需要临时模拟主进程环境
if (process.versions.electron && process.type && process.type !== 'browser') {
    try {
        Object.defineProperty(process, 'type', {
            value: 'browser',
            configurable: true,
            enumerable: true
        });
        overrodeProcessType = true;
    } catch (e) {
        console.warn('[pdfjs] 无法临时覆盖 process.type:', e.message);
    }
}

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// 显式提供主线程 worker handler，避免 pdfjs 尝试创建 Web Worker
if (!globalThis.pdfjsWorker) {
    try {
        globalThis.pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.js');
    } catch (e) {
        console.warn('加载 pdfjs worker handler 失败:', e.message);
    }
}

if (overrodeProcessType) {
    try {
        Object.defineProperty(process, 'type', {
            value: originalProcessType,
            configurable: true,
            enumerable: true
        });
    } catch (e) {
        console.warn('[pdfjs] 恢复 process.type 失败:', e.message);
    }
}

// 日期归一化：将各种格式转为纯数字 20250418
function normalizeDate(d) {
    if (!d) return '';
    const text = String(d);
    const parts = text.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (parts) {
        return `${parts[1]}${parts[2].padStart(2, '0')}${parts[3].padStart(2, '0')}`;
    }
    return text.replace(/\D/g, '');
}

// 解析 Excel
function parseExcelData(excelPath) {
    const workbook = xlsx.readFile(excelPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false });
    const idMap = new Map(); const nameMap = new Map();
    rawData.forEach(row => {
        const cleanRow = {};
        for (let key in row) cleanRow[key.trim()] = String(row[key]).trim();
        const t = cleanRow['准考证号'] || cleanRow['准考证'];
        const id = cleanRow['身份证号'] || cleanRow['证件号码'] || cleanRow['身份证'];
        const n = cleanRow['姓名'] || cleanRow['考生姓名'];
        if (t) idMap.set(t, cleanRow);
        if (id) idMap.set(id, cleanRow);
        if (n) { if (!nameMap.has(n)) nameMap.set(n, []); nameMap.get(n).push(cleanRow); }
    });
    return { idMap, nameMap };
}

// 提取信息
function extractInfoFromText(text) {
    const info = {};
    const cleanText = text.replace(/\|/g, ' ');
    const nm = cleanText.match(/姓\s*名[：:]\s*([^\n\r]+)/);
    if (nm) info.name = nm[1].trim().replace(/\s+/g, '');
    const tm = cleanText.match(/准考证号[：:]\s*(\d+)/);
    if (tm) info.ticketNo = tm[1].trim();
    const im = cleanText.match(/身份证号[：:]\s*([X\dx]+)/i);
    if (im) info.idCard = im[1].trim();
    return info;
}

// 将 pdfjs 文本项按 Y 坐标重组为行
function buildPageLines(items) {
    const rows = [];
    items.forEach(it => {
        const y = it.transform[5];
        let row = rows.find(r => Math.abs(r.y - y) < 5);
        if (row) row.items.push(it);
        else rows.push({ y, items: [it] });
    });

    rows.sort((a, b) => b.y - a.y);
    return rows.map(row => {
        row.items.sort((a, b) => a.transform[4] - b.transform[4]);
        let line = '';
        let lastX = -1;
        let lastWidth = 0;
        row.items.forEach(it => {
            if (lastX !== -1 && it.transform[4] > (lastX + lastWidth + 8)) line += ' | ';
            line += it.str;
            lastX = it.transform[4];
            lastWidth = it.str.length * (it.transform[0] * 0.5);
        });
        return line;
    });
}

// 解析考试安排行，如：2025-04-18 | 09:00 - 11:00 | 大学英语 | | 054 | 21
function parseExamRow(line) {
    if (!line) return null;

    const parts = line.split('|').map(part => part.trim());
    let date = null;
    let timeStart = null;
    let timeEnd = null;
    let subject = null;

    if (parts.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) && /^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(parts[1])) {
        date = parts[0];
        const times = parts[1].split('-').map(part => part.trim());
        timeStart = times[0];
        timeEnd = times[1];
        subject = parts[2];
    } else {
        const match = line.match(/(\d{4}-\d{2}-\d{2})\s*\|?\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*\|?\s*([^|]+)/);
        if (!match) return null;
        date = match[1];
        timeStart = match[2];
        timeEnd = match[3];
        subject = match[4].trim();
    }

    if (!subject) return null;
    subject = subject.replace(/\s+/g, '');
    if (!subject || /^\d{2}:\d{2}$/.test(subject)) return null;

    return {
        date,
        timeStart,
        timeEnd,
        time: `${timeStart}-${timeEnd}`,
        subject
    };
}

// 统计每个科目出现次数最多的时间段
function aggregateExamSchedules(records) {
    const bySubject = new Map();

    for (const record of records || []) {
        if (!record || !record.subject || !record.timeStart || !record.timeEnd) continue;
        if (!bySubject.has(record.subject)) {
            bySubject.set(record.subject, new Map());
        }
        const times = bySubject.get(record.subject);
        const time = `${record.timeStart}-${record.timeEnd}`;
        times.set(time, (times.get(time) || 0) + 1);
    }

    const subjects = [];
    for (const [subject, times] of bySubject) {
        let bestTime = null;
        let bestCount = 0;
        for (const [time, count] of times) {
            if (count > bestCount) {
                bestTime = time;
                bestCount = count;
            }
        }
        if (bestTime) {
            const [timeStart, timeEnd] = bestTime.split('-');
            subjects.push({ subject, timeStart, timeEnd, time: bestTime, count: bestCount });
        }
    }

    subjects.sort((a, b) => b.count - a.count);
    return subjects;
}

// 查找 PDF 中未被科目配置覆盖的考试行
function findUnconfiguredExamRows(pageLines, subjectConfigs) {
    const targets = (subjectConfigs || [])
        .map(config => String(config.pdfName || '').replace(/\s+/g, ''))
        .filter(Boolean);
    const unconfigured = [];

    for (const line of pageLines || []) {
        const record = parseExamRow(line);
        if (!record) continue;
        const compactLine = line.replace(/\s+/g, '');
        if (!targets.some(target => compactLine.includes(target))) {
            unconfigured.push(record.subject);
        }
    }

    return unconfigured;
}

// 创建 pdfjs 加载任务（统一 Node 字体/CMap 配置）
function createPdfLoadingTask(dataBuffer, cmapsDir, standardFontsDir) {
    return pdfjsLib.getDocument({
        data: dataBuffer,
        cMapUrl: cmapsDir + path.sep,
        cMapPacked: true,
        CMapReaderFactory: pdfjsLib.NodeCMapReaderFactory,
        standardFontDataUrl: standardFontsDir + path.sep,
        StandardFontDataFactory: pdfjsLib.NodeStandardFontDataFactory,
        disableFontFace: true,
        useSystemFonts: false
    });
}

// 抽样识别 PDF 中的考试科目与多数时间
async function detectExamSchedule(pdfDirPath, options = {}) {
    const cmapsDir = options.cmapsDir || path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'cmaps');
    const standardFontsDir = options.standardFontsDir || path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts');
    const maxFiles = Number.isInteger(options.maxFiles) && options.maxFiles > 0 ? options.maxFiles : 50;
    const maxPagesPerFile = Number.isInteger(options.maxPagesPerFile) && options.maxPagesPerFile > 0 ? options.maxPagesPerFile : 2;

    const entries = await fs.readdir(pdfDirPath, { withFileTypes: true });
    const allPdfFiles = entries
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
        .map(entry => path.join(pdfDirPath, entry.name));

    const step = Math.max(1, Math.floor(allPdfFiles.length / maxFiles));
    const sampleFiles = allPdfFiles.filter((_, index) => index % step === 0).slice(0, maxFiles);
    const records = [];

    for (const filePath of sampleFiles) {
        try {
            const dataBuffer = new Uint8Array(await fs.readFile(filePath));
            const doc = await createPdfLoadingTask(dataBuffer, cmapsDir, standardFontsDir).promise;
            const pagesToScan = Math.min(doc.numPages, maxPagesPerFile);
            for (let pageNum = 1; pageNum <= pagesToScan; pageNum++) {
                const page = await doc.getPage(pageNum);
                const textContent = await page.getTextContent();
                buildPageLines(textContent.items).forEach(line => {
                    const record = parseExamRow(line);
                    if (record) records.push(record);
                });
            }
            await doc.destroy();
        } catch (e) {
            // 抽样识别允许单份 PDF 失败，不阻塞整体统计
        }
    }

    return {
        subjects: aggregateExamSchedules(records),
        scannedFiles: sampleFiles.length,
        totalFiles: allPdfFiles.length
    };
}

// 核心审核逻辑
async function auditTickets(pdfDirPath, excelPath, subjectConfigs, progressCallback, options = {}) {
    const cmapsDir = options.cmapsDir || path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'cmaps');
    const standardFontsDir = options.standardFontsDir || path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts');
    const { idMap, nameMap } = parseExcelData(excelPath);
    const pdfFiles = [];
    const entries = await fs.readdir(pdfDirPath, { withFileTypes: true });
    for (let e of entries) {
        const p = path.join(pdfDirPath, e.name);
        if (e.isFile() && p.toLowerCase().endsWith('.pdf')) pdfFiles.push(p);
    }

    const auditResults = [];
    for (let i = 0; i < pdfFiles.length; i++) {
        const filePath = pdfFiles[i];
        const fileName = path.basename(filePath);
        try {
            const dataBuffer = new Uint8Array(await fs.readFile(filePath));
            const doc = await createPdfLoadingTask(dataBuffer, cmapsDir, standardFontsDir).promise;
            for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
                if (progressCallback) progressCallback(i, pdfFiles.length, pageNum, doc.numPages, fileName);
                const page = await doc.getPage(pageNum);
                const textContent = await page.getTextContent();

                if (textContent.items.length === 0) {
                    console.warn(`[audit] ${fileName} 第${pageNum}页未提取到文本（可能是扫描件）`);
                }

                const pageLines = buildPageLines(textContent.items);

                const pageText = pageLines.join('\n');
                const compactPageText = pageText.replace(/\s+/g, '');
                if (!compactPageText.includes('准考证') && !compactPageText.includes('身份证号')) continue;

                const cleanText = pageText.replace(/\|/g, ' ');
                const extracted = extractInfoFromText(cleanText);
                const detected = { enRoom: '-', enSeat: '-', proRoom: '-', proSeat: '-' };
                const errors = [];

                let excelData = idMap.get(extracted.ticketNo) || idMap.get(extracted.idCard);
                if (!excelData && extracted.name) {
                    const poss = nameMap.get(extracted.name);
                    if (poss) excelData = poss[0];
                }

                if (!excelData) {
                    errors.push('Excel找不到该考生');
                } else {
                    const exDate = excelData['考试日期'] || excelData['日期'];
                    
                    // --- 步骤 1：顶层年份审核 (标题区) ---
                    if (exDate) {
                        const exYear = String(exDate).substring(0, 4);
                        const expectedYearStr = exYear + '年';
                        const titleArea = pageLines.slice(0, 3).join('\n');
                        if (!titleArea.includes(expectedYearStr) && !pageText.includes(expectedYearStr)) {
                            errors.push(`准考证标题年份错误 (预期: "${expectedYearStr}")`);
                        }
                    }

                    // 身份信息严格核对
                    const exT = excelData['准考证号'] || excelData['准考证'];
                    const exI = excelData['身份证号'] || excelData['身份证'];
                    const exN = excelData['姓名'] || excelData['考生姓名'];
                    if (extracted.ticketNo !== exT) errors.push(`准考证号不符 (Excel:"${exT}", PDF:"${extracted.ticketNo}")`);
                    if (extracted.idCard !== exI) errors.push(`身份证号不符 (Excel:"${exI}", PDF:"${extracted.idCard}")`);
                    if (extracted.name !== exN) errors.push(`姓名不符 (Excel:"${exN}", PDF:"${extracted.name}")`);

                    // --- 步骤 2 & 3：科目行级明细审核 (日期 + 时间) ---
                    if (subjectConfigs) {
                        subjectConfigs.forEach(conf => {
                            const target = conf.pdfName.replace(/\s+/g, '');
                            const line = pageLines.find(l => {
                                const nl = l.replace(/\s+/g, '');
                                const idx = nl.indexOf(target);
                                return idx !== -1 && (idx === 0 || !/[\u4e00-\u9fa5]/.test(nl[idx-1]));
                            });

                            if (line) {
                                // 提取识别数字
                                const nums = line.replace(target, '').match(/\d+/g) || [];
                                const vn = nums.filter(n => n.length < 4);
                                const pSeat = vn[vn.length - 1] || '';
                                const pRoom = vn[vn.length - 2] || '';

                                if (target.includes('英语')) { detected.enRoom = pRoom; detected.enSeat = pSeat; }
                                else { detected.proRoom = pRoom; detected.proSeat = pSeat; }

                                const exR = String(excelData[conf.excelPrefix + '考场号'] || '');
                                const exS = String(excelData[conf.excelPrefix + '座位号'] || '');
                                
                                if (exR || exS) {
                                    if (pRoom !== exR) errors.push(`[${conf.pdfName}]考场错误 (Excel:"${exR}", PDF:"${pRoom}")`);
                                    if (pSeat !== exS) errors.push(`[${conf.pdfName}]座位错误 (Excel:"${exS}", PDF:"${pSeat}")`);
                                }

                                // 具体考试日期核对 (如 18号 vs 19号)
                                if (exDate && !normalizeDate(line).includes(normalizeDate(exDate))) {
                                    errors.push(`[${conf.pdfName}] 行日期不符 (预期:"${exDate}")`);
                                }

                                // 具体考试时间核对；未配置时间不能视为通过
                                const timeT = String(conf.time || '').replace(/\s+/g, '');
                                if (!timeT) {
                                    errors.push(`[${conf.pdfName}] 未配置考试时间`);
                                } else if (!line.replace(/\s+/g, '').includes(timeT)) {
                                    errors.push(`[${conf.pdfName}] 时间不符 (配置:"${conf.time}")`);
                                }
                            } else if (excelData[conf.excelPrefix + '考场号']) {
                                errors.push(`未找到 [${conf.pdfName}] 信息行`);
                            }
                        });

                        const unconfiguredSubjects = findUnconfiguredExamRows(pageLines, subjectConfigs);
                        unconfiguredSubjects.forEach(subject => {
                            errors.push(`PDF 存在未校验的考试科目: ${subject}`);
                        });
                    }
                }

                auditResults.push({
                    fileName, filePath, pageNum,
                    ticketNo: extracted.ticketNo || '未知',
                    name: extracted.name || '未知',
                    detected,
                    status: errors.length > 0 ? 'error' : 'success',
                    reason: errors.length > 0 ? errors.join('; ') : '核对无误'
                });
            }
        } catch (err) {
            auditResults.push({ fileName, filePath, pageNum: 1, ticketNo: '失败', name: '失败', detected: { enRoom: '-', enSeat: '-', proRoom: '-', proSeat: '-' }, status: 'error', reason: err.message });
        }
    }
    return auditResults;
}

module.exports = {
    auditTickets,
    normalizeDate,
    extractInfoFromText,
    parseExcelData,
    buildPageLines,
    parseExamRow,
    aggregateExamSchedules,
    findUnconfiguredExamRows,
    detectExamSchedule
};