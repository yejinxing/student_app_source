const path = require('path');

function getLocalUpdaterDirs({ appName, platform = process.platform, env = process.env }) {
    if (platform !== 'win32') {
        return { localPendingDir: null, localUpdaterCacheDir: null };
    }

    const localAppData = env.LOCALAPPDATA || path.join(env.USERPROFILE || '', 'AppData', 'Local');
    return {
        localPendingDir: path.join(localAppData, appName, 'pending'),
        localUpdaterCacheDir: path.join(localAppData, appName + '-updater')
    };
}

module.exports = { getLocalUpdaterDirs };
