        // 照片重命名功能变量
        let photoFolderPath = '';
        let photoExcelPath = '';
        let photoOutputPath = '';
        let isProcessing = false;
        
        // 照片重命名功能事件处理
        function selectPhotoFolder() {
            ipcRenderer.send('select-photo-folder');
        }
        
        function selectPhotoExcelFile() {
            ipcRenderer.send('select-photo-excel-file');
        }
        
        function selectPhotoOutputFolder() {
            ipcRenderer.send('select-photo-output-folder');
        }
        
        function updatePhotoRenameBtnState() {
            const btn = document.getElementById('photo-rename-btn');
            const hasExcel = !!photoExcelPath;
            const hasFolder = !!photoFolderPath;
            const hasOutput = !!photoOutputPath;
            const hasFields = document.getElementById('input-field-combo').options.length > 0 && 
                            document.getElementById('output-field-combo').options.length > 0;
            
            btn.disabled = !(hasExcel && hasFolder && hasOutput && hasFields);
        }
        
        function startPhotoRenaming() {
            if (isProcessing) return;
            
            isProcessing = true;
            const btn = document.getElementById('photo-rename-btn');
            const stopBtn = document.getElementById('stop-rename-btn');
            btn.disabled = true;
            stopBtn.disabled = false;
            
            // 清空日志
            document.getElementById('photo-rename-log').innerHTML = '';
            addLog('开始处理...');
            
            // 设置进度条
            document.getElementById('photo-rename-progress').style.width = '0%';
            document.getElementById('progress-text').innerText = '处理中...';
            
            // 获取输出格式
            let outputExt = document.getElementById('output-format-combo').value;
            
            ipcRenderer.send('start-renaming', {
                photoDir: photoFolderPath,
                excelPath: photoExcelPath,
                outputDir: photoOutputPath,
                outputExt: outputExt,
                inputField: document.getElementById('input-field-combo').value,
                outputField: document.getElementById('output-field-combo').value
            });
        }
        
        function stopPhotoRenaming() {
            ipcRenderer.send('stop-renaming');
            isProcessing = false;
            document.getElementById('photo-rename-btn').disabled = false;
            document.getElementById('stop-rename-btn').disabled = true;
            document.getElementById('progress-text').innerText = '已停止';
        }
        
        function addLog(message) {
            const logDiv = document.getElementById('photo-rename-log');
            const timeStamp = new Date().toLocaleTimeString();
            const logEntry = document.createElement('div');
            logEntry.textContent = `[${timeStamp}] ${message}`;
            logDiv.appendChild(logEntry);
            logDiv.scrollTop = logDiv.scrollHeight;
        }
        
        // 照片重命名功能的 IPC 事件监听
        onIpc('selected-photo-folder', (event, path) => {
            photoFolderPath = path;
            document.getElementById('photo-folder-path').value = path;
            updatePhotoRenameBtnState();
        });
        
        onIpc('selected-photo-excel-file', (event, path) => {
            photoExcelPath = path;
            document.getElementById('photo-excel-path').value = path;
            
            // 获取Excel列名并填充下拉框
            ipcRenderer.invoke('get-excel-columns', path)
                .then(renderPhotoColumns)
                .catch((error) => addLog(`读取Excel列名失败: ${error.message}`));
            updatePhotoRenameBtnState();
        });

        function renderPhotoColumns(columns) {
            const inputCombo = document.getElementById('input-field-combo');
            const outputCombo = document.getElementById('output-field-combo');
            
            inputCombo.innerHTML = '';
            outputCombo.innerHTML = '';
            
            columns.forEach(column => {
                const option = document.createElement('option');
                option.value = column;
                option.textContent = column;
                inputCombo.appendChild(option);
                outputCombo.appendChild(option.cloneNode(true));
            });
            
            // 默认选择ksh和sfz（与原Python脚本保持一致）
            if (columns.includes('ksh')) {
                inputCombo.value = 'ksh';
            }
            if (columns.includes('sfz')) {
                outputCombo.value = 'sfz';
            }
            
            updatePhotoRenameBtnState();
        }

        onIpc('selected-photo-output-folder', (event, path) => {
            photoOutputPath = path;
            document.getElementById('photo-output-path').value = path;
            updatePhotoRenameBtnState();
        });
        
        onIpc('renaming-status', (event, message) => {
            addLog(message);
        });
        
        onIpc('renaming-progress', (event, progress) => {
            document.getElementById('photo-rename-progress').style.width = `${progress}%`;
            document.getElementById('progress-text').innerText = `进度: ${progress}%`;
        });
        
        onIpc('renaming-finished', (event, success) => {
            isProcessing = false;
            document.getElementById('photo-rename-btn').disabled = false;
            document.getElementById('stop-rename-btn').disabled = true;
            document.getElementById('progress-text').innerText = success ? '已完成!' : '已失败!';
            
            addLog(success ? '操作已完成!' : '操作失败!');
        });
        
        
