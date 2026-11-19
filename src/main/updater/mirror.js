// GitHub 镜像加速列表（按优先级排序）
// 注意：某些镜像可能会有 SSL 证书问题或不稳定，需要定期检查更新
// 前缀方式：在原始 URL 前添加镜像前缀
// 替换方式：将 github.com 替换为镜像域名
const GITHUB_MIRRORS = [
    { name: 'ghproxy.net', prefix: 'https://ghproxy.net/', type: 'prefix' },
    { name: 'gh-proxy', prefix: 'https://gh-proxy.com/', type: 'prefix' },
    { name: 'ghfast', prefix: 'https://ghfast.top/', type: 'prefix' },
    { name: 'kkgithub', prefix: 'https://kkgithub.com/', type: 'replace' },  // 替换 github.com
    { name: '直连', prefix: '', type: 'direct' }
];

// 从镜像 URL 中提取原始 URL
function extractOriginalUrl(url) {
    if (!url) return url;
    
    // 检查是否是镜像 URL
    for (const mirror of GITHUB_MIRRORS) {
        if (!mirror.prefix) continue;
        
        if (mirror.type === 'replace') {
            // 替换方式：将镜像域名替换回 github.com
            const mirrorDomain = mirror.prefix.replace(/\/$/, '');
            if (url.includes(mirrorDomain)) {
                return url.replace(mirrorDomain, 'https://github.com');
            }
        } else if (mirror.type === 'prefix' && url.startsWith(mirror.prefix)) {
            // 前缀方式：移除镜像前缀
            return url.substring(mirror.prefix.length);
        }
    }
    
    // 不是镜像 URL，返回原样
    return url;
}

// 将 GitHub URL 转换为镜像 URL
function transformToMirrorUrl(url, mirrorIndex = 0) {
    if (!url) {
        return url;
    }
    
    // 先提取原始 URL（如果已经是镜像 URL，先还原）
    const originalUrl = extractOriginalUrl(url);
    
    // 检查是否是 GitHub URL
    if (!originalUrl.includes('github.com')) {
        return url;  // 不是 GitHub URL，不转换
    }
    
    if (mirrorIndex >= GITHUB_MIRRORS.length) {
        mirrorIndex = 0;
    }
    
    const mirror = GITHUB_MIRRORS[mirrorIndex];
    
    // 根据镜像类型进行转换
    if (mirror.type === 'replace') {
        // 替换方式：将 github.com 替换为镜像域名
        return originalUrl.replace('https://github.com', mirror.prefix.replace(/\/$/, ''));
    } else if (mirror.type === 'prefix' && mirror.prefix) {
        // 前缀方式：在原始 URL 前添加镜像前缀
        return mirror.prefix + originalUrl;
    } else {
        // 直连或其他
        return originalUrl;
    }
}

module.exports = { GITHUB_MIRRORS, extractOriginalUrl, transformToMirrorUrl };
