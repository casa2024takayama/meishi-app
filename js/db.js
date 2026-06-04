/* global Dexie */

export const db = new Dexie('meishiDB');
db.version(1).stores({
  cards: 'id, createdAt, company, name, *tags',
});

/** HTTP (非セキュアコンテキスト) でも動作する UUID 生成 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function emptyCard() {
  return {
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    eventName: '',
    tags: [],
    company: '',
    department: '',
    title: '',
    name: '',
    nameKana: '',
    zip: '',
    address: '',
    tel: '',
    fax: '',
    mobile: '',
    email: '',
    url: '',
    memo: '',
    rawOcrText: '',
    other: [],
    imageBlob: null,
    imageThumbBlob: null,
  };
}

export async function createThumbnail(blob, maxWidth = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (thumb) => {
          URL.revokeObjectURL(url);
          resolve(thumb);
        },
        'image/jpeg',
        0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('サムネイル生成に失敗しました'));
    };
    img.src = url;
  });
}

export async function saveCard(card) {
  const now = new Date().toISOString();
  const record = { ...card, updatedAt: now };
  if (!record.createdAt) record.createdAt = now;
  if (record.imageBlob && !record.imageThumbBlob) {
    record.imageThumbBlob = await createThumbnail(record.imageBlob);
  }
  await db.cards.put(record);
  return record;
}

export async function getCard(id) {
  return db.cards.get(id);
}

export async function getAllCards() {
  return db.cards.orderBy('createdAt').reverse().toArray();
}

export async function deleteCard(id) {
  await db.cards.delete(id);
}
