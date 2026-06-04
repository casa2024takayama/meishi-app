import { parseOcrText } from './parser.js';
import { getSettings } from './settings.js';

const FIELD_KEYS = [
  'company',
  'department',
  'title',
  'name',
  'nameKana',
  'zip',
  'address',
  'tel',
  'fax',
  'mobile',
  'email',
  'url',
];

function buildPrompt(rawText) {
  return `あなたは日本の名刺のテキストを構造化するアシスタントです。
以下のOCR生テキストから名刺フィールドを抽出し、JSONオブジェクトのみを返してください。説明文やマークダウンは不要です。

フィールド:
- company: 会社名
- department: 部署
- title: 役職
- name: 氏名
- nameKana: 氏名カナ
- zip: 郵便番号
- address: 住所
- tel: 電話
- fax: FAX
- mobile: 携帯
- email: メール
- url: URL
- other: 上記に当てはまらない行の配列（文字列配列）

不明な項目は空文字 "" にしてください。other は配列です。

--- OCRテキスト ---
${rawText}
--- ここまで ---`;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON が見つかりません');
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeFields(data) {
  const result = {};
  FIELD_KEYS.forEach((key) => {
    result[key] = typeof data[key] === 'string' ? data[key].trim() : '';
  });
  if (Array.isArray(data.other)) {
    result.other = data.other.map((l) => String(l).trim()).filter(Boolean);
  } else if (typeof data.other === 'string' && data.other.trim()) {
    result.other = data.other.split('\n').map((l) => l.trim()).filter(Boolean);
  } else {
    result.other = [];
  }
  return result;
}

async function callClaudeViaProxy(rawText, settings) {
  const res = await fetch(settings.proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: settings.apiKey,
      text: rawText,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `プロキシエラー (${res.status})`);
  }
  return normalizeFields(data.fields || data);
}

/**
 * 生テキストを名刺フィールドに構造化。Claude 失敗時は parser.js にフォールバック。
 */
export async function structureText(rawText, options = {}) {
  const text = (rawText || '').trim();
  const settings = getSettings();
  const useClaude =
    options.forceClaude === true ||
    (options.preferClaude !== false && settings.claudeEnabled);

  if (!useClaude || !text) {
    return { ...parseOcrText(text), rawOcrText: text };
  }

  if (!settings.apiKey) {
    console.warn('Claude: APIキー未設定。ローカル解析にフォールバック');
    return { ...parseOcrText(text), rawOcrText: text };
  }

  if (!settings.proxyUrl) {
    console.warn('Claude: プロキシURL未設定。ローカル解析にフォールバック');
    return { ...parseOcrText(text), rawOcrText: text };
  }

  try {
    const fields = await callClaudeViaProxy(text, settings);
    return { ...fields, rawOcrText: text };
  } catch (err) {
    console.warn('Claude 構造化失敗、ローカルにフォールバック:', err);
    if (options.throwOnError) throw err;
    return { ...parseOcrText(text), rawOcrText: text };
  }
}
