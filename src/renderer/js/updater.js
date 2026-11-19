        // ===== 更新功能 =====
        let updateInfo = null;

        function checkUpdate() {
            // 显示更新弹窗
            openUpdateModal();
            showUpdateState('checking');
            ipcRenderer.send('check-for-updates');
        }
        
        function openUpdateModal() {
            document.getElementById('update-modal').classList.add('active');
        }
        
        function closeUpdateModal(event) {
            if (!event || event.target === event.currentTarget) {
                document.getElementById('update-modal').classList.remove('active');
            }
        }
        
        function showUpdateState(state) {
            const states = ['checking', 'latest', 'available', 'downloading', 'downloaded', 'installing', 'install-complete', 'error'];
            states.forEach(s => {
                const el = document.getElementById('update-' + s);
                if (el) el.style.display = s === state ? 'block' : 'none';
            });
        }
        
        function startDownload() {
            if (updateInfo) {
                // 开始下载更新（electron-updater 自动处理下载）
                showUpdateState('downloading');
                ipcRenderer.send('download-update');
            } else {
                // 没有更新信息，打开发布页面
                openReleasePage();
            }
        }
        
        function openReleasePage() {
            // 打开 GitHub Release 页
            ipcRenderer.send('open-external-url', 'https://github.com/yejinxing/student_app_source/releases');
        }
        
        function installUpdate() {
            ipcRenderer.send('install-update');
        }
        
        function cancelDownload() {
            ipcRenderer.send('cancel-download');
            showUpdateState('available');
        }
        
        // 更新状态监听
        ipcRenderer.on('update-checking', () => {
            showUpdateState('checking');
        });
        
        ipcRenderer.on('update-available', (event, info) => {
            updateInfo = info;
            document.getElementById('update-old-ver').textContent = 'v' + info.currentVersion;
            document.getElementById('update-new-ver').textContent = 'v' + info.version;
            document.getElementById('update-current-version').textContent = 'v' + info.currentVersion;
            document.getElementById('update-date').textContent = info.releaseDate || '未知';
            document.getElementById('update-size').textContent = info.size || '未知';
            document.getElementById('update-platform').textContent = info.platform || '当前平台';
            
            // 使用 marked 渲染 Markdown 更新说明
            const releaseNotes = info.releaseNotes || '暂无更新说明';
            const updateNotesElement = document.getElementById('update-notes');
            try {
                updateNotesElement.innerHTML = DOMPurify.sanitize(marked.parse(releaseNotes));
                
                // 为所有链接添加点击事件，使其在外部浏览器中打开
                const links = updateNotesElement.querySelectorAll('a');
                links.forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        const url = link.href;
                        if (url) {
                            // 通过 IPC 在主进程中打开外部链接
                            ipcRenderer.send('open-external-url', url);
                        }
                    });
                    // 添加鼠标悬停样式提示
                    link.style.cursor = 'pointer';
                    link.title = '点击在浏览器中打开';
                });
            } catch (e) {
                // 如果 marked 渲染失败，回退到纯文本
                updateNotesElement.textContent = releaseNotes;
            }
            
            console.log('更新信息:', info);
            console.log('将下载文件:', info.fileName);
            showUpdateState('available');
        });
        
        ipcRenderer.on('update-not-available', (event, info) => {
            document.getElementById('update-current-version').textContent = 'v' + info.currentVersion;
            showUpdateState('latest');
        });
        
        ipcRenderer.on('update-downloading', (event, data) => {
            showUpdateState('downloading');
            
            // 显示镜像信息（如果提供）
            const mirrorEl = document.getElementById('update-mirror-info');
            if (mirrorEl) {
                if (data && data.mirrorName) {
                    mirrorEl.style.display = 'block';
                    mirrorEl.innerHTML = `<span style="background: var(--primary-light); padding: 2px 8px; border-radius: 4px;">🚀 镜像加速: ${escapeHtml(data.mirrorName)}</span>`;
                } else {
                    mirrorEl.style.display = 'none';
                }
            }
        });
        
        ipcRenderer.on('update-progress', (event, progress) => {
            const percent = Number(progress && progress.percent);
            const safePercent = Number.isFinite(percent) ? percent : 0;
            document.getElementById('update-progress-fill').style.width = safePercent + '%';
            document.getElementById('update-progress-percent').textContent = safePercent.toFixed(1) + '%';
            
            // 显示实时速度（优先使用格式化后的速度，否则自行格式化）
            let speedDisplay = progress.speed || '-- KB/s';
            if (speedDisplay === '计算中...' && progress.bytesPerSecond > 0) {
                if (progress.bytesPerSecond >= 1024 * 1024) {
                    speedDisplay = `${(progress.bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
                } else {
                    speedDisplay = `${(progress.bytesPerSecond / 1024).toFixed(1)} KB/s`;
                }
            }
            document.getElementById('update-progress-speed').textContent = speedDisplay;
            
            // 显示更多下载信息
            const detailEl = document.getElementById('update-progress-detail');
            if (detailEl) {
                const transferred = Number(progress.transferred);
                const downloaded = progress.downloaded || (Number.isFinite(transferred)
                    ? `${(transferred / (1024 * 1024)).toFixed(2)} MB`
                    : '--');
                const total = progress.totalSize || progress.total || '未知';
                const remaining = progress.remaining || '';
                if (remaining && remaining !== '计算中...') {
                    detailEl.textContent = `${downloaded} / ${total} · 剩余 ${remaining}`;
                } else {
                    detailEl.textContent = `${downloaded} / ${total}`;
                }
            }
            
            // 显示镜像加速信息
            const mirrorEl = document.getElementById('update-mirror-info');
            if (mirrorEl) {
                if (progress.mirrorName) {
                    mirrorEl.style.display = 'block';
                    mirrorEl.innerHTML = `<span style="background: var(--primary-light); padding: 2px 8px; border-radius: 4px;">🚀 镜像加速: ${escapeHtml(progress.mirrorName)}</span>`;
                } else {
                    // 如果没有镜像信息，检查是否是直连（非 GitHub URL）
                    const detailEl = document.getElementById('update-progress-detail');
                    if (detailEl && detailEl.textContent.includes('github.com')) {
                        mirrorEl.style.display = 'none';
                    }
                }
            }
        });
        
        // 处理镜像切换重试事件
        ipcRenderer.on('update-retrying', (event, data) => {
            const mirrorEl = document.getElementById('update-mirror-info');
            if (mirrorEl && data && data.mirror) {
                mirrorEl.style.display = 'block';
                mirrorEl.innerHTML = `<span style="background: var(--warning-light, #fff3cd); padding: 2px 8px; border-radius: 4px; color: var(--warning, #856404);">🔄 ${escapeHtml(data.message || `正在切换到镜像: ${data.mirror}`)}</span>`;
            }
        });
        
        ipcRenderer.on('update-downloaded', (event, info) => {
            showUpdateState('downloaded');
            console.log('下载完成:', info);
        });
        
        ipcRenderer.on('update-installing', (event, progress) => {
            showUpdateState('installing');
            if (progress) {
                const percent = Number(progress.percent);
                const safePercent = Number.isFinite(percent) ? percent : 0;
                document.getElementById('install-progress-fill').style.width = safePercent + '%';
                document.getElementById('install-progress-percent').textContent = safePercent + '%';
                if (progress.status) {
                    document.getElementById('install-status').textContent = progress.status;
                }
            }
            console.log('安装进度:', progress);
        });
        
        ipcRenderer.on('update-install-complete', () => {
            showUpdateState('install-complete');
            console.log('安装完成');
        });
        
        ipcRenderer.on('update-error', (event, error) => {
            document.getElementById('update-error-msg').textContent = error || '检查更新失败，请稍后重试';
            showUpdateState('error');
        });
        
        // 更新完成通知（应用重启后显示）
        ipcRenderer.on('update-completed-notification', (event, info) => {
            console.log('收到更新完成通知:', info);
            
            // 显示更新成功提示
            showUpdateSuccessToast(info.version);
        });
        
        // 显示更新成功提示
        function showUpdateSuccessToast(version) {
            // 创建 toast 容器（如果不存在）
            let toastContainer = document.getElementById('toast-container');
            if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.id = 'toast-container';
                toastContainer.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10000;
                `;
                document.body.appendChild(toastContainer);
            }
            
            // 创建 toast 元素
            const toast = document.createElement('div');
            toast.className = 'update-success-toast';
            toast.innerHTML = `
                <div style="
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    padding: 16px 24px;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(16, 185, 129, 0.4);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    animation: slideIn 0.5s ease-out;
                    max-width: 350px;
                ">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <div>
                        <div style="font-weight: 600; font-size: 14px;">更新成功！</div>
                        <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">已更新到版本 v${version}</div>
                    </div>
                </div>
            `;
            
            // 添加动画样式
            if (!document.getElementById('toast-styles')) {
                const style = document.createElement('style');
                style.id = 'toast-styles';
                style.textContent = `
                    @keyframes slideIn {
                        from {
                            transform: translateX(100%);
                            opacity: 0;
                        }
                        to {
                            transform: translateX(0);
                            opacity: 1;
                        }
                    }
                    @keyframes slideOut {
                        from {
                            transform: translateX(0);
                            opacity: 1;
                        }
                        to {
                            transform: translateX(100%);
                            opacity: 0;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
            
            toastContainer.appendChild(toast);
            
            // 5秒后自动消失
            setTimeout(() => {
                toast.style.animation = 'slideOut 0.3s ease-in forwards';
                setTimeout(() => {
                    toast.remove();
                }, 300);
            }, 5000);
        }
        
        // 静默检查发现更新时的处理
        ipcRenderer.on('update-available-silent', (event, info) => {
            console.log('静默检查发现新版本:', info.version);
            // 存储更新信息
            updateInfo = info;
            // 显示更新提示红点或弹出提示
            showUpdateNotification(info);
        });
        
        // 显示更新提示
        function showUpdateNotification(info) {
            // 创建更新提示 Toast
            const toast = document.createElement('div');
            toast.className = 'update-toast';
            toast.innerHTML = `
                <div class="update-toast-content">
                    <div class="update-toast-icon">🎉</div>
                    <div class="update-toast-text">
                        <div class="update-toast-title">发现新版本 v${escapeHtml(info.version)}</div>
                        <div class="update-toast-desc">点击查看更新内容</div>
                    </div>
                    <button class="update-toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
                </div>
            `;
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 12px;
                padding: 16px 20px;
                box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4);
                animation: slideIn 0.3s ease-out;
                cursor: pointer;
                max-width: 320px;
            `;
            toast.querySelector('.update-toast-content').style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
            `;
            toast.querySelector('.update-toast-icon').style.cssText = `
                font-size: 28px;
            `;
            toast.querySelector('.update-toast-title').style.cssText = `
                font-weight: 600;
                font-size: 14px;
            `;
            toast.querySelector('.update-toast-desc').style.cssText = `
                font-size: 12px;
                opacity: 0.9;
                margin-top: 2px;
            `;
            toast.querySelector('.update-toast-close').style.cssText = `
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-left: auto;
            `;
            
            // 添加动画样式
            if (!document.getElementById('update-toast-animation-style')) {
                const style = document.createElement('style');
                style.id = 'update-toast-animation-style';
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }
            
            // 点击打开更新弹窗
            toast.addEventListener('click', (e) => {
                if (e.target.className !== 'update-toast-close') {
                    toast.remove();
                    openUpdateModal();
                    // 发送事件通知主进程已查看
                    ipcRenderer.send('check-for-updates');
                }
            });
            
            document.body.appendChild(toast);
            
            // 10 秒后自动消失
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.style.animation = 'slideIn 0.3s ease-out reverse';
                    setTimeout(() => toast.remove(), 300);
                }
            }, 10000);
        }
