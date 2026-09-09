const TIMEOUT = 15000;

function endpointOf(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

function buildPrompt({ url, title, description, categories }) {
  return [
    '你是网址收藏工具的分类助手。根据下面的信息，从候选分类中选一个最贴切的，',
    '并写一句不超过 20 个汉字的用途说明（说清这个网站的主要功能）。',
    '',
    `候选分类：${categories.join('、')}`,
    `网址：${url || ''}`,
    `标题：${title || ''}`,
    `描述：${(description || '').slice(0, 200)}`,
    '',
    '只输出 JSON，不要解释：{"category":"<候选分类之一>","purpose":"<20 字以内>"}'
  ].join('\n');
}

function parseResult(text, categories) {
  const match = String(text || '').match(/\{[\s\S]*?\}/);
  if (!match) return null;
  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const category = String(parsed.category || '').trim();
  const purpose = String(parsed.purpose || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (!category && !purpose) return null;
  return {
    category: categories.includes(category) ? category : '',
    purpose
  };
}

/**
 * 调用云端聊天接口做兜底分类与用途生成。
 * 只发送网址、标题与描述，不发送正文；任何失败都返回 null，不影响主流程。
 */
async function suggest({ url, title, description, categories, config = {} }) {
  const endpoint = endpointOf(config.baseUrl);
  if (!endpoint || !config.apiKey || !config.model) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: '你只输出 JSON，不输出多余文字。' },
          { role: 'user', content: buildPrompt({ url, title, description, categories }) }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    return parseResult(content, categories || []);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { suggest, buildPrompt, parseResult };
