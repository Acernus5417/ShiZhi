const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createBridge } = require('./bridge.cjs');
const ai = require('./ai.cjs');

let win = null;
let store = null;
let data = null;
let lib = null;
let bridge = null;

const EDITABLE = ['title', 'purpose', 'category', 'tags', 'pinned', 'icon'];

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object' || !raw.url) return null;
  return {
    id: String(raw.id || lib.createId()),
    url: raw.url,
    host: raw.host || raw.domain || '',
    domain: raw.domain || raw.host || '',
    display: raw.display || '',
    title: raw.title || '',
    purpose: raw.purpose || '',
    // 空分类表示"待分类"，要留给异步补抓去填；只有历史上的「未分类」才迁移成「其它」
    category: raw.category === '未分类' ? lib.OTHER : String(raw.category || ''),
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 4) : [],
    pinned: Boolean(raw.pinned),
    visits: Number(raw.visits) || 0,
    lastVisitedAt: Number(raw.lastVisitedAt) || 0,
    createdAt: Number(raw.createdAt) || Date.now(),
    categorySource: String(raw.categorySource || ''),
    icon: raw.icon && raw.icon.type === 'uri' ? { type: 'uri', value: raw.icon.value } : raw.icon || null
  };
}

function aiEnabled() {
  const cfg = data?.prefs?.ai;
  return Boolean(cfg?.enabled && cfg.baseUrl && cfg.apiKey && cfg.model);
}

function rememberCategory(item) {
  const domain = item?.domain || lib?.domainOf?.(item?.url) || '';
  if (!domain || !item.category) return;
  data.prefs.learned = { ...(data.prefs.learned || {}), [domain]: item.category };
}

function ensureCategory(name) {
  if (!name) return;
  if (!data.categories.includes(name)) data.categories.push(name);
}

async function persist() {
  data.items = data.items.map(normalizeItem).filter(Boolean);
  await store.save(data);
  return data;
}

function focusWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();

  // Windows 有前台锁定，单靠 focus() 不一定能抢到最前：短暂置顶提权再释放
  win.setAlwaysOnTop(true, 'screen-saver');
  win.show();
  win.moveTop();
  win.focus();
  if (typeof app.focus === 'function') app.focus({ steal: true });

  setTimeout(() => {
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);
  }, 500);
}

const enriching = new Set();

/** 快速收录是静默入库的，事后补抓标题与图标，让卡片原地升级 */
async function enrichItem(id) {
  if (enriching.has(id)) return;
  enriching.add(id);
  try {
    const { fetchMeta } = require('./favicon.cjs');
    const classify = await import('../core/classify.js');
    const item = data.items.find((i) => i.id === id);
    if (!item) return;

    const meta = (await fetchMeta(item.url)) || {};
    let changed = false;
    if (meta.icon && (!item.icon || item.icon.type !== 'uri')) {
      item.icon = { type: 'uri', value: meta.icon.value };
      changed = true;
    }
    if (meta.title && (!item.title || item.title === item.domain)) {
      item.title = meta.title;
      changed = true;
    }

    // ① 习惯词典 ② 域名直查 ③ 关键词规则
    const blank = !item.category;
    if (blank) {
      const guess = classify.suggestCategory(
        { url: item.url, title: item.title, description: meta.description, keywords: meta.keywords },
        { learned: data.prefs.learned || {} }
      );
      const picked = classify.resolveCategory(guess?.category, data.categories, lib.OTHER);
      item.category = picked;
      item.categorySource = guess?.category && picked === guess.category ? guess.source : 'fallback';
      changed = true;
    }

    // ④ 仍缺分类或缺用途，且开了 AI —— 一次请求同时补两样
    const stillBlank = !item.category;
    if ((stillBlank || !item.purpose) && aiEnabled()) {
      const result = await ai.suggest({
        url: item.url,
        title: item.title,
        description: meta.description,
        categories: data.categories,
        config: data.prefs.ai
      });
      if (result) {
        if (stillBlank) {
          const picked = classify.resolveCategory(result.category, data.categories, lib.OTHER);
          if (picked !== item.category) {
            item.category = picked;
            changed = true;
          }
          if (picked === result.category) item.categorySource = 'ai';
        }
        if (!item.purpose && result.purpose) {
          item.purpose = result.purpose;
          changed = true;
        }
      }
    }

    if (changed) {
      await persist();
      win?.webContents.send('shizhi:reload');
    }
  } catch {
    /* 抓不到就保持现状 */
  } finally {
    enriching.delete(id);
  }
}

async function handleIntake(raw) {
  const { parseIncoming } = await import('../core/intake.js');
  const classify = await import('../core/classify.js');
  const parsed = parseIncoming(raw);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const dup = data.items.find((i) => lib.sameUrl(i.url, parsed.url));
  if (dup) {
    if (parsed.mode === 'edit') {
      focusWindow();
      win?.webContents.send('shizhi:flash', dup.id);
    }
    return { ok: false, code: 'DUPLICATE', id: dup.id, title: dup.title };
  }

  if (parsed.mode === 'quick') {
    let item;
    try {
      item = lib.createItem({
        url: parsed.url,
        title: parsed.title,
        purpose: parsed.purpose,
        category: parsed.category || '',
        tags: parsed.tags
      });
    } catch (err) {
      return { ok: false, reason: 'invalid-url', message: err.message };
    }
    data.items.unshift(item);
    ensureCategory(item.category);
    await persist();
    // 界面必须重新取数并渲染，否则新卡片要等到下次操作才出现
    win?.webContents.send('shizhi:reload', {
      flashId: item.id,
      toast: `已快速收录「${item.title}」`
    });
    void enrichItem(item.id);
    return { ok: true, item: { id: item.id, title: item.title } };
  }

  // 先给一个本地就能算出来的建议，弹层打开时立刻预选
  const guess = classify.suggestCategory(
    { url: parsed.url, title: parsed.title },
    { learned: data.prefs.learned || {} }
  );

  focusWindow();
  win?.webContents.send('shizhi:intake', {
    url: parsed.url,
    title: parsed.title,
    purpose: parsed.purpose,
    category: guess?.category || '',
    categorySource: guess?.source || ''
  });

  // 开了 AI 就再问一次，补分类与用途（异步回填，不阻塞弹层）
  if (aiEnabled() && (!guess || !parsed.purpose)) {
    void (async () => {
      const result = await ai.suggest({
        url: parsed.url,
        title: parsed.title,
        description: '',
        categories: data.categories,
        config: data.prefs.ai
      });
      if (!result) return;
      win?.webContents.send('shizhi:suggest', {
        url: parsed.url,
        category: guess ? '' : result.category,
        purpose: parsed.purpose ? '' : result.purpose
      });
    })();
  }

  return { ok: true, pending: 'edit' };
}

function createWindow() {
  const { width = 1200, height = 800 } = data.prefs || {};
  win = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: data.prefs.theme === 'night' ? '#15130F' : '#F5F1E8',
    title: '拾址',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', () => {
    if (win.isMaximized()) return;
    const [w, h] = win.getSize();
    Object.assign(data.prefs, { width: w, height: h });
    store.save(data).catch(() => {});
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function registerIpc() {
  ipcMain.handle('lib:load', () => data);

  ipcMain.handle('item:add', async (_e, payload) => {
    const item = lib.createItem(payload);
    const dup = data.items.find((i) => lib.sameUrl(i.url, item.url));
    if (dup) {
      const err = new Error('这条网址已经在册了');
      err.code = 'DUPLICATE';
      err.id = dup.id;
      throw err;
    }
    data.items.unshift(item);
    ensureCategory(item.category);
    rememberCategory(item);
    return persist();
  });

  ipcMain.handle('item:update', async (_e, id, patch) => {
    const index = data.items.findIndex((i) => i.id === id);
    if (index < 0) return data;
    const next = { ...data.items[index] };
    for (const key of EDITABLE) if (key in patch) next[key] = patch[key];
    if (typeof next.purpose === 'string') {
      next.purpose = next.purpose.replace(/\s+/g, ' ').trim().slice(0, lib.PURPOSE_MAX);
    }
    if (patch.url && patch.url !== next.url) {
      const rebuilt = lib.createItem({ ...next, url: patch.url }, { id: next.id, now: next.createdAt });
      Object.assign(next, rebuilt, {
        visits: data.items[index].visits,
        lastVisitedAt: data.items[index].lastVisitedAt,
        pinned: next.pinned
      });
    }
    next.category = String(next.category || '').trim() || lib.OTHER;
    data.items[index] = next;
    ensureCategory(next.category);
    rememberCategory(next);
    return persist();
  });

  ipcMain.handle('item:remove', async (_e, id) => {
    const index = data.items.findIndex((i) => i.id === id);
    if (index < 0) return null;
    const [removed] = data.items.splice(index, 1);
    await persist();
    return removed;
  });

  ipcMain.handle('item:restore', async (_e, item) => {
    if (item && !data.items.some((i) => i.id === item.id)) data.items.unshift(normalizeItem(item));
    return persist();
  });

  ipcMain.handle('item:open', async (_e, id) => {
    const item = data.items.find((i) => i.id === id);
    if (!item) return data;
    item.visits += 1;
    item.lastVisitedAt = Date.now();
    shell.openExternal(item.url);
    return persist();
  });

  ipcMain.handle('item:pin', async (_e, id) => {
    const item = data.items.find((i) => i.id === id);
    if (item) item.pinned = !item.pinned;
    return persist();
  });

  ipcMain.handle('meta:fetch', async (_e, url) => {
    const { fetchMeta } = require('./favicon.cjs');
    return fetchMeta(url);
  });

  ipcMain.handle('io:importBookmarks', async () => {
    const picked = await dialog.showOpenDialog(win, {
      title: '选择浏览器书签文件',
      filters: [{ name: '书签 HTML', extensions: ['html', 'htm'] }],
      properties: ['openFile']
    });
    if (picked.canceled || !picked.filePaths[0]) return { added: 0, duplicates: 0, canceled: true };

    const html = await fs.readFile(picked.filePaths[0], 'utf8');
    const parsed = await import('../core/bookmarks.js');
    const { items } = parsed.parseBookmarks(html);
    const mapped = items.map((entry) => {
      const segments = entry.folder.split(' / ').filter(Boolean);
      return {
        url: entry.url,
        title: entry.title,
        purpose: '',
        category: segments[0] || lib.OTHER,
        tags: segments.slice(1, 3),
        icon: entry.icon && /^data:image\//i.test(entry.icon) ? { type: 'uri', value: entry.icon } : null
      };
    });
    const { added, duplicates } = lib.mergeItems(data.items, mapped);
    for (const item of added) ensureCategory(item.category);
    data.items = [...added, ...data.items];
    await persist();
    return { added: added.length, duplicates: duplicates.length };
  });

  ipcMain.handle('io:exportJson', async () => {
    const picked = await dialog.showSaveDialog(win, {
      title: '导出备份',
      defaultPath: `拾址备份-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (picked.canceled || !picked.filePath) return { canceled: true };
    await fs.writeFile(picked.filePath, JSON.stringify(data, null, 2), 'utf8');
    return { path: picked.filePath };
  });

  ipcMain.handle('prefs:set', async (_e, patch) => {
    Object.assign(data.prefs, patch);
    return persist();
  });

  ipcMain.handle('app:openDataDir', () => shell.openPath(app.getPath('userData')));

  ipcMain.handle('bridge:status', () => ({
    enabled: data.prefs.bridge !== false,
    running: Boolean(bridge && bridge.running),
    port: bridge ? bridge.port : 17820,
    error: bridge ? bridge.error : '',
    login: Boolean(data.prefs.login)
  }));

  ipcMain.handle('bridge:set', async (_e, enabled) => {
    data.prefs.bridge = Boolean(enabled);
    await persist();
    return data.prefs.bridge;
  });

  ipcMain.handle('bridge:openDir', () => shell.openPath(path.join(__dirname, '..', 'extension')));

  ipcMain.handle('ai:test', async () => {
    if (!aiEnabled()) return { ok: false, reason: 'incomplete' };
    const sample = await ai.suggest({
      url: 'https://developer.mozilla.org/zh-CN/',
      title: 'MDN Web Docs',
      description: 'Web 技术文档',
      categories: data.categories,
      config: data.prefs.ai
    });
    return sample ? { ok: true, sample } : { ok: false, reason: 'request-failed' };
  });

  ipcMain.handle('ai:clearLearned', async () => {
    data.prefs.learned = {};
    await persist();
    return { ok: true };
  });

  ipcMain.handle('cat:add', async (_e, name) => {
    const value = String(name || '').trim().slice(0, 10);
    if (value) ensureCategory(value);
    await persist();
    return data;
  });

  ipcMain.handle('cat:remove', async (_e, name) => {
    const value = String(name || '').trim();
    if (!value || value === lib.OTHER) return data;
    data.categories = data.categories.filter((c) => c !== value);
    for (const item of data.items) {
      if (item.category === value) item.category = lib.OTHER;
    }
    await persist();
    return data;
  });

  ipcMain.handle('learned:remove', async (_e, domain) => {
    if (data.prefs.learned && domain) delete data.prefs.learned[String(domain)];
    await persist();
    return { ok: true };
  });

  ipcMain.handle('app:login', async (_e, on) => {
    const value = Boolean(on);
    app.setLoginItemSettings({
      openAtLogin: value,
      path: process.execPath,
      args: [path.join(__dirname, '..')]
    });
    data.prefs.login = value;
    await persist();
    return app.getLoginItemSettings().openAtLogin;
  });

  const bgFile = () => path.join(app.getPath('userData'), 'background.jpg');

  ipcMain.handle('bg:pick', async () => {
    const picked = await dialog.showOpenDialog(win, {
      title: '选择背景图片',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
      properties: ['openFile']
    });
    if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
    const ext = path.extname(picked.filePaths[0]).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const buf = await fs.readFile(picked.filePaths[0]);
    return { dataUri: `data:${mime};base64,${buf.toString('base64')}` };
  });

  ipcMain.handle('bg:set', async (_e, dataUri) => {
    const base64 = String(dataUri || '').split(',')[1] || '';
    if (!base64) return { ok: false };
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(bgFile(), Buffer.from(base64, 'base64'));
    return { ok: true };
  });

  ipcMain.handle('bg:load', async () => {
    try {
      const buf = await fs.readFile(bgFile());
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle('bg:clear', async () => {
    await fs.rm(bgFile(), { force: true });
    return { ok: true };
  });

  ipcMain.handle('theme:bg', async (_e, key) => {
    if (!/^[a-z]+$/.test(String(key || ''))) return null;
    const file = path.join(__dirname, '..', 'renderer', 'assets', 'themes', `${key}.jpg`);
    try {
      const buf = await fs.readFile(file);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle('win:min', () => win && win.minimize());
  ipcMain.handle('win:max', () => {
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('win:close', () => win && win.close());
}

async function boot() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on('second-instance', () => focusWindow());

  await app.whenReady();
  lib = await import('../core/library.js');
  const { createStore } = await import('./store.js');
  store = createStore(app.getPath('userData'));
  data = await store.load();
  data.items = data.items.map(normalizeItem).filter(Boolean);
  data.categories = (data.categories || []).filter((c) => c && c !== '未分类');
  if (!data.categories.includes(lib.OTHER)) data.categories.push(lib.OTHER);
  for (const item of data.items) {
    // 上次退出时还没来得及补分类的条目，启动时统一归到「其它」
    if (!item.category) item.category = lib.OTHER;
    ensureCategory(item.category);
  }

  bridge = createBridge({
    port: 17820,
    onIntake: handleIntake,
    isEnabled: () => data.prefs.bridge !== false
  });
  await bridge.start();

  registerIpc();
  createWindow();

  app.on('before-quit', () => bridge && bridge.stop());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

boot().catch((err) => {
  console.error('[shizhi] 启动失败：', err);
  app.quit();
});
