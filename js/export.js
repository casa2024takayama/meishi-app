/* global XLSX */
/** 名刺データを Excel (.xlsx) 形式でエクスポート */
import { getAllCards } from './db.js';

// [フィールドキー, Excel 見出し]
const COLUMNS = [
  ['createdAt', '取得日'],
  ['eventName', 'イベント名'],
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
  ['tags', 'タグ'],
  ['memo', 'メモ'],
  ['other', 'その他'],
];

const WIDE_KEYS = new Set(['address', 'memo', 'other', 'url']);

function cellValue(card, key) {
  let v = card[key];
  if (key === 'createdAt' && v) return String(v).slice(0, 10);
  if (Array.isArray(v)) return v.join(key === 'tags' ? ', ' : '\n');
  return v ?? '';
}

/**
 * 全名刺を 1 シートの .xlsx として書き出してダウンロード。
 * @returns {Promise<number>} 出力した件数
 */
export async function exportCardsToXlsx() {
  if (typeof XLSX === 'undefined') {
    throw new Error('Excel ライブラリの読み込みに失敗しました（通信環境を確認してください）');
  }

  const cards = await getAllCards();
  if (!cards.length) {
    throw new Error('出力する名刺がありません');
  }

  const header = COLUMNS.map(([, label]) => label);
  const rows = cards.map((card) => {
    const row = {};
    COLUMNS.forEach(([key, label]) => {
      row[label] = cellValue(card, key);
    });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header });
  ws['!cols'] = COLUMNS.map(([key]) => ({ wch: WIDE_KEYS.has(key) ? 32 : 16 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '名刺');

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  XLSX.writeFile(wb, `meishi_${today}.xlsx`);

  return cards.length;
}
