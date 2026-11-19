        // 关于弹窗
        function openAboutModal() {
            document.getElementById('about-modal').classList.add('active');
            // 更新版本号
            getAppInfo();
        }
        
        function closeAboutModal(event) {
            if (!event || event.target === event.currentTarget) {
                document.getElementById('about-modal').classList.remove('active');
            }
        }
        
        // ESC 键关闭弹窗
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeAboutModal();
                closeUpdateModal();
            }
        });

        function getAppInfo() {
            ipcRenderer.send('get-app-info');
        }
        
        onIpc('app-info', (event, info) => {
            document.getElementById('app-version').textContent = `v${info.version}`;
            document.getElementById('electron-version').textContent = info.electronVersion;
            document.getElementById('install-path').textContent = info.installPath;
            // 更新主页版本信息
            if (document.getElementById('home-version')) {
                document.getElementById('home-version').textContent = `v${info.version}`;
            }
            if (document.getElementById('home-platform')) {
                document.getElementById('home-platform').textContent = window.electronAPI.platform === 'win32' ? 'Windows' : window.electronAPI.platform;
            }
            // 更新关于弹窗版本信息
            if (document.getElementById('about-app-version')) {
                document.getElementById('about-app-version').textContent = `v${info.version}`;
            }
        });
        
