const path = require('path');
const { BrowserWindow } = require('electron');
const { assetPath } = require('./paths');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, '..', 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        },
        title: '学生信息处理工具',
        icon: assetPath('icon.png'),
        autoHideMenuBar: true
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event) => {
        event.preventDefault();
    });
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(false);
    });

    mainWindow.loadFile('index.html');
    return mainWindow;
}

function getMainWindow() {
    return mainWindow;
}

function sendToRenderer(channel, ...args) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send(channel, ...args);
    }
}

module.exports = { createWindow, getMainWindow, sendToRenderer };
