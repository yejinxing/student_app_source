        async function selectFile() {
            const filePath = await ipcRenderer.invoke('select-file');
            if (!filePath) return;
            selectedPath = filePath;
            document.getElementById('file-path').innerText = `已选择: ${filePath}`;
            document.getElementById('convert-btn').disabled = false;
        }

        function startConversion() {
            const btn = document.getElementById('convert-btn');
            const status = document.getElementById('status');
            btn.disabled = true;
            btn.innerText = '转换中...';
            status.className = 'status';
            status.innerText = '';
            
            ipcRenderer.send('start-conversion', { excelPath: selectedPath });
        }

        onIpc('conversion-success', (event, outputPath) => {
            const status = document.getElementById('status');
            status.className = 'status success';
            status.textContent = '转换成功！文件已保存至: ';
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'file-link';
            link.textContent = outputPath;
            link.addEventListener('click', (clickEvent) => {
                clickEvent.preventDefault();
                openGeneratedFile(outputPath);
            });
            status.appendChild(link);
            document.getElementById('convert-btn').disabled = false;
            document.getElementById('convert-btn').innerText = '开始转换';
        });

        onIpc('conversion-error', (event, message) => {
            const status = document.getElementById('status');
            status.className = 'status error';
            status.innerText = `转换失败: ${message}`;
            document.getElementById('convert-btn').disabled = false;
            document.getElementById('convert-btn').innerText = '开始转换';
        });

        function downloadTemplate() {
            ipcRenderer.send('download-template');
        }
        
        function downloadAuditTemplate() {
            ipcRenderer.send('download-audit-template');
        }

        onIpc('template-downloaded', (event, result) => {
            const status = document.getElementById('status');
            if (result.success) {
                status.className = 'status success';
                status.textContent = '模板已保存至: ';
                const link = document.createElement('a');
                link.href = '#';
                link.className = 'file-link';
                link.textContent = result.path;
                link.addEventListener('click', (clickEvent) => {
                    clickEvent.preventDefault();
                    openGeneratedFile(result.path);
                });
                status.appendChild(link);
            } else {
                status.className = 'status error';
                status.innerText = result.message === '已取消' ? '已取消保存' : `保存失败: ${result.message}`;
            }
        });

        onIpc('audit-template-downloaded', (event, result) => {
            if (result.success) {
                showToast('模板已保存至: ' + result.path, 'success');
            } else if (result.message !== '已取消') {
                showToast(`保存失败: ${result.message}`, 'error');
            }
        });

