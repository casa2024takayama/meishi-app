/** OCR 向け画像前処理（拡大・グレースケール・適応的二値化） */

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
 * Bradley-Roth 適応的二値化。
 * 各画素を周囲ウィンドウの平均と比較するため、照明ムラやグラデーション、
 * 色付き背景の名刺でも文字をきれいに抜き出せる（大域 Otsu より高精度）。
 */
function adaptiveThreshold(gray, w, h) {
  // 積分画像（各点までの輝度合計）。Uint32 に収まる（255 * 画素数 < 2^32）。
  const integral = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] =
        integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }

  // ウィンドウは長辺の約 1/16（文字 1〜2 文字分）。t は明るさ補正の閾値。
  const half = Math.max(8, Math.round(Math.min(w, h) / 16));
  const T_PERCENT = 12; // 平均より 12% 暗ければ文字とみなす
  const out = new Uint8ClampedArray(w * h);

  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(w - 1, x + half);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * (w + 1) + (x2 + 1)] -
        integral[y1 * (w + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (w + 1) + x1] +
        integral[y1 * (w + 1) + x1];
      // gray*count <= sum*(100-t)/100 なら黒
      out[y * w + x] =
        gray[y * w + x] * count <= (sum * (100 - T_PERCENT)) / 100 ? 0 : 255;
    }
  }
  return out;
}

/**
 * 名刺 OCR 向けに画像を最適化
 * - 長辺を 2200px 以上に拡大（上限 3200px）
 * - グレースケール + 適応的二値化（Bradley-Roth）
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

  // グレースケール化（軽いコントラスト強調を併用）
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    g = (g - 128) * 1.2 + 128;
    gray[p] = g < 0 ? 0 : g > 255 ? 255 : g;
  }

  const binary = adaptiveThreshold(gray, w, h);

  for (let p = 0, i = 0; p < binary.length; p++, i += 4) {
    const v = binary[p];
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas);
}
