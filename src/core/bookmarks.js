const TOKEN = /<a\b([^>]*)>([\s\S]*?)<\/a>|<h3\b([^>]*)>([\s\S]*?)<\/h3>|<\/dl\s*>/gi;
const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'"
};

export function decodeEntities(text) {
  return String(text || '')
    .replace(/&#(\d+);?/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/<[^>]*>/g, '')
    .trim();
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) || attrs.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'));
  return m ? m[1] : '';
}

export function parseBookmarks(html) {
  const items = [];
  const folders = [];
  if (typeof html !== 'string' || !html) return { items, folders };

  const stack = [];
  let match;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(html)) !== null) {
    const [full, aAttrs, aText, hAttrs, hText] = match;
    if (/^<\/dl/i.test(full)) {
      stack.pop();
      continue;
    }
    if (hAttrs !== undefined) {
      const name = decodeEntities(hText);
      stack.push(name);
      if (name && !folders.includes(name)) folders.push(name);
      continue;
    }
    if (aAttrs !== undefined) {
      const raw = attr(aAttrs, 'href');
      if (!raw || /^(javascript|place|chrome|about|data):/i.test(raw)) continue;
      const icon = attr(aAttrs, 'icon');
      items.push({
        url: raw,
        title: decodeEntities(aText) || raw,
        folder: stack.filter(Boolean).join(' / '),
        addDate: Number(attr(aAttrs, 'add_date')) || 0,
        icon: /^data:image\//i.test(icon) ? icon : ''
      });
    }
  }
  return { items, folders };
}
