import DOMPurify from 'dompurify';

// 不可信 HTML（邮件正文、站点公告等）白名单消毒。
//
// 邮件渲染依赖 <style> 块与内联 style 属性，故保留二者；显式禁止脚本类标签、
// 全部 on* 事件属性、srcdoc，以及 javascript:/vbscript:/非图片 data: URL。
// （data:image/*;base64 保留：入站邮件常以内联 base64 图片承载图片，且 <img> 无法执行脚本。）
//
// 注意：DOMPurify 会丢弃 <style> 元素（3.4.x 实测，即使 ADD_TAGS 也不保留，且不记入 removed），
// 因此这里先把 <style>…</style> 块抽出来，只消毒其余内容，再原样放回（CSS 无法执行 JS）。

const FORBID_TAGS = [
  'script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base',
  'frame', 'frameset', 'applet', 'noscript', 'template',
];

// 允许：http/https/mailto/tel/blob/cid 协议、data:image/*;base64、相对地址
const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|mailto|tel|blob|cid):|data:image\/(?:png|jpe?g|gif|webp|bmp|avif|x-icon);base64,|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

const STYLE_BLOCK_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi;

let hookInstalled = false;

function installHook() {
  if (hookInstalled) return;
  hookInstalled = true;
  // 显式兜底：移除所有 on* 事件属性与 srcdoc（不依赖库默认行为）
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!node || typeof node.getAttributeNames !== 'function') return;
    for (const name of node.getAttributeNames()) {
      const lower = name.toLowerCase();
      if (lower.startsWith('on') || lower === 'srcdoc') {
        node.removeAttribute(name);
      }
    }
  });
}

export function sanitizeHtml(html) {
  if (!html) return '';
  installHook();
  const source = String(html);

  // 抽出 <style> 块，避免被 DOMPurify 丢弃；用随机占位符保持原有位置
  const styleBlocks = [];
  const token = 'sanitizestyleblk' + Math.random().toString(36).slice(2) + 'end';
  const withoutStyles = source.replace(STYLE_BLOCK_RE, (block) => {
    styleBlocks.push(block);
    return `%%${token}${styleBlocks.length - 1}%%`;
  });

  const clean = DOMPurify.sanitize(withoutStyles, {
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR: ['srcdoc', 'formaction', 'xlink:href'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP,
  });

  if (styleBlocks.length === 0) {
    return clean;
  }

  return clean.replace(
    new RegExp(`%%${token}(\\d+)%%`, 'g'),
    (m, index) => styleBlocks[Number(index)] ?? ''
  );
}

export default sanitizeHtml;
