const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('shizhi', {
  load: () => ipcRenderer.invoke('lib:load'),
  add: (payload) => ipcRenderer.invoke('item:add', payload),
  update: (id, patch) => ipcRenderer.invoke('item:update', id, patch),
  remove: (id) => ipcRenderer.invoke('item:remove', id),
  restore: (item) => ipcRenderer.invoke('item:restore', item),
  open: (id) => ipcRenderer.invoke('item:open', id),
  togglePin: (id) => ipcRenderer.invoke('item:pin', id),
  fetchMeta: (url) => ipcRenderer.invoke('meta:fetch', url),
  importBookmarks: () => ipcRenderer.invoke('io:importBookmarks'),
  exportJson: () => ipcRenderer.invoke('io:exportJson'),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  bgPick: () => ipcRenderer.invoke('bg:pick'),
  bgSet: (dataUri) => ipcRenderer.invoke('bg:set', dataUri),
  bgLoad: () => ipcRenderer.invoke('bg:load'),
  bgClear: () => ipcRenderer.invoke('bg:clear'),
  themeBg: (key) => ipcRenderer.invoke('theme:bg', key),

  bridgeStatus: () => ipcRenderer.invoke('bridge:status'),
  bridgeSet: (on) => ipcRenderer.invoke('bridge:set', on),
  bridgeOpenDir: () => ipcRenderer.invoke('bridge:openDir'),
  setLogin: (on) => ipcRenderer.invoke('app:login', on),
  onIntake: (cb) => on('shizhi:intake', cb),
  onFlash: (cb) => on('shizhi:flash', cb),
  onToast: (cb) => on('shizhi:toast', cb),
  onReload: (cb) => on('shizhi:reload', cb),
  onSuggest: (cb) => on('shizhi:suggest', cb),
  aiTest: () => ipcRenderer.invoke('ai:test'),
  clearLearned: () => ipcRenderer.invoke('ai:clearLearned'),
  removeLearned: (domain) => ipcRenderer.invoke('learned:remove', domain),
  addCategory: (name) => ipcRenderer.invoke('cat:add', name),
  removeCategory: (name) => ipcRenderer.invoke('cat:remove', name),

  winMin: () => ipcRenderer.invoke('win:min'),
  winMax: () => ipcRenderer.invoke('win:max'),
  winClose: () => ipcRenderer.invoke('win:close')
});
