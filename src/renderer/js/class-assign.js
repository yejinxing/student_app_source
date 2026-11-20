        let classAssignState = null;

        function setClassAssignStatus(elementId, message, type = '') {
            const element = document.getElementById(elementId);
            if (!element) return;
            element.className = type ? `status ${type}` : 'status';
            element.textContent = message || '';
        }

        async function selectClassAssignExcel() {
            try {
                const filePath = await ipcRenderer.invoke('select-class-assign-excel');
                if (!filePath) return;
                document.getElementById('class-assign-excel-path').value = filePath;
                await analyzeClassAssignFile(filePath);
            } catch (error) {
                setClassAssignStatus('class-assign-file-status', `选择文件失败：${error.message}`, 'error');
            }
        }

        async function analyzeClassAssignFile(filePath) {
            classAssignState = null;
            document.getElementById('class-assign-plan-card').style.display = 'none';
            setClassAssignStatus('class-assign-file-status', '正在读取并分析...', '');
            try {
                const result = await ipcRenderer.invoke('analyze-class-assign-excel', { filePath });
                if (!result || !result.ok) {
                    const message = result && result.error ? result.error.message : '分析失败';
                    setClassAssignStatus('class-assign-file-status', message, 'error');
                    return;
                }
                classAssignState = result.data;
                classAssignState.overrides = {};
                renderClassAssignState();
                setClassAssignStatus('class-assign-file-status', '分析完成，请确认分班方案。', 'success');
            } catch (error) {
                setClassAssignStatus('class-assign-file-status', `分析失败：${error.message}`, 'error');
            }
        }

        async function downloadClassAssignTemplate() {
            try {
                const result = await ipcRenderer.invoke('download-class-assign-template');
                if (result && result.success) {
                    showToast(`模板已保存至：${result.path}`, 'success');
                } else if (result && result.code !== 'CANCELED') {
                    showToast(result.message || '模板下载失败', 'error');
                }
            } catch (error) {
                showToast(`模板下载失败：${error.message}`, 'error');
            }
        }

        function renderClassAssignState() {
            const data = classAssignState;
            if (!data) return;
            document.getElementById('class-assign-plan-card').style.display = 'block';
            document.getElementById('class-assign-year').value = String(data.defaultYear);
            document.getElementById('class-assign-result').className = 'status';
            document.getElementById('class-assign-result').textContent = '';
            renderClassAssignSummary();
            renderClassAssignGroups();
            updateClassAssignGenerateButton();
        }

        function renderClassAssignSummary() {
            const data = classAssignState;
            if (!data) return;
            const source = data.summary.sourceCounts || {};
            document.getElementById('class-assign-summary').textContent =
                `学生 ${data.summary.totalStudents} 人 · ${data.summary.deptCount} 个院系 · ` +
                `${data.summary.groupCount} 个专业组 · Excel 班级数 ${source.excel || 0} 组 · ` +
                `部分填写 ${source['excel-partial'] || 0} 组 · 自动建议 ${source.auto || 0} 组 · ` +
                `不一致 ${source['excel-inconsistent'] || 0} 组 · 无效 ${source['excel-invalid'] || 0} 组`;
        }

        function classAssignOption(group, classCount) {
            return group.options.find(option => option.classCount === classCount) || null;
        }

        function classAssignRowClass(level) {
            if (level === 'danger' || level === 'invalid') return 'class-assign-row-danger';
            if (level === 'warn') return 'class-assign-row-warn';
            return '';
        }

        function classAssignStatusClass(level) {
            if (level === 'warn') return 'class-assign-status-warn';
            if (level === 'danger' || level === 'invalid') return 'class-assign-status-danger';
            return 'class-assign-status-ok';
        }

        function classAssignStatusTitle(level, reasons) {
            if (level === 'ok') return '正常';
            if (level === 'warn') return '接近边界';
            if (level === 'danger') return '需要重点确认';
            return `无效：${(reasons || []).join('；')}`;
        }

        function classAssignEffectiveLevel(group, option) {
            if (!option || !option.valid || option.level === 'danger' || option.level === 'invalid') return 'danger';
            if (option.level === 'warn') return 'warn';
            if (group.warnings.some(warning => warning.code === 'CLASS_COUNT_EXCEL_INVALID')) return 'danger';
            if (group.warnings.some(warning =>
                warning.code === 'CLASS_COUNT_EXCEL_INCONSISTENT' ||
                warning.code === 'CLASS_COUNT_EXCEL_PARTIAL'
            )) return 'warn';
            return 'ok';
        }

        function classAssignCountFor(group) {
            const data = classAssignState;
            return Object.prototype.hasOwnProperty.call(data.overrides, group.key)
                ? data.overrides[group.key]
                : group.initialClassCount;
        }

        function renderClassAssignGroups() {
            const data = classAssignState;
            const body = document.getElementById('class-assign-plan-body');
            if (!data || !body) return;
            const onlyWarnings = document.getElementById('class-assign-only-warnings').checked;
            body.textContent = '';

            for (const group of data.groups) {
                const classCount = classAssignCountFor(group);
                const option = classAssignOption(group, classCount);
                const level = classAssignEffectiveLevel(group, option);
                if (onlyWarnings && level === 'ok') continue;

                const tr = document.createElement('tr');
                tr.dataset.groupKey = group.key;
                tr.className = classAssignRowClass(level);

                for (const text of [group.deptName, group.majorName, group.levelName, String(group.studentCount)]) {
                    const td = document.createElement('td');
                    td.textContent = text;
                    tr.appendChild(td);
                }

                const countTd = document.createElement('td');
                const input = document.createElement('input');
                input.type = 'number';
                input.min = '1';
                input.max = '9';
                input.step = '1';
                input.className = 'class-assign-count-input';
                input.dataset.groupKey = group.key;
                input.value = classCount === null ? '' : String(classCount);
                countTd.appendChild(input);
                tr.appendChild(countTd);

                const sizesTd = document.createElement('td');
                sizesTd.className = 'class-assign-sizes';
                const dot = document.createElement('span');
                dot.className = `class-assign-status-dot ${classAssignStatusClass(level)}`;
                dot.title = classAssignStatusTitle(level, option ? option.reasons : []);
                sizesTd.appendChild(dot);
                sizesTd.appendChild(document.createTextNode(option && option.sizes ? option.sizes.join(' / ') : '—'));
                tr.appendChild(sizesTd);

                body.appendChild(tr);
            }

            updateClassAssignBanner();
        }

        function updateClassAssignBanner() {
            const data = classAssignState;
            const banner = document.getElementById('class-assign-warning-banner');
            if (!data || !banner) return;
            let warnings = 0;
            let dangers = 0;
            for (const group of data.groups) {
                const option = classAssignOption(group, classAssignCountFor(group));
                const level = classAssignEffectiveLevel(group, option);
                if (level === 'danger') dangers += 1;
                else if (level === 'warn') warnings += 1;
            }
            if (warnings + dangers > 0) {
                banner.style.display = 'block';
                banner.className = 'status warning';
                banner.textContent = `有 ${warnings} 个专业接近边界，${dangers} 个专业需要重点确认或修正。`;
            } else {
                banner.style.display = 'none';
                banner.textContent = '';
            }
        }

        function updateClassAssignRow(groupKey) {
            const data = classAssignState;
            if (!data) return;
            const input = document.querySelector(`.class-assign-count-input[data-group-key="${CSS.escape(groupKey)}"]`);
            if (!input) return;
            const raw = input.value.trim();
            const value = raw === '' ? null : Number(raw);
            data.overrides[groupKey] = Number.isInteger(value) ? value : null;

            const group = data.groups.find(item => item.key === groupKey);
            const option = group ? classAssignOption(group, data.overrides[groupKey]) : null;
            const level = group ? classAssignEffectiveLevel(group, option) : 'danger';
            const tr = input.closest('tr');
            tr.className = classAssignRowClass(level);

            const sizesTd = tr.querySelector('.class-assign-sizes');
            sizesTd.textContent = '';
            const dot = document.createElement('span');
            dot.className = `class-assign-status-dot ${classAssignStatusClass(level)}`;
            dot.title = classAssignStatusTitle(level, option ? option.reasons : []);
            sizesTd.appendChild(dot);
            sizesTd.appendChild(document.createTextNode(option && option.sizes ? option.sizes.join(' / ') : '—'));

            updateClassAssignGenerateButton();
        }

        function getClassAssignValidation() {
            const data = classAssignState;
            if (!data) return { ok: false, message: '请先选择并分析 Excel 文件' };
            const year = Number(document.getElementById('class-assign-year').value);
            if (!Number.isInteger(year) || year < 1000 || year > 9999) {
                return { ok: false, message: '入学年份必须是 4 位数字' };
            }
            const counts = {};
            for (const group of data.groups) {
                const raw = classAssignCountFor(group);
                if (!Number.isInteger(raw) || raw < 1 || raw > 9) {
                    return { ok: false, message: `${group.majorName} 的班级数必须是 1–9 的整数` };
                }
                const option = classAssignOption(group, raw);
                if (!option || !option.valid) {
                    return {
                        ok: false,
                        message: `${group.majorName}：${option ? option.reasons.join('；') : '班级方案无效'}`
                    };
                }
                counts[group.key] = raw;
            }
            return { ok: true, counts, year };
        }

        function updateClassAssignGenerateButton() {
            const button = document.getElementById('class-assign-generate-btn');
            const error = document.getElementById('class-assign-form-error');
            if (!button) return;
            const validation = getClassAssignValidation();
            button.disabled = !validation.ok;
            error.textContent = validation.ok ? '' : validation.message;
            updateClassAssignBanner();
        }

        function startClassAssign() {
            const validation = getClassAssignValidation();
            if (!validation.ok) {
                updateClassAssignGenerateButton();
                return;
            }

            const dangerGroups = classAssignState.groups.filter(group => {
                const option = classAssignOption(group, validation.counts[group.key]);
                return classAssignEffectiveLevel(group, option) === 'danger';
            });

            if (dangerGroups.length > 0) {
                const list = document.getElementById('class-assign-confirm-list');
                list.textContent = '';
                for (const group of dangerGroups) {
                    const option = classAssignOption(group, validation.counts[group.key]);
                    const reasons = group.warnings
                        .filter(warning => warning.code === 'CLASS_COUNT_EXCEL_INVALID')
                        .map(warning => warning.message);
                    const li = document.createElement('li');
                    li.textContent = `${group.deptName} / ${group.majorName}：` +
                        (option && option.sizes ? `${option.sizes.join(' / ')} 人` : '班级方案无效') +
                        (reasons.length ? `（${reasons.join('；')}）` : '');
                    list.appendChild(li);
                }
                document.getElementById('class-assign-confirm-modal').classList.add('active');
                return;
            }

            generateClassAssign();
        }

        function closeClassAssignConfirm() {
            document.getElementById('class-assign-confirm-modal').classList.remove('active');
        }

        function confirmClassAssign() {
            closeClassAssignConfirm();
            generateClassAssign();
        }

        async function generateClassAssign() {
            const validation = getClassAssignValidation();
            if (!validation.ok) {
                updateClassAssignGenerateButton();
                return;
            }
            const button = document.getElementById('class-assign-generate-btn');
            const resultElement = document.getElementById('class-assign-result');
            button.disabled = true;
            button.textContent = '生成中...';
            resultElement.className = 'status';
            resultElement.textContent = '';

            try {
                const result = await ipcRenderer.invoke('generate-class-assign', {
                    filePath: classAssignState.filePath,
                    fingerprint: classAssignState.fingerprint,
                    classCounts: validation.counts,
                    year: validation.year
                });
                if (!result || !result.ok) {
                    resultElement.className = 'status error';
                    resultElement.textContent = result && result.error ? result.error.message : '生成失败';
                    return;
                }
                resultElement.className = 'status success';
                resultElement.textContent = '生成成功：';
                const link = document.createElement('a');
                link.href = '#';
                link.className = 'file-link';
                link.textContent = result.data.outputPath;
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    openGeneratedFile(result.data.outputPath);
                });
                resultElement.appendChild(link);
            } catch (error) {
                resultElement.className = 'status error';
                resultElement.textContent = `生成失败：${error.message}`;
            } finally {
                button.textContent = '生成分班学号 Excel';
                updateClassAssignGenerateButton();
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            const filter = document.getElementById('class-assign-only-warnings');
            if (filter) filter.addEventListener('change', renderClassAssignGroups);
            const year = document.getElementById('class-assign-year');
            if (year) year.addEventListener('input', updateClassAssignGenerateButton);
            const body = document.getElementById('class-assign-plan-body');
            if (body) {
                body.addEventListener('input', (event) => {
                    const input = event.target.closest('.class-assign-count-input');
                    if (input) updateClassAssignRow(input.dataset.groupKey);
                });
            }
        });
