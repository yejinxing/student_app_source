const fs = require('fs-extra');
const path = require('path');
const xlsx = require('xlsx');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// 日期归一化：将各种格式转为纯数字 20250418
function normalizeDate(d) {
    if (!d) return '';
    return String(d).replace(/\D/g, '');
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

// 核心审核逻辑
async function auditTickets(pdfDirPath, excelPath, subjectConfigs, progressCallback) {
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
            const loadingTask = pdfjsLib.getDocument({
                data: dataBuffer,
                cMapUrl: path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'cmaps') + path.sep,
                cMapPacked: true,
                standardFontDataUrl: path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts') + path.sep
            });
            const doc = await loadingTask.promise;
            for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
                if (pageNum % 3 === 0) await new Promise(r => setTimeout(r, 5));
                if (progressCallback) progressCallback(i, pdfFiles.length, pageNum, doc.numPages, fileName);
                const page = await doc.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                const rows = [];
                textContent.items.forEach(it => {
                    const y = it.transform[5];
                    let r = rows.find(row => Math.abs(row.y - y) < 5);
                    if (r) r.items.push(it); else rows.push({ y, items: [it] });
                });
                rows.sort((a, b) => b.y - a.y);
                const pageLines = rows.map(r => {
                    r.items.sort((a, b) => a.transform[4] - b.transform[4]);
                    let line = '', lx = -1, lw = 0;
                    r.items.forEach(it => {
                        if (lx !== -1 && it.transform[4] > (lx + lw + 8)) line += ' | ';
                        line += it.str; lx = it.transform[4]; lw = it.str.length * (it.transform[0] * 0.5);
                    });
                    return line;
                });

                const pageText = pageLines.join('\n');
                if (!pageText.includes('准考证') && !pageText.includes('身份证号')) continue;

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
                                    
                                    // 【核心修复】具体考试日期核对 (如 18号 vs 19号)
                                    if (exDate && !normalizeDate(line).includes(normalizeDate(exDate))) {
                                        errors.push(`[${conf.pdfName}] 行日期不符 (预期:"${exDate}")`);
                                    }
                                    // 具体考试时间核对
                                    const timeT = conf.time.replace(/\s+/g, '');
                                    if (timeT && !line.replace(/\s+/g, '').includes(timeT)) {
                                        errors.push(`[${conf.pdfName}] 时间不符 (配置:"${conf.time}")`);
                                    }
                                }
                            } else if (excelData[conf.excelPrefix + '考场号']) {
                                errors.push(`未找到 [${conf.pdfName}] 信息行`);
                            }
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

module.exports = { auditTickets };