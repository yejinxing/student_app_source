const fs = require('fs-extra');
const os = require('os');
const path = require('path');

async function makeTempDir(prefix = 'student-app-test-') {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function removeTempDir(dir) {
    if (dir) {
        await fs.remove(dir);
    }
}

module.exports = { makeTempDir, removeTempDir };
