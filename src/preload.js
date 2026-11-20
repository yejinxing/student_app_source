const { contextBridge, ipcRenderer } = require('electron');

const SEND_CHANNELS = new Set([
    'start-conversion',
    'download-template',
    'download-audit-template',
    'select-photo-folder',
    'select-photo-excel-file',
    'select-photo-output-folder',
    'start-renaming',
    'stop-renaming',
    'check-for-updates',
    'check-for-updates-silent',
    'download-update',
    'cancel-download',
    'install-update',
    'open-external-url',
    'save-settings',
    'set-opacity',
    'set-autostart',
    'select-default-output-dir',
    'clear-cache',
    'get-cache-size',
    'export-settings',
    'import-settings',
    'reset-settings',
    'open-install-dir',
    'show-licenses',
    'get-app-info',
    'start-ticket-audit',
    'cancel-ticket-audit',
    'open-pdf-file'
]);

const INVOKE_CHANNELS = new Set([
    'select-file',
    'select-pdf-dir',
    'get-excel-columns',
    'detect-exam-schedule',
    'open-file',
    'select-class-assign-excel',
    'analyze-class-assign-excel',
    'generate-class-assign',
    'download-class-assign-template'
]);

const RECEIVE_CHANNELS = new Set([
    'audit-progress',
    'audit-success',
    'audit-error',
    'conversion-success',
    'conversion-error',
    'template-downloaded',
    'audit-template-downloaded',
    'selected-photo-folder',
    'selected-photo-excel-file',
    'selected-photo-output-folder',
    'renaming-status',
    'renaming-progress',
    'renaming-finished',
    'update-checking',
    'update-available',
    'update-not-available',
    'update-downloading',
    'update-progress',
    'update-retrying',
    'update-downloaded',
    'update-installing',
    'update-install-complete',
    'update-error',
    'update-completed-notification',
    'update-available-silent',
    'selected-default-output-dir',
    'cache-cleared',
    'cache-size',
    'settings-exported',
    'settings-imported',
    'app-info'
]);

function assertAllowed(allowed, channel, action) {
    if (!allowed.has(channel)) {
        throw new Error(`不允许的 IPC ${action} 通道: ${channel}`);
    }
}

const listenerMap = new Map();

function on(channel, listener) {
    assertAllowed(RECEIVE_CHANNELS, channel, '接收');
    const wrapped = (event, ...args) => listener(event, ...args);
    listenerMap.set(listener, wrapped);
    ipcRenderer.on(channel, wrapped);
}

function once(channel, listener) {
    assertAllowed(RECEIVE_CHANNELS, channel, '接收');
    const wrapped = (event, ...args) => {
        listenerMap.delete(listener);
        listener(event, ...args);
    };
    listenerMap.set(listener, wrapped);
    ipcRenderer.once(channel, wrapped);
}

function removeListener(channel, listener) {
    const wrapped = listenerMap.get(listener);
    if (wrapped) {
        ipcRenderer.removeListener(channel, wrapped);
        listenerMap.delete(listener);
    }
}

function removeAllListeners(channel) {
    assertAllowed(RECEIVE_CHANNELS, channel, '接收');
    ipcRenderer.removeAllListeners(channel);
    listenerMap.clear();
}

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    send(channel, ...args) {
        assertAllowed(SEND_CHANNELS, channel, '发送');
        ipcRenderer.send(channel, ...args);
    },
    invoke(channel, ...args) {
        assertAllowed(INVOKE_CHANNELS, channel, '调用');
        return ipcRenderer.invoke(channel, ...args);
    },
    on,
    once,
    removeListener,
    removeAllListeners,
    openPath(filePath) {
        return ipcRenderer.invoke('open-file', filePath);
    },
    openExternal(url) {
        ipcRenderer.send('open-external-url', url);
    }
});
