const BASE = 'http://127.0.0.1:17820';

const MENUS = [
  { id: 'shizhi-edit', title: '手动收录', contexts: ['page'] },
  { id: 'shizhi-quick', title: '快速收录', contexts: ['page'] },
  { id: 'shizhi-edit-link', title: '手动收录此链接', contexts: ['link'] },
  { id: 'shizhi-quick-link', title: '快速收录此链接', contexts: ['link'] }
];

function buildMenus() {
  for (const menu of MENUS) chrome.contextMenus.create(menu);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(buildMenus);
});
chrome.runtime.onStartup.addListener(() => {
  chrome.contextMenus.removeAll(buildMenus);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const isLink = Boolean(info.linkUrl);
  const mode = info.menuItemId.includes('quick') ? 'quick' : 'edit';
  const url = isLink ? info.linkUrl : info.pageUrl;
  if (!url) return;

  const title = isLink ? String(info.linkText || '').trim() : await readPageTitle(tab && tab.id);
  await submit({ url, title, mode });
});

async function readPageTitle(tabId) {
  if (typeof tabId !== 'number') return '';
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.title || ''
    });
    return String((result && result.result) || '');
  } catch {
    return '';
  }
}

async function submit(payload) {
  try {
    const response = await fetch(`${BASE}/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));

    if (data.ok) return;
    if (data.code === 'DUPLICATE') return notify('这条网址已经在拾址里了');
    if (data.reason === 'disabled') return notify('拾址的浏览器联动已关闭');
    return notify('没能收录：' + (data.reason || response.status));
  } catch {
    notify('连不上拾址，请先启动它');
  }
}

function notify(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: '拾址',
    message
  });
}
