import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createItem,
  PURPOSE_MAX,
  searchItems,
  filterItems,
  sortItems,
  mergeItems,
  relativeTime,
  collectCategories,
  collectTags
} from '../src/core/library.js';

const now = 1_700_000_000_000;

const item = (over = {}) =>
  createItem(
    {
      url: 'https://example.com/a',
      title: 'Example',
      purpose: '查文档',
      category: '开发',
      tags: ['api'],
      ...over
    },
    { now }
  );

test('创建条目时归一化网址并初始化统计', () => {
  const it = item({ url: 'example.com/a' });
  assert.equal(it.url, 'https://example.com/a');
  assert.equal(it.domain, 'example.com');
  assert.equal(it.visits, 0);
  assert.equal(it.pinned, false);
  assert.ok(it.id && it.createdAt === now);
});

test('非法网址抛出可读错误', () => {
  assert.throws(() => item({ url: 'haha' }), /网址/);
});

test('检索覆盖标题、用途、域名与标签', () => {
  const items = [
    item({ title: 'MDN', purpose: '查 JS API', tags: ['web'] }),
    item({ url: 'https://figma.com/f', title: 'Figma', purpose: '画界面' })
  ];
  assert.equal(searchItems(items, 'js api').length, 1);
  assert.equal(searchItems(items, 'figma').length, 1);
  assert.equal(searchItems(items, 'web').length, 1);
  assert.equal(searchItems(items, '  ').length, 2);
  assert.equal(searchItems(items, '不存在的词').length, 0);
});

test('分类与标签筛选', () => {
  const items = [
    item({ category: '开发' }),
    item({ url: 'https://b.com', category: '影音', tags: ['电影'] })
  ];
  assert.equal(filterItems(items, { category: '影音' }).length, 1);
  assert.equal(filterItems(items, { category: '全部' }).length, 2);
  assert.equal(filterItems(items, { tag: '电影' }).length, 1);
  assert.equal(filterItems(items, { category: '开发', query: 'b.com' }).length, 0);
});

test('排序：置顶恒在最前', () => {
  const a = item({ title: 'A', visits: 1, lastVisitedAt: now - 1000 });
  const b = item({ url: 'https://b.com', title: 'B', visits: 9, lastVisitedAt: now });
  const pinned = item({ url: 'https://c.com', title: 'C', pinned: true, visits: 0 });
  const sorted = sortItems([a, b, pinned], 'visits');
  assert.equal(sorted[0].title, 'C');
  assert.equal(sorted[1].title, 'B');
});

test('排序：按访问次数与最近访问', () => {
  const a = item({ title: 'A', visits: 5, lastVisitedAt: now - 5000 });
  const b = item({ url: 'https://b.com', title: 'B', visits: 1, lastVisitedAt: now });
  assert.equal(sortItems([a, b], 'visits')[0].title, 'A');
  assert.equal(sortItems([a, b], 'recent')[0].title, 'B');
});

test('合并导入按网址去重', () => {
  const existing = [item()];
  const incoming = [
    { url: 'https://example.com/a', title: '重复', purpose: '' },
    { url: 'x.com', title: '新的', purpose: '' }
  ];
  const { added, duplicates } = mergeItems(existing, incoming);
  assert.equal(added.length, 1);
  assert.equal(added[0].title, '新的');
  assert.equal(duplicates.length, 1);
});

test('用途限制在一行内：合并空白并截断', () => {
  const long = '这是一个特别长的用途说明用来验证会不会撑到第二行导致卡片高度不一致';
  assert.ok(createItem({ url: 'https://a.com', purpose: long }).purpose.length <= PURPOSE_MAX);
  assert.equal(createItem({ url: 'https://a.com', purpose: '查\n文档   很方便' }).purpose, '查 文档 很方便');
  assert.equal(PURPOSE_MAX, 20);
});

test('相对时间可读', () => {
  assert.equal(relativeTime(now, now), '刚刚');
  assert.equal(relativeTime(now - 5 * 60_000, now), '5 分钟前');
  assert.equal(relativeTime(now - 3 * 3_600_000, now), '3 小时前');
  assert.equal(relativeTime(now - 2 * 86_400_000, now), '2 天前');
  assert.equal(relativeTime(0, now), '未访问');
});

test('汇总分类与标签（去重且保持稳定）', () => {
  const items = [
    item({ category: '开发', tags: ['api', 'web'] }),
    item({ url: 'https://b.com', category: '开发', tags: ['web'] })
  ];
  assert.deepEqual(collectCategories(items), ['开发']);
  assert.deepEqual(collectTags(items), ['api', 'web']);
});
