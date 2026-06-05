import { APP_VERSION } from './version.js';

const FIELD_LABELS = {
  eventName: 'イベント名',
  tags: 'タグ（カンマ区切り）',
  company: '会社名',
  department: '部署',
  title: '役職',
  name: '氏名',
  nameKana: '氏名カナ',
  zip: '郵便番号',
  address: '住所',
  tel: '電話',
  fax: 'FAX',
  mobile: '携帯',
  email: 'メール',
  url: 'URL',
  memo: 'メモ',
  createdAt: '取得日',
};

export function renderList(cards, urlRegistry = null) {
  if (!cards.length) return renderEmptyList();

  const items = cards
    .map((card) => {
      const thumbUrl = card.imageThumbBlob
        ? URL.createObjectURL(card.imageThumbBlob)
        : '';
      if (thumbUrl && urlRegistry) urlRegistry.push(thumbUrl);
      return `
        <a href="#/detail/${card.id}" class="card-item" data-id="${card.id}">
          ${
            thumbUrl
              ? `<img class="card-thumb" src="${thumbUrl}" alt="" loading="lazy">`
              : '<div class="card-thumb"></div>'
          }
          <div class="card-info">
            <div class="card-company">${escapeHtml(card.company || '（会社名なし）')}</div>
            <div class="card-name">${escapeHtml(card.name || '（氏名なし）')}</div>
          </div>
        </a>
      `;
    })
    .join('');

  return `
    <div class="list-toolbar">
      <button type="button" id="btn-export-xlsx" class="btn btn-secondary btn-sm">Excel出力</button>
      <a href="#/settings" class="btn btn-secondary btn-sm">設定</a>
    </div>
    <div class="card-list">${items}</div>
    <p class="app-version">${APP_VERSION}</p>
    <button type="button" class="fab" id="fab-add" aria-label="名刺を追加">+</button>
  `;
}

export function renderEmptyList() {
  return `
    <div class="list-toolbar">
      <a href="#/settings" class="btn btn-secondary btn-sm">設定</a>
    </div>
    <div class="empty-state">
      <p>名刺がまだありません</p>
      <p>右下の + ボタンから追加してください</p>
    </div>
    <p class="app-version">${APP_VERSION}</p>
    <button type="button" class="fab" id="fab-add" aria-label="名刺を追加">+</button>
  `;
}

export function renderSettings(settings) {
  return `
    <form id="settings-form" class="settings-form">
      <div class="settings-notice">
        <strong>注意:</strong> Claude を有効にすると、名刺のテキストが Anthropic API に送信されます。
        APIキーは端末の localStorage にのみ保存されます。
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" id="claude-enabled" name="claudeEnabled" ${settings.claudeEnabled ? 'checked' : ''}>
          Claude で項目を自動入力
        </label>
      </div>
      <div class="form-group">
        <label for="api-key">Anthropic API キー</label>
        <input type="password" id="api-key" name="apiKey" value="${escapeAttr(settings.apiKey)}" placeholder="sk-ant-..." autocomplete="off">
      </div>
      <div class="form-group">
        <label for="proxy-url">プロキシ URL（Mac 上で起動）</label>
        <input type="url" id="proxy-url" name="proxyUrl" value="${escapeAttr(settings.proxyUrl)}" placeholder="http://192.168.0.100:8787/api/structure">
        <p class="field-hint">Firebase: <code>...cloudfunctions.net/structure</code> / Worker: <code>...workers.dev/api/structure</code> / ローカル: <code>http://&lt;Mac IP&gt;:8787/api/structure</code></p>
      </div>
      <button type="submit" class="btn btn-primary btn-block">保存</button>
      <p class="app-version">バージョン ${APP_VERSION}</p>
    </form>
  `;
}

export function renderCapture() {
  return `
    <div class="capture-area">
      <label class="file-input-label" id="file-label">
        <input type="file" id="file-input" accept="image/*">
        カメラで撮影 / 写真を選択
      </label>

      <div id="post-capture" class="post-capture hidden">
        <section class="ios-ocr-panel">
          <h2 class="panel-title">推奨: iPhone 標準 OCR</h2>
          <p class="panel-desc">Safari 内の OCR より精度が高い Apple 純正の文字認識を使います。</p>
          <ol class="ios-ocr-steps">
            <li>このアプリで撮影した写真は<strong>写真アプリ</strong>のライブラリから開けます</li>
            <li>写真を開き、右下の<strong>テキスト認識</strong>（四角に点のアイコン）をタップ</li>
            <li>表示された文字を選択して<strong>コピー</strong></li>
            <li>この画面に戻り、下の欄に<strong>貼り付け</strong></li>
          </ol>
          <div class="form-group">
            <label for="paste-ocr">コピーしたテキスト</label>
            <textarea id="paste-ocr" class="paste-ocr" placeholder="ここに貼り付け（長押し → ペースト）"></textarea>
          </div>
          <button type="button" id="btn-livetext-edit" class="btn btn-primary btn-block">標準OCRのテキストで編集へ</button>
          <button type="button" id="btn-edit-no-ocr" class="btn btn-secondary btn-block">テキストなしで編集へ</button>
        </section>

        <details class="tesseract-panel">
          <summary>アプリ内 OCR（Tesseract・低精度 / オフライン）</summary>
          <div class="crop-stage">
            <p class="crop-hint">名刺の範囲を自動検出しました。必要なら枠を調整してください。</p>
            <div id="crop-container" class="crop-container">
              <img id="crop-image" class="crop-image" alt="クロップ対象">
              <div id="crop-box" class="crop-box">
                <span class="crop-box-label">OCR範囲</span>
                <span class="crop-handle-br" aria-hidden="true"></span>
              </div>
            </div>
            <button type="button" id="btn-reset-crop" class="btn btn-secondary btn-block">範囲をリセット</button>
          </div>
          <div id="preview-actions" class="btn-row">
            <button type="button" id="btn-retake" class="btn btn-secondary">撮り直し</button>
            <button type="button" id="btn-ocr" class="btn btn-primary">OCR 実行</button>
          </div>
          <div id="ocr-progress" class="progress-wrap hidden">
            <div class="progress-bar"><div id="progress-fill" class="progress-fill"></div></div>
            <p id="progress-text" class="progress-text">OCR 準備中...</p>
          </div>
          <pre id="ocr-result" class="ocr-result hidden"></pre>
          <div id="capture-footer" class="capture-footer hidden">
            <button type="button" id="btn-to-edit" class="btn btn-primary btn-block">Tesseract結果で編集へ</button>
          </div>
        </details>
      </div>
    </div>
  `;
}

export function renderEdit(card, imageUrl) {
  const fields = [
    'createdAt',
    'eventName',
    'tags',
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
    'memo',
  ];

  const inputs = fields
    .map((key) => {
      let value = card[key] ?? '';
      if (key === 'tags' && Array.isArray(card.tags)) value = card.tags.join(', ');
      if (key === 'createdAt' && value) {
        value = value.slice(0, 10);
      }
      const type = key === 'createdAt' ? 'date' : key === 'memo' ? 'textarea' : 'input';
      if (type === 'textarea') {
        return `
          <div class="form-group">
            <label for="field-${key}">${FIELD_LABELS[key]}</label>
            <textarea id="field-${key}" name="${key}">${escapeHtml(String(value))}</textarea>
          </div>
        `;
      }
      return `
        <div class="form-group">
          <label for="field-${key}">${FIELD_LABELS[key]}</label>
          <input type="${key === 'createdAt' ? 'date' : 'text'}" id="field-${key}" name="${key}" value="${escapeAttr(String(value))}">
        </div>
      `;
    })
    .join('');

  const otherText = Array.isArray(card.other) ? card.other.join('\n') : '';
  const rawText = card.rawOcrText || '';

  return `
    <div class="edit-layout">
      ${
        imageUrl
          ? `<img class="edit-image" id="edit-image" src="${imageUrl}" alt="名刺画像">`
          : ''
      }
      <form class="edit-form" id="edit-form">
        <div class="reparse-bar">
          <button type="button" id="btn-reparse-local" class="btn btn-secondary">ローカルで再解析</button>
          <button type="button" id="btn-reparse-claude" class="btn btn-secondary">Claudeで再解析</button>
        </div>
        <div class="form-group">
          <label for="field-raw-ocr">OCR 生テキスト（編集可）</label>
          <textarea id="field-raw-ocr" class="raw-ocr-field">${escapeHtml(rawText)}</textarea>
        </div>
        ${inputs}
        <div class="form-group">
          <label for="field-other">その他（未分類テキスト）</label>
          <textarea id="field-other" name="other">${escapeHtml(otherText)}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">保存</button>
      </form>
    </div>
  `;
}

export function renderDetail(card, imageUrl) {
  const displayFields = [
    ['createdAt', '取得日'],
    ['eventName', 'イベント名'],
    ['tags', 'タグ'],
    ['company', '会社名'],
    ['department', '部署'],
    ['title', '役職'],
    ['name', '氏名'],
    ['nameKana', '氏名カナ'],
    ['zip', '郵便番号'],
    ['address', '住所'],
    ['tel', '電話'],
    ['fax', 'FAX'],
    ['mobile', '携帯'],
    ['email', 'メール'],
    ['url', 'URL'],
    ['memo', 'メモ'],
  ];

  const rows = displayFields
    .map(([key, label]) => {
      let value = card[key] ?? '';
      if (key === 'tags' && Array.isArray(card.tags)) value = card.tags.join(', ');
      if (key === 'createdAt' && value) value = value.slice(0, 10);
      return `
        <dt>${label}</dt>
        <dd>${escapeHtml(String(value))}</dd>
      `;
    })
    .join('');

  return `
    <div class="detail-layout">
      ${
        imageUrl
          ? `<img class="detail-image" id="detail-image" src="${imageUrl}" alt="名刺画像">`
          : ''
      }
      <dl class="detail-dl">${rows}</dl>
    </div>
    <div class="btn-row">
      <a href="#/edit/${card.id}" class="btn btn-secondary">編集</a>
      <button type="button" id="btn-delete" class="btn btn-danger">削除</button>
    </div>
  `;
}

export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

export function readEditForm(form) {
  const data = {};
  const fd = new FormData(form);
  for (const [key, value] of fd.entries()) {
    if (key === 'other') continue;
    data[key] = String(value).trim();
  }
  if (data.tags) {
    data.tags = data.tags.split(/[,、]/).map((t) => t.trim()).filter(Boolean);
  } else {
    data.tags = [];
  }
  if (data.createdAt) {
    data.createdAt = new Date(data.createdAt).toISOString();
  }
  return data;
}

export function showImageModal(src) {
  const modal = document.getElementById('modal');
  const img = document.getElementById('modal-image');
  img.src = src;
  modal.classList.remove('hidden');
}

export function hideImageModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modal-image').src = '';
}

/** 解析結果を編集フォームに反映 */
export function applyParsedToForm(parsed) {
  const keys = [
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
  keys.forEach((key) => {
    const el = document.getElementById(`field-${key}`);
    if (el) el.value = parsed[key] ?? '';
  });
  const otherEl = document.getElementById('field-other');
  if (otherEl) {
    otherEl.value = Array.isArray(parsed.other) ? parsed.other.join('\n') : '';
  }
  const rawEl = document.getElementById('field-raw-ocr');
  if (rawEl && parsed.rawOcrText != null) rawEl.value = parsed.rawOcrText;
}
