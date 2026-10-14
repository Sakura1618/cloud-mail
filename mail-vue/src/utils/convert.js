import {useSettingStore} from "@/store/setting.js";
export function cvtR2Url(key) {

    if (!key) {
        return + 'https://' + ''
    }

    if (key.startsWith('https://')) {
        return key
    }

    const { settings } = useSettingStore();

    let domain = settings.r2Domain

    if (!domain) {
        return key;
    }

    if (!domain.startsWith('http')) {
        return 'https://' + domain + '/' + key
    }

    if (domain.endsWith("/")) {
        domain = domain.slice(0, -1);
    }
    return domain + '/' + key
}

export function toOssDomain(domain) {

    if (!domain) {
        return ''
    }

    if (!domain.startsWith('http')) {
        return 'https://' + domain
    }

    if (domain.endsWith("/")) {
        domain = domain.slice(0, -1);
    }

    return domain
}

// 提取正文中站内附件的 key（形如 {{domain}}attachments/<key> 或 /attachments/<key>?e=&s=）
const ATT_KEY_RE = /attachments\/[A-Za-z0-9._-]+/g;

export function extractAttKeys(content) {
    const keys = new Set();
    if (!content) {
        return [];
    }
    ATT_KEY_RE.lastIndex = 0;
    let m;
    while ((m = ATT_KEY_RE.exec(content)) !== null) {
        keys.add(m[0]);
    }
    return [...keys];
}

// 将正文中的 {{domain}}<key> 替换为已签名的直读 URL；无签名时回退到原逻辑（外部 OSS 域名）
export function formatDomainContent(content, urls = {}) {
    content = content || '';
    const base = toOssDomain(useSettingStore().settings.r2Domain) + '/';
    return content
        .replace(/\{\{domain\}\}([^\s"'<>()\\]+)/g, (m, key) => urls[key] || (base + key))
        .replace(/\{\{domain\}\}/g, base);
}
