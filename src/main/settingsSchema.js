const DEFAULTS = {
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

const BOOLEAN_KEYS = ['autostart', 'minimizeToTray', 'confirmExit', 'openFolderAfter', 'keepHistory'];
const THEMES = new Set(['light', 'dark', 'system']);

function sanitizeSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return { ...DEFAULTS };
    }

    const sanitized = { ...DEFAULTS };

    for (const key of BOOLEAN_KEYS) {
        if (typeof settings[key] === 'boolean') {
            sanitized[key] = settings[key];
        }
    }

    if (typeof settings.theme === 'string' && THEMES.has(settings.theme)) {
        sanitized.theme = settings.theme;
    }

    if (settings.zoom !== undefined) {
        const zoom = Number(settings.zoom);
        if (Number.isFinite(zoom) && zoom >= 0.5 && zoom <= 2) {
            sanitized.zoom = String(zoom);
        }
    }

    if (settings.opacity !== undefined) {
        const opacity = Number(settings.opacity);
        if (Number.isFinite(opacity)) {
            sanitized.opacity = Math.min(100, Math.max(20, opacity));
        }
    }

    if (typeof settings.defaultOutputDir === 'string') {
        sanitized.defaultOutputDir = settings.defaultOutputDir;
    }

    return sanitized;
}

module.exports = { DEFAULTS, sanitizeSettings };
