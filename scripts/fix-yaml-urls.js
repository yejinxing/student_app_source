const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 从环境变量获取版本号
const version = process.env.VERSION || process.env.GITHUB_REF_NAME || 'v1.0.0';
const githubBaseUrl = `https://github.com/yejinxing/student_app_source/releases/download/${version}`;

function fixYamlFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    
    console.log(`修改 ${filePath}...`);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = yaml.load(content);
        
        // 更新 version 字段（从 tag 中提取，移除 v 前缀）
        const versionWithoutV = version.replace(/^v/, '');
        if (data.version !== versionWithoutV) {
            console.log(`  更新 version: ${data.version} -> ${versionWithoutV}`);
            data.version = versionWithoutV;
        }
        
        // 修改 files 数组中的 url
        if (data.files && Array.isArray(data.files)) {
            data.files.forEach(file => {
                if (file.url && !file.url.startsWith('http')) {
                    file.url = `${githubBaseUrl}/${file.url}`;
                }
                if (file.path) {
                    if (!file.url) {
                        file.url = `${githubBaseUrl}/${file.path}`;
                    }
                    delete file.path;
                }
            });
        }
        
        // 兼容旧格式：直接在根级别有 path
        if (data.path && !data.path.startsWith('http')) {
            if (!data.url) {
                data.url = `${githubBaseUrl}/${data.path}`;
            }
            delete data.path;
        }
        
        fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1, noRefs: true }), 'utf8');
        console.log(`✅ ${filePath} 已修改`);
    } catch (e) {
        console.error(`修改 ${filePath} 失败:`, e.message);
        process.exit(1);
    }
}

// 修改所有 latest*.yml 文件
const distDir = 'dist';
if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    files.forEach(file => {
        if (file.match(/^latest.*\.yml$/) || file.endsWith('.yaml')) {
            fixYamlFile(path.join(distDir, file));
        }
    });
} else {
    console.log('dist 目录不存在，跳过修改');
}

