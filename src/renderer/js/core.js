        const ipcRenderer = window.electronAPI;
        let selectedPath = '';

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

        function showPage(page) {
            document.getElementById('home-page').style.display = page === 'home' ? 'block' : 'none';
            document.getElementById('convert-page').style.display = page === 'convert' ? 'block' : 'none';
            document.getElementById('ticket-audit-page').style.display = page === 'ticket-audit' ? 'block' : 'none';
            document.getElementById('photo-rename-page').style.display = page === 'photo-rename' ? 'block' : 'none';
            document.getElementById('settings-page').style.display = page === 'settings' ? 'block' : 'none';
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
            if (event && event.currentTarget) {
            event.currentTarget.classList.add('active');
            }
        }

        // 通过页面名称显示页面（用于快捷入口）
        function showPageByName(page) {
            document.getElementById('home-page').style.display = page === 'home' ? 'block' : 'none';
            document.getElementById('convert-page').style.display = page === 'convert' ? 'block' : 'none';
            document.getElementById('ticket-audit-page').style.display = page === 'ticket-audit' ? 'block' : 'none';
            document.getElementById('photo-rename-page').style.display = page === 'photo-rename' ? 'block' : 'none';
            document.getElementById('settings-page').style.display = page === 'settings' ? 'block' : 'none';

            // 更新侧边栏选中状态
            const pageIndex = {'home': 0, 'convert': 1, 'ticket-audit': 2, 'photo-rename': 3, 'settings': 4};            document.querySelectorAll('.sidebar-nav .nav-item').forEach((el, index) => {
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
        
