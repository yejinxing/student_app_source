        const ipcRenderer = window.electronAPI;
        let selectedPath = '';

        const ipcChannels = new Set();

        function onIpc(channel, listener) {
            ipcChannels.add(channel);
            ipcRenderer.on(channel, listener);
        }

        window.addEventListener('beforeunload', () => {
            for (const channel of ipcChannels) {
                ipcRenderer.removeAllListeners(channel);
            }
            ipcChannels.clear();
        });

        // 侧边栏切换
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('expanded');
            localStorage.setItem('sidebarExpanded', sidebar.classList.contains('expanded'));
        }
        
        // 初始化侧边栏状态
        function initSidebar() {
            const expanded = localStorage.getItem('sidebarExpanded') === 'true';
            const sidebar = document.getElementById('sidebar');
            if (expanded) {
                sidebar.classList.add('expanded');
            }
        }

        function showPage(page, navElement) {
            document.getElementById('home-page').style.display = page === 'home' ? 'block' : 'none';
            document.getElementById('convert-page').style.display = page === 'convert' ? 'block' : 'none';
            document.getElementById('ticket-audit-page').style.display = page === 'ticket-audit' ? 'block' : 'none';
            document.getElementById('photo-rename-page').style.display = page === 'photo-rename' ? 'block' : 'none';
            document.getElementById('class-assign-page').style.display = page === 'class-assign' ? 'block' : 'none';
            document.getElementById('settings-page').style.display = page === 'settings' ? 'block' : 'none';
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
            if (navElement) {
                navElement.classList.add('active');
            }
        }

        // 通过页面名称显示页面（用于快捷入口）
        function showPageByName(page) {
            document.getElementById('home-page').style.display = page === 'home' ? 'block' : 'none';
            document.getElementById('convert-page').style.display = page === 'convert' ? 'block' : 'none';
            document.getElementById('ticket-audit-page').style.display = page === 'ticket-audit' ? 'block' : 'none';
            document.getElementById('photo-rename-page').style.display = page === 'photo-rename' ? 'block' : 'none';
            document.getElementById('class-assign-page').style.display = page === 'class-assign' ? 'block' : 'none';
            document.getElementById('settings-page').style.display = page === 'settings' ? 'block' : 'none';

            // 更新侧边栏选中状态
            const pageIndex = {
                'home': 0,
                'convert': 1,
                'ticket-audit': 2,
                'photo-rename': 3,
                'class-assign': 4,
                'settings': 5
            };
            document.querySelectorAll('.sidebar-nav .nav-item').forEach((el, index) => {
                el.classList.toggle('active', index === pageIndex[page]);
            });
        }

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function openGeneratedFile(filePath) {
            window.electronAPI.openPath(filePath);
            return false;
        }

        function showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = `app-toast app-toast-${type}`;
            toast.textContent = message;
            document.body.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('app-toast-visible'));
            setTimeout(() => {
                toast.classList.remove('app-toast-visible');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        const pageActions = {
            'toggle-sidebar': () => toggleSidebar(),
            'show-page': (element) => showPage(element.dataset.page, element),
            'show-page-by-name': (element) => showPageByName(element.dataset.page),
            'open-about': () => openAboutModal(),
            'close-about-overlay': (element, clickEvent) => {
                if (!clickEvent.target.closest('.modal-content')) closeAboutModal();
            },
            'close-about': () => closeAboutModal(),
            'open-github': () => openGitHub(),
            'check-update': () => checkUpdate(),
            'close-update-overlay': (element, clickEvent) => {
                if (!clickEvent.target.closest('.modal-content')) closeUpdateModal();
            },
            'close-update': () => closeUpdateModal(),
            'start-download': () => startDownload(),
            'open-release-page': () => openReleasePage(),
            'cancel-download': () => cancelDownload(),
            'install-update': () => installUpdate(),
            'select-file': () => selectFile(),
            'start-conversion': () => startConversion(),
            'download-template': () => downloadTemplate(),
            'download-audit-template': () => downloadAuditTemplate(),
            'select-audit-pdf-dir': () => selectAuditPdfDir(),
            'select-audit-excel': () => selectAuditExcel(),
            'start-ticket-audit': () => startTicketAudit(),
            'select-photo-excel-file': () => selectPhotoExcelFile(),
            'select-photo-folder': () => selectPhotoFolder(),
            'select-photo-output-folder': () => selectPhotoOutputFolder(),
            'start-photo-renaming': () => startPhotoRenaming(),
            'stop-photo-renaming': () => stopPhotoRenaming(),
            'select-class-assign-excel': () => selectClassAssignExcel(),
            'start-class-assign': () => startClassAssign(),
            'download-class-assign-template': () => downloadClassAssignTemplate(),
            'close-class-assign-overlay': (element, clickEvent) => {
                if (!clickEvent.target.closest('.modal-content')) closeClassAssignConfirm();
            },
            'close-class-assign-confirm': () => closeClassAssignConfirm(),
            'confirm-class-assign': () => confirmClassAssign(),
            'select-default-output-dir': () => selectDefaultOutputDir(),
            'clear-cache': () => clearCache(),
            'export-settings': () => exportSettings(),
            'import-settings': () => importSettings(),
            'reset-settings': () => resetSettings(),
            'open-install-dir': () => openInstallDir(),
            'show-licenses': () => showLicenses()
        };

        document.addEventListener('click', (clickEvent) => {
            const actionElement = clickEvent.target.closest('[data-action]');
            if (!actionElement) return;

            const handler = pageActions[actionElement.dataset.action];
            if (typeof handler === 'function') {
                handler(actionElement, clickEvent);
            }
        });

        // 页面加载完成后初始化
        document.addEventListener('DOMContentLoaded', () => {
            initSidebar();
            loadSettings();
            bindSettingsEvents();
            getAppInfo();
            getCacheSize();
            
            // 延迟 2 秒后静默检查更新（不打开弹窗）
            setTimeout(() => {
                console.log('静默检查更新...');
                ipcRenderer.send('check-for-updates-silent');
            }, 2000);
        });
        
