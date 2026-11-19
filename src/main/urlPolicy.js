const ALLOWED_EXTERNAL_HOSTS = new Set([
    'github.com',
    'www.github.com',
    'gitee.com',
    'www.gitee.com'
]);

function isAllowedExternalUrl(url) {
    try {
        const parsed = new URL(String(url));
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return false;
        }
        return ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase());
    } catch (e) {
        return false;
    }
}

module.exports = { ALLOWED_EXTERNAL_HOSTS, isAllowedExternalUrl };
