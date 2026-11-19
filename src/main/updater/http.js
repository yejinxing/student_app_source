const { app } = require('electron');

// 通用的 HTTP GET 请求函数，支持重定向
function httpGet(url, options = {}, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
            reject(new Error('重定向次数过多'));
            return;
        }
        
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? require('https') : require('http');
        
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'StudentApp/' + app.getVersion(),
                ...options.headers
            },
            timeout: options.timeout || 10000
        };
        
        const req = client.request(requestOptions, (res) => {
            // 处理重定向 (301, 302, 303, 307, 308)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = res.headers.location;
                const absoluteUrl = redirectUrl.startsWith('http') 
                    ? redirectUrl 
                    : `${urlObj.protocol}//${urlObj.hostname}${redirectUrl}`;
                
                console.log(`跟随重定向: ${url} -> ${absoluteUrl}`);
                // 递归调用，减少重定向次数
                httpGet(absoluteUrl, options, maxRedirects - 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                return;
            }
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve(data);
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
        
        req.end();
    });
}

module.exports = { httpGet };
