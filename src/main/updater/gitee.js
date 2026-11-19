const { GITEE_OWNER, GITEE_REPO } = require('./config');
const { httpGet } = require('./http');

// 动态获取最新版本的 latest.yml
// 由于 Gitee 没有 latest 标签，我们需要先获取最新版本号
async function getLatestVersionFromGitee() {
    try {
        const url = `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/releases/latest`;
        const data = await httpGet(url);
        
        try {
            const release = JSON.parse(data);
            // 返回完整的 release 信息，包括 tag_name 和 body (release notes)
            return {
                tag_name: release.tag_name,
                body: release.body || '',
                published_at: release.published_at || release.created_at
            };
        } catch (e) {
            throw new Error(`解析 JSON 失败: ${e.message}`);
        }
    } catch (e) {
        console.error('获取 Gitee 最新版本失败:', e);
        return null;
    }
}

module.exports = { getLatestVersionFromGitee };
