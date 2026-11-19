        // 准考证审核相关逻辑
        let auditPdfDir = '';
        let auditExcelFile = '';

        function selectAuditPdfDir() {
            ipcRenderer.invoke('select-pdf-dir').then(path => {
                if (path) {
                    auditPdfDir = path;
                    document.getElementById('audit-pdf-dir').value = path;
                    autoFillExamSchedule();
                }
            }).catch((error) => {
                showToast(`选择 PDF 文件夹失败: ${error.message}`, 'error');
            });
        }

        async function selectAuditExcel() {
            const filePath = await ipcRenderer.invoke('select-file');
            if (!filePath) return;

            auditExcelFile = filePath;
            document.getElementById('audit-excel-file').value = filePath;

            const columns = await ipcRenderer.invoke('get-excel-columns', filePath);
            renderSubjectConfig(columns);
            autoFillExamSchedule();
        }

        function generateTimeOptions() {
            let options = '<option value="">请选择</option>';
            for (let h = 7; h <= 18; h++) {
                for (let m of ['00', '15', '30', '45']) {
                    let time = `${h.toString().padStart(2, '0')}:${m}`;
                    options += `<option value="${time}">${time}</option>`;
                }
            }
            return options;
        }

        function getDefaultPdfName(subjectPrefix) {
            let defaultPdfName = subjectPrefix.replace('科目', '').replace('1', '一').replace('2', '二').replace('3', '三');
            if (subjectPrefix === '英语科目' || subjectPrefix === '英语') {
                defaultPdfName = '大学英语';
            }
            return defaultPdfName;
        }

        function normalizeSubjectName(name) {
            return String(name || '').replace(/\s+/g, '').replace(/科目/g, '');
        }

        function findDetectedSubject(defaultPdfName, currentPdfName, subjects) {
            const candidates = [defaultPdfName, currentPdfName]
                .map(normalizeSubjectName)
                .filter(Boolean);

            for (const subject of subjects) {
                if (candidates.includes(normalizeSubjectName(subject.subject))) {
                    return subject;
                }
            }

            for (const subject of subjects) {
                const detectedName = normalizeSubjectName(subject.subject);
                if (detectedName.includes('英语') && candidates.some(candidate => candidate.includes('英语'))) {
                    return subject;
                }
                if (detectedName.includes('专业课') && candidates.some(candidate => candidate.includes('专业课'))) {
                    const detectedNumber = detectedName.match(/[一二三四五六七八九十\d]+$/);
                    const candidateNumber = candidates
                        .map(candidate => candidate.match(/[一二三四五六七八九十\d]+$/))
                        .find(Boolean);
                    if (!detectedNumber || !candidateNumber || detectedNumber[0] === candidateNumber[0]) {
                        return subject;
                    }
                }
            }

            return null;
        }

        function setTimeSelectValue(select, value) {
            if (!value) return;
            if (!Array.from(select.options).some(option => option.value === value)) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                select.appendChild(option);
            }
            select.value = value;
        }

        let examScheduleFillToken = 0;

        function applyDetectedSchedule(result) {
            const subjects = result && Array.isArray(result.subjects) ? result.subjects : [];
            if (subjects.length === 0) return false;

            const items = document.querySelectorAll('.subject-config-item');
            let filled = 0;
            items.forEach(item => {
                const prefixInput = item.querySelector('.conf-excel-prefix');
                const pdfNameInput = item.querySelector('.conf-pdf-name');
                const timeStartSelect = item.querySelector('.conf-time-start');
                const timeEndSelect = item.querySelector('.conf-time-end');
                if (!prefixInput || !pdfNameInput || !timeStartSelect || !timeEndSelect) return;

                const defaultPdfName = getDefaultPdfName(prefixInput.value);
                const detected = findDetectedSubject(defaultPdfName, pdfNameInput.value, subjects);
                if (!detected) return;

                if (pdfNameInput.value === defaultPdfName) {
                    pdfNameInput.value = detected.subject;
                }
                if (!timeStartSelect.value && !timeEndSelect.value) {
                    setTimeSelectValue(timeStartSelect, detected.timeStart);
                    setTimeSelectValue(timeEndSelect, detected.timeEnd);
                    filled++;
                }
            });

            if (filled > 0) {
                showToast('已根据 PDF 自动填写考试科目与时间，请核对后开始审核', 'success');
            }
            return filled > 0;
        }

        async function autoFillExamSchedule() {
            if (!auditPdfDir || !auditExcelFile) return;
            if (document.querySelectorAll('.subject-config-item').length === 0) return;

            const token = ++examScheduleFillToken;
            try {
                const result = await ipcRenderer.invoke('detect-exam-schedule', { pdfDir: auditPdfDir });
                if (token !== examScheduleFillToken) return;
                applyDetectedSchedule(result);
            } catch (error) {
                console.warn('自动识别考试安排失败:', error);
            }
        }

        // 根据 Excel 列名动态生成科目配置界面
        function renderSubjectConfig(columns) {
            const subjectCard = document.getElementById('subject-config-card');
            const subjectList = document.getElementById('subject-config-list');
            subjectList.innerHTML = '';
            
            // 查找所有以 "考场号" 结尾的列名，提取科目名称前缀
            const subjects = [];
            columns.forEach(col => {
                if (col && typeof col === 'string' && col.endsWith('考场号')) {
                    const prefix = col.replace('考场号', '');
                    if (prefix && prefix !== '考点') { // 排除“考点考场号”这种非科目的情况
                        subjects.push(prefix);
                    }
                }
            });
            
            if (subjects.length > 0) {
                subjectCard.style.display = 'block';
                const timeOptions = generateTimeOptions();
                
                subjects.forEach((subjectPrefix, index) => {
                    const defaultPdfName = getDefaultPdfName(subjectPrefix);
                    
                    const row = document.createElement('div');
                    row.className = 'subject-config-item';
                    
                    // 现代化卡片式同行布局
                    row.style.cssText = 'display: grid; grid-template-columns: 1.2fr 2fr 2fr; gap: 16px; align-items: center; background: var(--bg-secondary); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border); transition: all 0.2s;';
                    row.onmouseover = () => row.style.borderColor = 'var(--primary-light)';
                    row.onmouseout = () => row.style.borderColor = 'var(--border)';
                    
                    row.innerHTML = `
                        <div style="font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px;">
                            <span style="color: var(--primary); font-size: 16px;">📘</span>
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(subjectPrefix)}">${escapeHtml(subjectPrefix)}</span>
                            <input type="hidden" class="conf-excel-prefix" value="${escapeHtml(subjectPrefix)}">
                        </div>
                        <div>
                            <label style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px; display: block;">印在 PDF 上的科目名称</label>
                            <input type="text" class="file-input conf-pdf-name" style="margin: 0; width: 100%;" value="${escapeHtml(defaultPdfName)}">
                        </div>
                        <div>
                            <label style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px; display: block;">选择考试时间段</label>
                            <div class="input-group" style="gap: 8px;">
                                <select class="conf-time-start" style="flex: 1; min-width: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 14px; color: var(--text); background: var(--bg-primary); transition: border-color 0.3s; cursor: pointer;">
                                    ${timeOptions}
                                </select>
                                <span style="color: var(--text-muted); font-weight: bold; line-height: 38px;">-</span>
                                <select class="conf-time-end" style="flex: 1; min-width: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 14px; color: var(--text); background: var(--bg-primary); transition: border-color 0.3s; cursor: pointer;">
                                    ${timeOptions}
                                </select>
                            </div>
                        </div>
                    `;
                    subjectList.appendChild(row);
                });
            } else {
                subjectCard.style.display = 'none';
            }
        }

        function startTicketAudit() {
            if (!auditPdfDir) {
                showToast('请选择包含 PDF 准考证的文件夹', 'error');
                return;
            }
            if (!auditExcelFile) {
                showToast('请选择考生信息 Excel 表格', 'error');
                return;
            }
            
            // 收集科目配置
            const subjectConfigs = [];
            const configItems = document.querySelectorAll('.subject-config-item');
            configItems.forEach(item => {
                const excelPrefix = item.querySelector('.conf-excel-prefix').value;
                const pdfName = item.querySelector('.conf-pdf-name').value.trim();
                const timeStart = item.querySelector('.conf-time-start').value;
                const timeEnd = item.querySelector('.conf-time-end').value;
                
                // 如果只填了一半时间，或者没填，可以处理为一个完整的字符串或者留空
                const time = (timeStart && timeEnd) ? `${timeStart}-${timeEnd}` : '';
                
                if (pdfName) {
                    subjectConfigs.push({ excelPrefix, pdfName, time });
                }
            });
            
            const btn = document.getElementById('start-audit-btn');
            btn.disabled = true;
            btn.innerText = '正在审核...';
            
            document.getElementById('audit-result-card').style.display = 'block';
            document.getElementById('audit-result-body').innerHTML = '';
            document.getElementById('audit-summary').innerText = '正在初始化...';
            document.getElementById('audit-progress-fill').style.width = '0%';
            document.getElementById('audit-progress-text').innerText = '0%';
            
            ipcRenderer.send('start-ticket-audit', {
                pdfDir: auditPdfDir,
                excelPath: auditExcelFile,
                subjectConfigs: subjectConfigs
            });
        }

        function openAuditPdf(filePath) {
            ipcRenderer.send('open-pdf-file', filePath);
        }

        onIpc('audit-progress', (event, data) => {
            // 计算更精细的进度（基于文件进度 + 当前文件的页数进度）
            const fileBase = data.pFiles / data.tFiles;
            const pageFraction = data.tPages > 0 ? (data.pPages / data.tPages) * (1 / data.tFiles) : 0;
            const percent = Math.min(100, Math.floor((fileBase + pageFraction) * 100));
            
            document.getElementById('audit-progress-fill').style.width = percent + '%';
            document.getElementById('audit-progress-text').innerText = `${percent}% - 正在处理: ${data.currentFile} (第 ${data.pPages}/${data.tPages} 页)`;
        });

        onIpc('audit-success', (event, results) => {
            const btn = document.getElementById('start-audit-btn');
            btn.disabled = false;
            btn.innerText = '开始智能审核';
            
            // 修正完成时的进度条文本显示
            document.getElementById('audit-progress-fill').style.width = '100%';
            document.getElementById('audit-progress-text').innerText = '100% - 处理完毕';
            
            const tbody = document.getElementById('audit-result-body');
            tbody.innerHTML = '';
            
            let errorCount = 0;
            
            results.forEach(result => {
                if (result.status === 'error') {
                    errorCount++;
                }

                const tr = document.createElement('tr');
                tr.className = `audit-row audit-${result.status}`;
                tr.style.borderBottom = '1px solid var(--border)';
                tr.style.verticalAlign = 'top';

                const statusCell = document.createElement('td');
                statusCell.style.cssText = 'padding: 10px; text-align: center;';
                const statusSpan = document.createElement('span');
                statusSpan.style.cssText = `color: ${result.status === 'success' ? '#10b981' : '#ef4444'}; font-weight: bold; white-space: nowrap;`;
                statusSpan.textContent = result.status === 'success' ? '✅ 通过' : '❌ 异常';
                statusCell.appendChild(statusSpan);

                const ticketCell = document.createElement('td');
                ticketCell.style.cssText = 'padding: 10px; font-size: 13px; text-align: center;';
                ticketCell.textContent = result.ticketNo || '未知';

                const nameCell = document.createElement('td');
                nameCell.style.cssText = 'padding: 10px; font-size: 14px; text-align: center; word-break: break-all; white-space: normal;';
                nameCell.textContent = result.name || '未知';

                const fileCell = document.createElement('td');
                fileCell.style.cssText = 'padding: 10px; font-size: 13px; text-align: left; word-break: break-all;';
                const fileLink = document.createElement('a');
                fileLink.href = '#';
                fileLink.style.cssText = 'color: var(--primary); text-decoration: underline; cursor: pointer; display: inline-block; word-break: break-all;';
                fileLink.textContent = result.fileName || '';
                const pageSpan = document.createElement('span');
                pageSpan.style.cssText = 'font-size:12px; color: var(--text-muted);';
                pageSpan.textContent = ` (第${result.pageNum}页)`;
                fileLink.appendChild(document.createElement('br'));
                fileLink.appendChild(pageSpan);
                fileLink.addEventListener('click', (clickEvent) => {
                    clickEvent.preventDefault();
                    openAuditPdf(result.filePath);
                });
                fileCell.appendChild(fileLink);

                const reasonCell = document.createElement('td');
                reasonCell.style.cssText = `padding: 10px; font-size: 13px; color: ${result.status === 'error' ? '#ef4444' : 'var(--text)'}; line-height: 1.6; word-wrap: break-word; text-align: left;`;
                reasonCell.textContent = result.reason || '';

                tr.append(statusCell, ticketCell, nameCell, fileCell, reasonCell);
                tbody.appendChild(tr);
            });
            
            document.getElementById('audit-summary').innerHTML = `审核完成。共检测准考证记录: ${results.length} 条，其中 <span style="color: #10b981;">正常: ${results.length - errorCount}</span>，<span style="color: #ef4444;">异常: ${errorCount}</span>。`;
            document.getElementById('audit-filter-container').style.display = 'flex';
            showToast('审核完成', 'success');
        });

        function filterAuditResults() {
            const status = document.getElementById('audit-status-filter').value;
            const searchKeyword = document.getElementById('audit-search-input').value.toLowerCase().trim();
            
            const rows = document.querySelectorAll('.audit-row');
            rows.forEach(row => {
                let showByStatus = status === 'all' || row.classList.contains(`audit-${status}`);
                let showBySearch = true;
                
                if (searchKeyword) {
                    // 只需在准考证号、姓名和报错原因里搜索
                    const textContent = row.innerText.toLowerCase();
                    showBySearch = textContent.includes(searchKeyword);
                }
                
                row.style.display = (showByStatus && showBySearch) ? '' : 'none';
            });
        }

        document.getElementById('audit-search-input').addEventListener('input', filterAuditResults);
        document.getElementById('audit-status-filter').addEventListener('change', filterAuditResults);

        onIpc('audit-error', (event, message) => {
            const btn = document.getElementById('start-audit-btn');
            btn.disabled = false;
            btn.innerText = '开始审核';
            showToast('审核出错: ' + message, 'error');
        });

