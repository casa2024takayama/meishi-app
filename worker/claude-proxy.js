/**
 * Cloudflare Worker: Claude API プロキシ（GitHub Pages 用）
 *
 * デプロイ後、設定画面のプロキシ URL に以下を指定:
 *   https://<your-worker>.<account>.workers.dev/api/structure
 *
 * wrangler.toml 例:
 *   name = "meishi-claude-proxy"
 *   main = "claude-proxy.js"
 *   compatibility_date = "2024-01-01"
 */
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/structure' || request.method !== 'POST') {
      return json({ error: 'Not found' }, 404);
    }

    try {
      const body = await request.json();
      const { apiKey, text } = body;
      if (!apiKey || !text) {
        return json({ error: 'apiKey and text are required' }, 400);
      }

      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          messages: [{ role: 'user', content: buildPrompt(text) }],
        }),
      });

      const apiData = await apiRes.json();
      if (!apiRes.ok) {
        return json({ error: apiData.error?.message || 'Anthropic API error' }, apiRes.status);
      }

      const content = apiData.content?.find((c) => c.type === 'text')?.text || '';
      const fields = extractJson(content);
      return json({ fields }, 200);
    } catch (err) {
      return json({ error: err.message || 'Internal error' }, 500);
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function buildPrompt(rawText) {
  return `あなたは日本の名刺のテキストを構造化するアシスタントです。
以下のOCR生テキストから名刺フィールドを抽出し、JSONオブジェクトのみを返してください。

フィールド: company, department, title, name, nameKana, zip, address, tel, fax, mobile, email, url, other(文字列配列)
不明は "" または [] にしてください。

--- OCRテキスト ---
${rawText}
--- ここまで ---`;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON not found');
  return JSON.parse(candidate.slice(start, end + 1));
}
