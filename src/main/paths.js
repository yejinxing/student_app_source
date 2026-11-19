const path = require('path');
const { app } = require('electron');

function appRoot() {
    return app.getAppPath();
}

function rootPath(...segments) {
    return path.join(appRoot(), ...segments);
}

function assetPath(...segments) {
    return path.join(appRoot(), 'assets', ...segments);
}

module.exports = { appRoot, rootPath, assetPath };
