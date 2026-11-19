const path = require('path');
const fs = require('fs-extra');

async function forceRemoveDir(dirPath, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            if (!fs.existsSync(dirPath)) {
                return true;
            }

            fs.removeSync(dirPath);
            return true;
        } catch (e) {
            if (i < maxRetries - 1) {
                const waitTime = Math.min(500 * Math.pow(2, i), 5000);
                console.log(`删除失败 (${e.message})，等待 ${waitTime}ms 后重试 (${i + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
                throw e;
            }
        }
    }
    return false;
}

async function cleanupDirRecursively(dirPath, cleanedCountRef) {
    try {
        console.log('尝试逐个删除文件和子目录...');
        const files = fs.readdirSync(dirPath);

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    console.log('  删除子目录:', filePath);
                    await forceRemoveDir(filePath, 3);
                    cleanedCountRef.count++;
                } else {
                    console.log('  删除文件:', filePath);
                    for (let i = 0; i < 3; i++) {
                        try {
                            fs.unlinkSync(filePath);
                            cleanedCountRef.count++;
                            break;
                        } catch (fileError) {
                            if (i < 2) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            } else {
                                throw fileError;
                            }
                        }
                    }
                }
            } catch (fileError) {
                console.warn(`  删除失败 ${filePath}:`, fileError.message);
            }
        }

        try {
            await forceRemoveDir(dirPath, 3);
            console.log('✓ 已删除空的目录');
            cleanedCountRef.count++;
        } catch (e2) {
            console.warn('删除空目录失败:', e2.message);
        }
    } catch (e2) {
        console.error('逐个删除也失败:', e2.message);
    }
}

module.exports = { forceRemoveDir, cleanupDirRecursively };
