import { filterItems, sortItems, collectCategories, OTHER } from '../../core/library.js';
import { renderCard } from './cards.js';

const api = window.shizhi;
const $ = (id) => document.getElementById(id);

const SORTS = [
  ['recent', '最近访问'],
  ['added', '最近添加'],
  ['visits', '访问最多'],
  ['name', '按名称']
];

const state = { data: null, query: '', category: '全部', sort: 'recent' };
let editingId = null;
let pickedIcon = null;
let pickedCategory = '';
let toastTimer = null;

/* ── 启动 ─────────────────────────────────────────── */

async function boot() {
  if (!api) {
    $('stat').textContent = '未连接到主进程';
    return;
  }
  state.data = await api.load();
  state.sort = state.data.prefs?.sort || 'recent';
  applyTheme();
  bind();
  renderThemeChips();
  await applyBackground();
  render();
}

/* ── 渲染 ─────────────────────────────────────────── */

function currentItems() {
  const matched = filterItems(state.data.items, { query: state.query });
  return state.category === '全部'
    ? matched
    : matched.filter((i) => i.category === state.category);
}

function render() {
  const items = sortItems(currentItems(), state.sort);
  const grid = $('grid');
  const now = Date.now();

  grid.replaceChildren();
  if (items.length) {
    $('empty').hidden = true;
    items.forEach((item, i) => grid.append(renderCard(item, i, now)));
  } else {
    renderEmpty();
  }

  renderFilterPop();
  renderStats(now, items.length);
  $('btnFilter').classList.toggle('is-on', state.category !== '全部');
  $('searchClear').hidden = !state.query;
}

function renderEmpty() {
  const empty = $('empty');
  const hasItems = state.data.items.length > 0;
  empty.hidden = false;
  empty.replaceChildren();

  const h = document.createElement('h3');
  const p = document.createElement('p');
  if (!hasItems) {
    h.textContent = '这一页还空着';
    p.textContent = '把常去的网站收进来，写清用途。以后只在这里找，不必再翻浏览器的收藏夹。';
  } else if (state.query) {
    h.textContent = '没有匹配的收录';
    p.textContent = `「${state.query}」没有命中任何名称、网址、用途或标签。换个说法试试。`;
  } else {
    h.textContent = '这个分类还是空的';
    p.textContent = '换个分类看看，或者新增一条收录。';
  }
  const btn = document.createElement('button');
  btn.className = 'btn btn--ink';
  btn.textContent = hasItems && !state.query ? '看全部' : '＋ 新增网址';
  btn.addEventListener('click', () => {
    if (hasItems && !state.query) {
      state.category = '全部';
      render();
    } else {
      openSheet(null);
    }
  });
  empty.append(h, p, btn);
}

function renderFilterPop() {
  const matched = filterItems(state.data.items, { query: state.query });

  const cats = $('popCats');
  cats.replaceChildren();
  for (const name of ['全部', ...collectCategories(matched)]) {
    const count = name === '全部' ? matched.length : matched.filter((i) => i.category === name).length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = name === state.category ? 'pop__item is-on' : 'pop__item';
    const label = document.createElement('span');
    label.textContent = name;
    const num = document.createElement('em');
    num.textContent = String(count);
    btn.append(label, num);
    btn.addEventListener('click', () => {
      state.category = name;
      closePops();
      render();
    });
    cats.append(btn);
  }

  const sorts = $('popSorts');
  sorts.replaceChildren();
  for (const [key, label] of SORTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = key === state.sort ? 'pop__item is-on' : 'pop__item';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      state.sort = key;
      api.setPrefs({ sort: key });
      closePops();
      render();
    });
    sorts.append(btn);
  }
}

function renderStats(now, shown) {
  const items = state.data.items;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = items.filter((i) => i.lastVisitedAt >= start.getTime()).length;
  const pinned = items.filter((i) => i.pinned).length;
  const d = new Date(now);
  const base = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  $('stat').textContent = state.query
    ? `${base} · 检索「${state.query}」命中 ${shown} 条`
    : `${base} · 收录 ${items.length} 条 · 常用 ${pinned} · 今日已开 ${today} 次`;
}

function applyTheme() {
  document.documentElement.dataset.theme = currentTheme().key;
  $('btnTheme').title = document.documentElement.dataset.theme === 'night' ? '纸' : '夜读';
}

/* ── 浮层开合 ─────────────────────────────────────── */

function closePops(except) {
  for (const id of ['filterPop', 'menuPop']) {
    if (id === except) continue;
    $(id).hidden = true;
  }
  $('btnFilter').classList.remove('is-on-active');
  $('btnMenu').classList.remove('is-on-active');
}

function togglePop(id, btn) {
  const pop = $(id);
  const willOpen = pop.hidden;
  closePops(id);
  pop.hidden = !willOpen;
  btn.classList.toggle('is-on-active', willOpen);
}

function toggleSearch(open) {
  const box = $('searchBox');
  const next = open ?? !box.classList.contains('is-open');
  box.classList.toggle('is-open', next);
  $('stat').hidden = next;
  $('btnSearch').classList.toggle('is-on', next);
  if (next) $('search').focus();
  else {
    $('search').value = '';
    state.query = '';
    render();
  }
}

/* ── 提示条 ───────────────────────────────────────── */

function toast(message, action) {
  const box = $('toast');
  $('toastMsg').textContent = message;
  const btn = $('toastAction');
  btn.hidden = !action;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => {
      hideToast();
      action.run();
    };
  }
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 2400);
}

function hideToast() {
  $('toast').hidden = true;
}

function flashCard(id) {
  const card = $('grid').querySelector(`.card[data-id="${id}"]`);
  if (!card) return;
  card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  card.classList.add('is-flash');
  setTimeout(() => card.classList.remove('is-flash'), 2400);
}

/* ── 卡片操作 ─────────────────────────────────────── */

async function openItem(id) {
  state.data = await api.open(id);
  render();
}

async function removeItem(id) {
  const item = state.data.items.find((i) => i.id === id);
  if (!item) return;
  const removed = await api.remove(id);
  state.data = await api.load();
  render();
  toast(`已移除「${removed?.title || item.title}」`, {
    label: '撤销',
    run: async () => {
      if (removed) await api.restore(removed);
      state.data = await api.load();
      render();
    }
  });
}

/* ── 录入弹层 ─────────────────────────────────────── */

function parseTags(value) {
  return [...new Set(String(value || '').split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean))].slice(0, 4);
}

function openSheet(item) {
  editingId = item ? item.id : null;
  pickedIcon = item?.icon?.type === 'uri' ? item.icon : null;
  $('sheetTitle').textContent = item ? '编辑收录' : '新增收录';
  $('sheetSave').textContent = item ? '保存' : '收录';
  $('fUrl').value = item?.url || '';
  $('fTitle').value = item?.title || '';
  $('fPurpose').value = item?.purpose || '';
  $('fTags').value = (item?.tags || []).join('，');
  $('fCatNew').value = '';
  $('sheetError').textContent = '';
  $('urlHint').textContent = '';
  pickedCategory = item?.category || '';
  showCatFlag('');
  syncIconPreview(item?.icon);
  renderChips();
  $('sheet').hidden = false;
  (item ? $('fPurpose') : $('fUrl')).focus();
}

function closeSheet() {
  $('sheet').hidden = true;
  editingId = null;
  pickedIcon = null;
  pickedCategory = '';
  showCatFlag('');
}

function renderChips() {
  const box = $('fCats');
  const names = [...new Set([...(state.data.categories || []), pickedCategory].filter((c) => c && c !== '未分类'))];
  box.replaceChildren();
  for (const name of names) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = name === pickedCategory ? 'chip is-on' : 'chip';
    chip.textContent = name;
    chip.addEventListener('click', () => {
      pickedCategory = name;
      $('fCatNew').value = '';
      renderChips();
    });
    box.append(chip);
  }
}

function syncIconPreview(icon) {
  const img = $('fIcon');
  if (icon && icon.type === 'uri') {
    img.src = icon.value;
    img.hidden = false;
  } else {
    img.hidden = true;
    img.removeAttribute('src');
  }
}

async function autoFetchMeta() {
  const value = $('fUrl').value.trim();
  if (!value) return;
  const hadTitle = Boolean($('fTitle').value.trim());
  $('urlHint').textContent = '正在抓取名称与图标…';
  try {
    const meta = await api.fetchMeta(value);
    if (meta.title && !hadTitle) $('fTitle').value = meta.title;
    if (meta.icon) {
      pickedIcon = meta.icon;
      syncIconPreview(meta.icon);
    }
    $('urlHint').textContent = meta.icon
      ? meta.title
        ? '已抓到名称与图标，可以再改改'
        : '已抓到图标'
      : '没抓到信息，将用字母标记代替';
  } catch {
    $('urlHint').textContent = '抓取失败，可以手动填写';
  }
}

/* ── 主题与背景 ───────────────────────────────────── */

const THEMES = [
  { key: 'paper', name: '纸', bg: null, blur: 14, dim: 38, colors: ['#f5f1e8', '#b4342a', '#1a1713'] },
  { key: 'night', name: '夜读', bg: null, blur: 14, dim: 38, colors: ['#15130f', '#e0603f', '#ede7da'] },
  { key: 'dusk', name: '暮色', bg: 'dusk', blur: 12, dim: 40, colors: ['#fbf3e7', '#c0522a', '#2a1d14'] },
  { key: 'pine', name: '松墨', bg: 'pine', blur: 14, dim: 52, colors: ['#1f2c26', '#6fb394', '#e3ede6'] },
  { key: 'flight', name: '夜航', bg: 'flight', blur: 16, dim: 56, colors: ['#1c2437', '#e5b25c', '#e6eaf6'] }
];

const PLAIN = { blur: 14, dim: 38 };
let bgUri = null;
const themeUri = {};

function currentTheme() {
  const key = state.data?.prefs?.theme;
  return THEMES.find((t) => t.key === key) || THEMES[0];
}

function bgPrefs() {
  return { on: false, blur: PLAIN.blur, dim: PLAIN.dim, ...(state.data?.prefs?.background || {}) };
}

function tuningFor(key) {
  const theme = THEMES.find((t) => t.key === key);
  const base = theme ? { blur: theme.blur, dim: theme.dim } : { ...PLAIN };
  return { ...base, ...(state.data?.prefs?.tuning?.[key] || {}) };
}

function sourceKey() {
  return bgPrefs().on ? 'custom' : currentTheme().key;
}

async function setPrefs(patch) {
  Object.assign(state.data.prefs, patch);
  await api.setPrefs(patch);
}

async function setTheme(key) {
  await setPrefs({ theme: key });
  applyTheme();
  await applyBackground();
}

async function saveBackground(patch) {
  await setPrefs({ background: { ...bgPrefs(), ...patch } });
  await applyBackground();
}

async function saveTuning(patch) {
  const key = sourceKey();
  await setPrefs({ tuning: { ...(state.data.prefs.tuning || {}), [key]: { ...tuningFor(key), ...patch } } });
}

async function applyBackground() {
  const theme = currentTheme();
  const custom = bgPrefs().on;
  const backdrop = $('backdrop');

  document.body.classList.remove('has-bg');
  backdrop.hidden = true;

  if (custom || theme.bg) {
    let uri = null;
    if (custom) {
      uri = bgUri || (bgUri = await api.bgLoad());
      if (!uri) await setPrefs({ background: { ...bgPrefs(), on: false } });
    } else {
      uri = themeUri[theme.key] || (themeUri[theme.key] = await api.themeBg(theme.bg));
    }
    if (uri) {
      const tune = tuningFor(custom ? 'custom' : theme.key);
      $('backdropImg').style.backgroundImage = `url("${uri}")`;
      backdrop.style.setProperty('--blur', `${tune.blur}px`);
      backdrop.style.setProperty('--dim', String(tune.dim / 100));
      backdrop.hidden = false;
      document.body.classList.add('has-bg');
    }
  }

  updateBgUi();
  updateThemeUi();
}

function updateBgUi() {
  const bg = bgPrefs();
  const tune = tuningFor(sourceKey());
  $('bgBlur').value = tune.blur;
  $('bgBlurVal').textContent = tune.blur;
  $('bgDim').value = tune.dim;
  $('bgDimVal').textContent = tune.dim;
  $('bgState').textContent = bg.on ? '自定义已启用' : currentTheme().bg ? '使用主题自带' : '未设置';

  const preview = $('bgPreview');
  const uri = bg.on ? bgUri : themeUri[currentTheme().key];
  if (!$('backdrop').hidden && uri) {
    preview.style.backgroundImage = `url("${uri}")`;
    preview.replaceChildren();
  } else {
    preview.style.backgroundImage = '';
    const span = document.createElement('span');
    span.textContent = '无';
    preview.replaceChildren(span);
  }
}

function updateThemeUi() {
  const theme = currentTheme();
  $('themeState').textContent = theme.name;
  for (const chip of $('themeRow').children) {
    chip.classList.toggle('is-on', chip.dataset.key === theme.key);
  }
}

function renderThemeChips() {
  const row = $('themeRow');
  row.replaceChildren();
  for (const theme of THEMES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'theme-chip';
    chip.dataset.key = theme.key;

    const swatch = document.createElement('span');
    swatch.className = 'theme-chip__swatch';
    for (const color of theme.colors) {
      const bar = document.createElement('i');
      bar.style.background = color;
      swatch.append(bar);
    }

    const name = document.createElement('span');
    name.className = 'theme-chip__name';
    name.textContent = theme.name;

    chip.append(swatch, name);
    chip.addEventListener('click', () => setTheme(theme.key));
    row.append(chip);
  }
  updateThemeUi();
}

function showCatFlag(source) {
  const flag = $('catFlag');
  if (!source || source === 'fallback') {
    flag.hidden = true;
    return;
  }
  flag.hidden = false;
  flag.textContent = { learned: '按你的习惯', seed: '自动建议', rule: '自动建议', ai: 'AI 建议' }[source] || '自动建议';
}

function openSettings() {
  renderThemeChips();
  updateBgUi();
  updateBridgeUi();
  updateDictUi();
  updateCatsUi();
  updateAiUi();
  backSetHome();
  $('setSheet').hidden = false;
}

const PAGE_BACK = { cats: '设置', catNew: '分类管理', bg: '自定义' };
let currentPage = '';

function showSetPage(key) {
  // 先把当前页面放回容器，否则切换时会被 replaceChildren 丢弃
  const current = $('setPageBody').firstElementChild;
  if (current) $('setSections').append(current);

  const section = $('setSections').querySelector(`[data-page="${key}"]`);
  if (!section) return;
  $('setPageTitle').textContent = section.dataset.title || '';
  $('setPageBody').replaceChildren(section);
  $('setBack').textContent = `‹ ${PAGE_BACK[key] || '设置'}`;
  $('setNav').hidden = true;
  $('setPage').hidden = false;
  currentPage = key;
}

function openSetPage(key) {
  showSetPage(key);
}

function backSetHome() {
  if (currentPage === 'catNew') {
    showSetPage('cats');
    return;
  }
  const section = $('setPageBody').firstElementChild;
  if (section) $('setSections').append(section);
  $('setPage').hidden = true;
  $('setNav').hidden = false;
  currentPage = '';
}

/* ── 二次确认 ─────────────────────────────────────── */

let confirmResolve = null;

function askConfirm({ title, message = '', confirmText = '确定' }) {
  $('confirmTitle').textContent = title;
  $('confirmMsg').textContent = message;
  $('confirmYes').textContent = confirmText;
  $('confirmSheet').hidden = false;
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function closeConfirm(value) {
  $('confirmSheet').hidden = true;
  if (confirmResolve) {
    confirmResolve(value);
    confirmResolve = null;
  }
}

function updateDictUi() {
  const learned = state.data?.prefs?.learned || {};
  const entries = Object.entries(learned).sort((a, b) => a[0].localeCompare(b[0]));
  $('navNoteDict').textContent = entries.length ? `${entries.length} 条` : '空';

  const list = $('dictList');
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'dict__empty';
    empty.textContent = '还没有记下任何域名';
    list.append(empty);
    return;
  }

  for (const [domain, category] of entries) {
    const row = document.createElement('div');
    row.className = 'dict__row';

    const name = document.createElement('span');
    name.className = 'dict__domain';
    name.textContent = domain;

    const cat = document.createElement('span');
    cat.className = 'dict__cat';
    cat.textContent = category;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'dict__del';
    del.textContent = '×';
    del.title = '移除';
    del.addEventListener('click', async () => {
      await api.removeLearned(domain);
      const next = { ...(state.data.prefs.learned || {}) };
      delete next[domain];
      state.data.prefs.learned = next;
      updateDictUi();
    });

    row.append(name, cat, del);
    list.append(row);
  }
}

function updateCatsUi() {
  const categories = state.data?.categories || [];
  const items = state.data?.items || [];
  $('navNoteCats').textContent = `${categories.length} 个`;

  const list = $('catsList');
  list.replaceChildren();
  for (const name of categories) {
    const used = items.filter((i) => i.category === name).length;
    const row = document.createElement('div');
    row.className = 'dict__row';

    const label = document.createElement('span');
    label.className = 'dict__domain';
    label.textContent = name;

    const count = document.createElement('span');
    count.className = 'dict__cat';
    count.textContent = String(used);

    row.append(label, count);

    if (name !== OTHER) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'dict__del';
      del.innerHTML =
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.6h10M6.5 4.6V3h3v1.6M4.6 4.6l.7 8.4h5.4l.7-8.4"/></svg>';
      del.title = '删除分类';
      del.addEventListener('click', () => removeCategory(name, used));
      row.append(del);
    }

    list.append(row);
  }
}

function openCatNew() {
  $('catNew2').value = '';
  showSetPage('catNew');
  setTimeout(() => $('catNew2').focus(), 60);
}

async function addCategory() {
  const input = $('catNew2');
  const name = input.value.trim();
  if (!name) return;
  if ((state.data.categories || []).includes(name)) {
    toast('这个分类已经有了');
    return;
  }
  await api.addCategory(name);
  state.data = await api.load();
  input.value = '';
  showSetPage('cats');
  updateCatsUi();
  render();
  toast(`已添加「${name}」`);
}

async function removeCategory(name, used = 0) {
  const ok = await askConfirm({
    title: `删除分类「${name}」？`,
    message: used
      ? `其中 ${used} 条卡片会归入「其它」，卡片本身不会删除。`
      : '还没有卡片使用这个分类。',
    confirmText: '删除'
  });
  if (!ok) return;
  await api.removeCategory(name);
  state.data = await api.load();
  if (state.category === name) state.category = '全部';
  render();
  updateCatsUi();
  toast(used ? `已删除「${name}」，${used} 条归入其它` : `已删除「${name}」`);
}

function updateAiUi() {
  const cfg = state.data?.prefs?.ai || {};
  const ready = Boolean(cfg.baseUrl && cfg.apiKey && cfg.model);
  $('navNoteAi').textContent = !cfg.enabled ? '未开启' : ready ? '已开启' : '待补全';
  $('aiOn').checked = Boolean(cfg.enabled);
  if ($('aiBase').value !== (cfg.baseUrl || '')) $('aiBase').value = cfg.baseUrl || '';
  if ($('aiKey').value !== (cfg.apiKey || '')) $('aiKey').value = cfg.apiKey || '';
  if ($('aiModel').value !== (cfg.model || '')) $('aiModel').value = cfg.model || '';
}

async function saveAi(patch) {
  const next = { ...(state.data.prefs.ai || {}), ...patch };
  state.data.prefs.ai = next;
  await api.setPrefs({ ai: next });
  updateAiUi();
}

async function updateBridgeUi() {
  const status = await api.bridgeStatus();
  $('bridgeOn').checked = status.enabled;
  $('loginOn').checked = status.login;
  $('bridgeState').textContent = !status.enabled
    ? '已关闭'
    : status.running
      ? `已启动 · 端口 ${status.port}`
      : status.error === 'port-in-use'
        ? '端口被占用'
        : '未启动';
}

/* ── 背景裁剪 ─────────────────────────────────────── */

const crop = { nat: { w: 0, h: 0 }, min: 1, scale: 1, dx: 0, dy: 0, dragging: false };

function openCropper(dataUri) {
  $('cropErr').textContent = '';
  $('cropper').hidden = false;
  $('cropStage').style.aspectRatio = `${window.innerWidth} / ${window.innerHeight}`;
  const img = $('cropImg');
  img.onload = () => {
    crop.nat = { w: img.naturalWidth, h: img.naturalHeight };
    const stage = $('cropStage');
    crop.min = Math.max(stage.clientWidth / crop.nat.w, stage.clientHeight / crop.nat.h);
    crop.scale = crop.min;
    crop.dx = 0;
    crop.dy = 0;
    $('cropZoom').value = 100;
    $('cropZoomVal').textContent = '100%';
    img.style.width = `${crop.nat.w}px`;
    applyCrop();
  };
  img.src = dataUri;
}

function clampCrop() {
  const stage = $('cropStage');
  const maxX = Math.max(0, (crop.nat.w * crop.scale - stage.clientWidth) / 2);
  const maxY = Math.max(0, (crop.nat.h * crop.scale - stage.clientHeight) / 2);
  crop.dx = Math.min(maxX, Math.max(-maxX, crop.dx));
  crop.dy = Math.min(maxY, Math.max(-maxY, crop.dy));
}

function applyCrop() {
  $('cropImg').style.transform =
    `translate(-50%, -50%) translate(${crop.dx}px, ${crop.dy}px) scale(${crop.scale})`;
}

async function confirmCrop() {
  try {
    const stage = $('cropStage');
    const { clientWidth: sw, clientHeight: sh } = stage;
    const s = crop.scale;
    const left = sw / 2 + crop.dx - (crop.nat.w * s) / 2;
    const top = sh / 2 + crop.dy - (crop.nat.h * s) / 2;
    const outW = Math.min(1920, Math.round(window.innerWidth * 2));
    const outH = Math.round((outW * sh) / sw);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext('2d').drawImage($('cropImg'), -left / s, -top / s, sw / s, sh / s, 0, 0, outW, outH);

    const uri = canvas.toDataURL('image/jpeg', 0.92);
    await api.bgSet(uri);
    bgUri = uri;
    $('cropper').hidden = true;
    await saveBackground({ on: true });
    toast('背景已更新');
  } catch {
    $('cropErr').textContent = '这张图处理失败，换一张试试';
  }
}

/* ── 事件绑定 ─────────────────────────────────────── */

function bind() {
  $('winMin').addEventListener('click', () => api.winMin());
  $('winMax').addEventListener('click', () => api.winMax());
  $('winClose').addEventListener('click', () => api.winClose());

  $('btnSearch').addEventListener('click', () => toggleSearch());
  $('btnAdd').addEventListener('click', () => openSheet(null));
  $('btnFilter').addEventListener('click', (e) => {
    e.stopPropagation();
    togglePop('filterPop', e.currentTarget);
  });
  $('btnMenu').addEventListener('click', (e) => {
    e.stopPropagation();
    togglePop('menuPop', e.currentTarget);
  });

  $('menuPop').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-menu]');
    if (!btn) return;
    closePops();
    const action = btn.dataset.menu;
    if (action === 'settings') {
      openSettings();
      return;
    }
    if (action === 'import') {
      const result = await api.importBookmarks();
      if (result?.canceled) return;
      state.data = await api.load();
      render();
      toast(`导入完成：新增 ${result.added} 条${result.duplicates ? `，跳过重复 ${result.duplicates} 条` : ''}`);
    } else if (action === 'export') {
      const result = await api.exportJson();
      if (result?.canceled) return;
      toast('备份已导出');
    } else if (action === 'dir') {
      await api.openDataDir();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.pop') && !e.target.closest('.tool')) closePops();
  });

  for (const id of ['setSheet', 'cropper']) {
    $(id).addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) $(id).hidden = true;
    });
  }
  $('setClose').addEventListener('click', () => {
    $('setSheet').hidden = true;
  });
  $('setNav').addEventListener('click', (e) => {
    const row = e.target.closest('[data-page]');
    if (row) openSetPage(row.dataset.page);
  });
  $('setBack').addEventListener('click', backSetHome);
  $('cropCancel').addEventListener('click', () => {
    $('cropper').hidden = true;
  });
  $('cropOk').addEventListener('click', confirmCrop);

  $('bgPick').addEventListener('click', async () => {
    const picked = await api.bgPick();
    if (picked?.canceled || !picked?.dataUri) return;
    openCropper(picked.dataUri);
  });

  $('bgClear').addEventListener('click', async () => {
    await api.bgClear();
    bgUri = null;
    await saveBackground({ on: false });
    toast('已移除背景');
  });

  $('bgBlur').addEventListener('input', (e) => {
    $('backdrop').style.setProperty('--blur', `${e.target.value}px`);
    $('bgBlurVal').textContent = e.target.value;
  });
  $('bgBlur').addEventListener('change', (e) => saveTuning({ blur: Number(e.target.value) }));

  $('bgDim').addEventListener('input', (e) => {
    $('backdrop').style.setProperty('--dim', String(Number(e.target.value) / 100));
    $('bgDimVal').textContent = e.target.value;
  });
  $('bgDim').addEventListener('change', (e) => saveTuning({ dim: Number(e.target.value) }));

  $('cropZoom').addEventListener('input', (e) => {
    crop.scale = crop.min * (Number(e.target.value) / 100);
    $('cropZoomVal').textContent = `${e.target.value}%`;
    clampCrop();
    applyCrop();
  });

  const stage = $('cropStage');
  stage.addEventListener('pointerdown', (e) => {
    crop.dragging = true;
    crop.startX = e.clientX;
    crop.startY = e.clientY;
    crop.baseDx = crop.dx;
    crop.baseDy = crop.dy;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!crop.dragging) return;
    crop.dx = crop.baseDx + (e.clientX - crop.startX);
    crop.dy = crop.baseDy + (e.clientY - crop.startY);
    clampCrop();
    applyCrop();
  });
  stage.addEventListener('pointerup', () => {
    crop.dragging = false;
  });
  stage.addEventListener('pointercancel', () => {
    crop.dragging = false;
  });

  let debounce = null;
  $('search').addEventListener('input', (e) => {
    const value = e.target.value;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = value.trim();
      render();
    }, 90);
  });
  $('searchClear').addEventListener('click', () => {
    $('search').value = '';
    state.query = '';
    render();
    $('search').focus();
  });
  $('search').addEventListener('blur', () => {
    setTimeout(() => {
      if (!$('search').value.trim() && document.activeElement !== $('search')) toggleSearch(false);
    }, 160);
  });

  $('grid').addEventListener('click', async (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return openItem(id);
    if (act === 'pin') {
      state.data = await api.togglePin(id);
      render();
    } else if (act === 'edit') {
      openSheet(state.data.items.find((i) => i.id === id));
    } else if (act === 'del') {
      removeItem(id);
    }
  });

  $('grid').addEventListener('keydown', (e) => {
    const card = e.target.closest('.card');
    if (!card || (e.key !== 'Enter' && e.key !== ' ')) return;
    if (e.target.closest('[data-act]')) return;
    e.preventDefault();
    openItem(card.dataset.id);
  });

  $('btnTheme').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'night' ? 'paper' : 'night');
  });

  $('bridgeOn').addEventListener('change', async (e) => {
    await api.bridgeSet(e.target.checked);
    await updateBridgeUi();
  });
  $('loginOn').addEventListener('change', async (e) => {
    await api.setLogin(e.target.checked);
  });
  $('bridgeDir').addEventListener('click', () => api.bridgeOpenDir());

  $('aiOn').addEventListener('change', (e) => saveAi({ enabled: e.target.checked }));
  $('aiBase').addEventListener('change', (e) => saveAi({ baseUrl: e.target.value.trim() }));
  $('aiKey').addEventListener('change', (e) => saveAi({ apiKey: e.target.value.trim() }));
  $('aiModel').addEventListener('change', (e) => saveAi({ model: e.target.value.trim() }));

  $('aiTest').addEventListener('click', async () => {
    const result = await api.aiTest();
    toast(
      result.ok
        ? `可用：${result.sample?.category || '—'} / ${result.sample?.purpose || '—'}`
        : result.reason === 'incomplete'
          ? '接口地址、密钥、模型要填全'
          : '调用失败，检查地址与密钥'
    );
  });

  $('bgOpen').addEventListener('click', () => showSetPage('bg'));

  $('catAddOpen').addEventListener('click', openCatNew);
  $('catAddSave').addEventListener('click', addCategory);
  $('catAddCancel').addEventListener('click', () => showSetPage('cats'));
  $('catNew2').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory();
    }
  });

  $('confirmYes').addEventListener('click', () => closeConfirm(true));
  $('confirmNo').addEventListener('click', () => closeConfirm(false));
  $('confirmSheet').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeConfirm(false);
  });

  $('dictClear').addEventListener('click', async () => {
    const count = Object.keys(state.data?.prefs?.learned || {}).length;
    if (!count) {
      toast('词典还是空的');
      return;
    }
    const ok = await askConfirm({
      title: '清空习惯词典？',
      message: `已记住的 ${count} 个域名会被清除，卡片不受影响。`,
      confirmText: '清空'
    });
    if (!ok) return;
    await api.clearLearned();
    state.data.prefs.learned = {};
    updateDictUi();
    toast('已清空');
  });

  api.onIntake((payload) => {
    openSheet(null);
    $('fUrl').value = payload?.url || '';
    if (payload?.title) $('fTitle').value = payload.title;
    if (payload?.purpose) $('fPurpose').value = payload.purpose;
    if (payload?.category) {
      pickedCategory = payload.category;
      renderChips();
      showCatFlag(payload.categorySource);
    }
    autoFetchMeta();
  });

  api.onSuggest((payload) => {
    if ($('sheet').hidden) return;
    if (payload?.url && payload.url !== $('fUrl').value.trim()) return;
    if (payload.category) {
      pickedCategory = payload.category;
      renderChips();
      showCatFlag('ai');
    }
    if (payload.purpose && !$('fPurpose').value.trim()) $('fPurpose').value = payload.purpose;
  });

  api.onToast((message) => toast(message));

  api.onFlash((id) => flashCard(id));

  api.onReload(async (payload) => {
    state.data = await api.load();
    render();

    // 新条目若被当前的分类或检索挡住了，自动放开筛选，保证看得见
    if (payload?.flashId && !$('grid').querySelector(`.card[data-id="${payload.flashId}"]`)) {
      state.category = '全部';
      state.query = '';
      $('search').value = '';
      render();
    }

    if (payload?.toast) toast(payload.toast);
    if (payload?.flashId) flashCard(payload.flashId);
  });

  $('sheetClose').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeSheet();
  });

  $('fUrl').addEventListener('paste', () => setTimeout(autoFetchMeta, 0));
  $('fUrl').addEventListener('change', autoFetchMeta);
  $('fUrl').addEventListener('blur', () => {
    if ($('fUrl').value.trim() && !$('fTitle').value.trim()) autoFetchMeta();
  });
  $('fCatNew').addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (value) {
      pickedCategory = value;
      renderChips();
    }
  });

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      url: $('fUrl').value,
      title: $('fTitle').value,
      purpose: $('fPurpose').value.replace(/\s+/g, ' ').trim(),
      category: pickedCategory || OTHER,
      tags: parseTags($('fTags').value)
    };
    if (pickedIcon) payload.icon = pickedIcon;
    try {
      if (editingId) {
        state.data = await api.update(editingId, payload);
        toast('已更新');
      } else {
        state.data = await api.add(payload);
        toast('已收录');
      }
      closeSheet();
      render();
    } catch (err) {
      $('sheetError').textContent =
        err?.code === 'DUPLICATE' ? '这条网址已经在册了' : err?.message || '没存上，检查一下网址？';
    }
  });

  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      toggleSearch(true);
      return;
    }
    if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      openSheet(null);
      return;
    }
    if (e.key === 'Escape') {
      if (!$('confirmSheet').hidden) closeConfirm(false);
      else if (!$('cropper').hidden) $('cropper').hidden = true;
      else if (!$('setSheet').hidden && !$('setPage').hidden) backSetHome();
      else if (!$('setSheet').hidden) $('setSheet').hidden = true;
      else if (!$('sheet').hidden) closeSheet();
      else if (!$('filterPop').hidden || !$('menuPop').hidden) closePops();
      else if ($('searchBox').classList.contains('is-open')) toggleSearch(false);
      return;
    }
    if (e.key === 'Enter' && document.activeElement === $('search')) {
      const first = $('grid').querySelector('.card');
      if (first) openItem(first.dataset.id);
    }
  });
}

boot();
