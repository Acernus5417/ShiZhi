import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBookmarks } from '../src/core/bookmarks.js';

const sample = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://developer.mozilla.org/" ADD_DATE="1600000000">MDN Web Docs</A>
    <DT><H3 ADD_DATE="1600000001" LAST_MODIFIED="1600000002">开发工具</H3>
    <DL><p>
        <DT><A HREF="https://vitejs.dev/" ICON="data:image/png;base64,AAAA">Vite</A>
        <DT><A HREF="https://cn.bilibili.com/">哔哩哔哩 &amp; 番剧</A>
    </DL><p>
    <DT><H3>素材</H3>
    <DL><p>
        <DT><A HREF="https://unsplash.com/">Unsplash</A>
    </DL><p>
</DL><p>`;

test('解析链接、标题与所在文件夹', () => {
  const { items } = parseBookmarks(sample);
  assert.equal(items.length, 4);
  assert.equal(items[0].title, 'MDN Web Docs');
  assert.equal(items[0].folder, '');
  assert.equal(items[1].title, 'Vite');
  assert.equal(items[1].folder, '开发工具');
  assert.equal(items[3].folder, '素材');
});

test('解码 HTML 实体', () => {
  const { items } = parseBookmarks(sample);
  assert.equal(items[2].title, '哔哩哔哩 & 番剧');
});

test('记录 ICON 与 ADD_DATE', () => {
  const { items } = parseBookmarks(sample);
  assert.equal(items[1].icon, 'data:image/png;base64,AAAA');
  assert.equal(items[0].addDate, 1600000000);
});

test('空输入或无关 HTML 不报错', () => {
  assert.equal(parseBookmarks('').items.length, 0);
  assert.equal(parseBookmarks('<html><body>hi</body></html>').items.length, 0);
  assert.equal(parseBookmarks(null).items.length, 0);
});

test('跳过空链接与 javascript: 书签', () => {
  const html = `<DL><p>
    <DT><A HREF="">空的</A>
    <DT><A HREF="javascript:void(0)">脚本</A>
    <DT><A HREF="https://ok.dev">正常</A>
  </DL><p>`;
  const { items } = parseBookmarks(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://ok.dev');
});
