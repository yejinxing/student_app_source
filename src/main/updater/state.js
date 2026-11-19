const state = {
    currentUpdateInfo: null,
    manualReleaseInfo: null,
    currentMirrorState: {
        mirrorIndex: 0,
        originalUrls: {},
        retryCount: 0,
        maxRetriesPerMirror: 2
    },
    updateErrorPending: null,
    cachedInstallerPath: null,
    pendingInstallerPath: null
};

module.exports = state;
