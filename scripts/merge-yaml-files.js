const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 从环境变量获取版本号
const version = process.env.VERSION || process.env.GITHUB_REF_NAME || 'v1.0.0';
const versionWithoutV = version.replace(/^v/, '');

const distDir = 'dist';
if (!fs.existsSync(distDir)) {
    console.log('dist 目录不存在，跳过合并');
    process.exit(0);
}

// 读取所有平台的 yml 文件
const ymlFiles = {
    win: null,
    mac: null,
    linux: null
};

// 查找 latest.yml (Windows)
if (fs.existsSync(path.join(distDir, 'latest.yml'))) {
    ymlFiles.win = path.join(distDir, 'latest.yml');
}

// 查找 latest-mac.yml (macOS)
if (fs.existsSync(path.join(distDir, 'latest-mac.yml'))) {
    ymlFiles.mac = path.join(distDir, 'latest-mac.yml');
}

// 查找 latest-linux.yml (Linux)
if (fs.existsSync(path.join(distDir, 'latest-linux.yml'))) {
    ymlFiles.linux = path.join(distDir, 'latest-linux.yml');
}

console.log('找到的 yml 文件:');
console.log('  Windows:', ymlFiles.win || '未找到');
console.log('  macOS:', ymlFiles.mac || '未找到');
console.log('  Linux:', ymlFiles.linux || '未找到');

// 合并所有平台的文件信息
const mergedFiles = [];
let mergedVersion = versionWithoutV;
let mergedReleaseDate = null;

// 处理每个平台的 yml 文件
Object.entries(ymlFiles).forEach(([platform, filePath]) => {
    if (!filePath || !fs.existsSync(filePath)) {
        return;
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = yaml.load(content);
        
        // 使用第一个找到的版本号和发布日期
        if (!mergedVersion && data.version) {
            mergedVersion = data.version;
        }
        if (!mergedReleaseDate && data.releaseDate) {
            mergedReleaseDate = data.releaseDate;
        }
        
        // 合并 files 数组
        if (data.files && Array.isArray(data.files)) {
            data.files.forEach(file => {
                // 检查是否已存在相同的文件（避免重复）
                const exists = mergedFiles.some(f => 
                    f.url === file.url || 
                    (file.path && f.path === file.path) ||
                    (file.url && f.url && f.url.endsWith(file.url))
                );
                
                if (!exists) {
                    mergedFiles.push(file);
                }
            });
        }
        
        // 处理根级别的 path 和 url（兼容旧格式）
        if (data.path || data.url) {
            const fileUrl = data.url || data.path;
            const exists = mergedFiles.some(f => 
                f.url === fileUrl || 
                (fileUrl && f.url && f.url.endsWith(fileUrl))
            );
            
            if (!exists) {
                mergedFiles.push({
                    url: fileUrl,
                    sha512: data.sha512,
                    size: data.size
                });
            }
        }
        
        console.log(`✅ 已处理 ${platform} 平台的文件`);
    } catch (e) {
        console.error(`处理 ${platform} 平台文件失败:`, e.message);
    }
});

// 创建合并后的 latest.yml
const mergedData = {
    version: mergedVersion,
    files: mergedFiles,
    releaseDate: mergedReleaseDate
};

// 如果有文件，写入合并后的 latest.yml
if (mergedFiles.length > 0) {
    const outputPath = path.join(distDir, 'latest.yml');
    fs.writeFileSync(outputPath, yaml.dump(mergedData, { lineWidth: -1, noRefs: true }), 'utf8');
    console.log(`✅ 已创建合并后的 latest.yml，包含 ${mergedFiles.length} 个文件`);
    console.log(`   版本: ${mergedVersion}`);
    console.log(`   发布日期: ${mergedReleaseDate || '未知'}`);
} else {
    console.warn('⚠️ 没有找到任何文件，跳过创建合并后的 latest.yml');
}

