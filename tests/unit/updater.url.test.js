const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    extractOriginalUrl,
    transformToMirrorUrl
} = require('../../src/main/updater/mirror');

test('extractOriginalUrl 还原镜像前缀与替换域名', () => {
    assert.equal(
        extractOriginalUrl('https://ghproxy.net/https://github.com/owner/repo/releases/download/v1/app.exe'),
        'https://github.com/owner/repo/releases/download/v1/app.exe'
    );
    assert.equal(
        extractOriginalUrl('https://kkgithub.com/owner/repo/releases/download/v1/app.exe'),
        'https://github.com/owner/repo/releases/download/v1/app.exe'
    );
    assert.equal(extractOriginalUrl('https://github.com/owner/repo'), 'https://github.com/owner/repo');
});

test('transformToMirrorUrl 按索引转换 GitHub URL', () => {
    const githubUrl = 'https://github.com/owner/repo/releases/download/v1/app.exe';
    assert.equal(
        transformToMirrorUrl(githubUrl, 0),
        'https://ghproxy.net/https://github.com/owner/repo/releases/download/v1/app.exe'
    );
    assert.equal(
        transformToMirrorUrl(githubUrl, 3),
        'https://kkgithub.com/owner/repo/releases/download/v1/app.exe'
    );
    assert.equal(transformToMirrorUrl(githubUrl, 4), githubUrl);
});

test('transformToMirrorUrl 不转换非 GitHub 地址', () => {
    const giteeUrl = 'https://gitee.com/owner/repo/releases/download/v1/app.exe';
    assert.equal(transformToMirrorUrl(giteeUrl, 0), giteeUrl);
    assert.equal(transformToMirrorUrl('', 0), '');
    assert.equal(transformToMirrorUrl(null, 0), null);
});
