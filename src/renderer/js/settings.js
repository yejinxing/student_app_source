        // ===== 系统设置功能 =====
        
        // 默认设置
        const defaultSettings = {
            autostart: false,
            minimizeToTray: false,
            confirmExit: true,
            theme: 'light',
            zoom: '1',
            opacity: 100,
            defaultOutputDir: '',
            openFolderAfter: false,
            keepHistory: true
        };
        
        // 当前设置
        let appSettings = { ...defaultSettings };
        
        // 加载设置
        function loadSettings() {
            try {
                const saved = localStorage.getItem('appSettings');
                if (saved) {
                    appSettings = { ...defaultSettings, ...JSON.parse(saved) };
                }
            } catch (e) {
                console.error('加载设置失败:', e);
                appSettings = { ...defaultSettings };
            }
            applySettings();
            updateSettingsUI();
        }
        
        // 保存设置
        function saveSettings() {
            try {
                localStorage.setItem('appSettings', JSON.stringify(appSettings));
                ipcRenderer.send('save-settings', appSettings);
            } catch (e) {
                console.error('保存设置失败:', e);
            }
        }
        
        // 应用设置
        function applySettings() {
            // 应用主题
            if (appSettings.theme === 'dark') {
                document.body.classList.add('dark-theme');
            } else if (appSettings.theme === 'light') {
                document.body.classList.remove('dark-theme');
            } else if (appSettings.theme === 'system') {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.body.classList.toggle('dark-theme', prefersDark);
            }
            
            // 应用缩放
            document.body.style.zoom = appSettings.zoom;
            
            // 应用透明度（需要 main 进程配合）
            ipcRenderer.send('set-opacity', appSettings.opacity / 100);
        }
        
        // 更新设置界面
        function updateSettingsUI() {
            document.getElementById('setting-autostart').checked = appSettings.autostart;
            document.getElementById('setting-minimize-to-tray').checked = appSettings.minimizeToTray;
            document.getElementById('setting-confirm-exit').checked = appSettings.confirmExit;
            document.getElementById('setting-theme').value = appSettings.theme;
            document.getElementById('setting-zoom').value = appSettings.zoom;
            document.getElementById('setting-opacity').value = appSettings.opacity;
            document.getElementById('opacity-value').textContent = appSettings.opacity;
            document.getElementById('setting-open-folder-after').checked = appSettings.openFolderAfter;
            document.getElementById('setting-keep-history').checked = appSettings.keepHistory;
            
            if (appSettings.defaultOutputDir) {
                document.getElementById('default-output-dir-display').textContent = appSettings.defaultOutputDir;
            }
            
            // 更新滑块背景
            updateRangeBackground(document.getElementById('setting-opacity'));
        }
        
        // 更新滑块背景色
        function updateRangeBackground(range) {
            const min = range.min || 0;
            const max = range.max || 100;
            const val = range.value;
            const percentage = ((val - min) / (max - min)) * 100;
            range.style.background = `linear-gradient(to right, #3498db 0%, #3498db ${percentage}%, #e9ecef ${percentage}%, #e9ecef 100%)`;
        }
        
        // 绑定设置事件
        function bindSettingsEvents() {
            // 开机自启动
            document.getElementById('setting-autostart').addEventListener('change', function() {
                appSettings.autostart = this.checked;
                saveSettings();
                ipcRenderer.send('set-autostart', this.checked);
            });
            
            // 最小化到托盘
            document.getElementById('setting-minimize-to-tray').addEventListener('change', function() {
                appSettings.minimizeToTray = this.checked;
                saveSettings();
            });
            
            // 退出确认
            document.getElementById('setting-confirm-exit').addEventListener('change', function() {
                appSettings.confirmExit = this.checked;
                saveSettings();
            });
            
            // 主题
            document.getElementById('setting-theme').addEventListener('change', function() {
                appSettings.theme = this.value;
                saveSettings();
                applySettings();
            });
            
            // 缩放
            document.getElementById('setting-zoom').addEventListener('change', function() {
                appSettings.zoom = this.value;
                saveSettings();
                applySettings();
            });
            
            // 透明度
            document.getElementById('setting-opacity').addEventListener('input', function() {
                appSettings.opacity = parseInt(this.value);
                document.getElementById('opacity-value').textContent = this.value;
                updateRangeBackground(this);
                applySettings();
            });
            
            document.getElementById('setting-opacity').addEventListener('change', function() {
                saveSettings();
            });
            
            // 转换后打开文件夹
            document.getElementById('setting-open-folder-after').addEventListener('change', function() {
                appSettings.openFolderAfter = this.checked;
                saveSettings();
            });
            
            // 保留历史记录
            document.getElementById('setting-keep-history').addEventListener('change', function() {
                appSettings.keepHistory = this.checked;
                saveSettings();
            });
            
            // 监听系统主题变化
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (appSettings.theme === 'system') {
                    document.body.classList.toggle('dark-theme', e.matches);
                }
            });
        }
        
        // 选择默认输出目录
        function selectDefaultOutputDir() {
            ipcRenderer.send('select-default-output-dir');
        }
        
        ipcRenderer.on('selected-default-output-dir', (event, path) => {
            appSettings.defaultOutputDir = path;
            document.getElementById('default-output-dir-display').textContent = path || '与源文件相同目录';
            saveSettings();
        });
        
        // 清理缓存
        function clearCache() {
            if (confirm('确定要清理所有缓存数据吗？')) {
                ipcRenderer.send('clear-cache');
            }
        }
        
        ipcRenderer.on('cache-cleared', (event, success) => {
            if (success) {
                alert('缓存已清理完成！');
                getCacheSize();
            } else {
                alert('清理缓存失败！');
            }
        });
        
        // 获取缓存大小
        function getCacheSize() {
            ipcRenderer.send('get-cache-size');
        }
        
        ipcRenderer.on('cache-size', (event, size) => {
            document.getElementById('cache-size').textContent = size;
        });
        
        // 导出设置
        function exportSettings() {
            ipcRenderer.send('export-settings', appSettings);
        }
        
        ipcRenderer.on('settings-exported', (event, success, path) => {
            if (success) {
                alert(`设置已导出到: ${path}`);
            } else {
                alert('导出设置失败！');
            }
        });
        
        // 导入设置
        function importSettings() {
            ipcRenderer.send('import-settings');
        }
        
        ipcRenderer.on('settings-imported', (event, settings) => {
            if (settings) {
                appSettings = { ...defaultSettings, ...settings };
                saveSettings();
                applySettings();
                updateSettingsUI();
                alert('设置导入成功！');
            }
        });
        
        // 重置设置
        function resetSettings() {
            if (confirm('确定要将所有设置恢复为默认值吗？此操作无法撤销。')) {
                appSettings = { ...defaultSettings };
                saveSettings();
                applySettings();
                updateSettingsUI();
                ipcRenderer.send('reset-settings');
                alert('设置已重置为默认值！');
            }
        }
        
        // 打开安装目录
        function openInstallDir() {
            ipcRenderer.send('open-install-dir');
        }
        
        // 显示许可证
        function showLicenses() {
            ipcRenderer.send('show-licenses');
        }
        
        // 打开GitHub页面
        function openGitHub() {
            ipcRenderer.send('open-external-url', 'https://github.com/yejinxing/');
        }
        
        // 获取应用信息
