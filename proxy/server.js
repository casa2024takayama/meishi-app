/**
 * 開発用 CORS プロキシ（Claude API 中継）
 * 起動: node proxy/server.js
 * iPhone から: http://<MacのIP>:8787/api/structure
 */
import http from 'node:http';

const PORT = Number(process.env.PORT) || 8787;
const MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-haiku-20241022';
const ANTHROPIC_VERSION = '2023-06-01';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(body));
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
  if (start === -1 || end === -1) throw new Error('JSON not found in model response');
  return JSON.parse(candidate.slice(start, end + 1));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.url !== '/api/structure' || req.method !== 'POST') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  try {
    const body = JSON.parse(await readBody(req));
    const { apiKey, text } = body;

    if (!apiKey || !text) {
      sendJson(res, 400, { error: 'apiKey and text are required' });
      return;
    }

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: buildPrompt(text) }],
      }),
    });

    const apiData = await apiRes.json();

    if (!apiRes.ok) {
      sendJson(res, apiRes.status, {
        error: apiData.error?.message || 'Anthropic API error',
      });
      return;
    }

    const content = apiData.content?.find((c) => c.type === 'text')?.text || '';
    const fields = extractJson(content);
    sendJson(res, 200, { fields });
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Internal error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Claude proxy: http://0.0.0.0:${PORT}/api/structure`);
});
