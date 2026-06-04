/** OCR 向け画像前処理（拡大・コントラスト・二値化） */

const MIN_LONG_EDGE = 2200;
const MAX_LONG_EDGE = 3200;

function blobToImage(blob) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('画像処理に失敗しました'))),
      'image/png'
    );
  });
}

/**
 * 名刺 OCR 向けに画像を最適化
 * - 長辺を 2200px 以上に拡大（上限 3200px）
 * - グレースケール + コントラスト強調 + 二値化
 */
export async function preprocessForOcr(blob) {
  const img = await blobToImage(blob);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const long = Math.max(w, h);

  let scale = 1;
  if (long < MIN_LONG_EDGE) scale = MIN_LONG_EDGE / long;
  if (long * scale > MAX_LONG_EDGE) scale = MAX_LONG_EDGE / long;

  w = Math.round(w * scale);
  h = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[g]++;
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 140;
  const total = w * h;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > max) {
      max = between;
      threshold = t;
    }
  }

  threshold = Math.max(90, Math.min(180, threshold));

  for (let i = 0; i < data.length; i += 4) {
    let g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    g = (g - 128) * 1.4 + 128;
    g = Math.max(0, Math.min(255, g));
    const v = g > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas);
}
