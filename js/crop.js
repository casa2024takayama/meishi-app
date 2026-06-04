/** 画像読み込み・JPEG 変換・クロップ・OCR 用 Blob 生成 */

const MAX_IMAGE_EDGE = 4096;

export async function loadImageFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      el.src = url;
    });
    return { img, url };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export async function fileToJpegBlob(file) {
  const { img, url } = await loadImageFromFile(file);
  try {
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    const long = Math.max(w, h);
    if (long > MAX_IMAGE_EDGE) {
      const s = MAX_IMAGE_EDGE / long;
      w = Math.round(w * s);
      h = Math.round(h * s);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('画像変換に失敗しました'))),
        'image/jpeg',
        0.92
      );
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 正規化座標 0〜1: { x, y, w, h } */
export function defaultCropRegion() {
  return { x: 0.05, y: 0.1, w: 0.9, h: 0.8 };
}

export function initCropSelector(container, imgEl, boxEl, onChange) {
  let region = defaultCropRegion();
  let mode = null;
  let startX = 0;
  let startY = 0;
  let startRegion = null;

  function layout() {
    const cr = container.getBoundingClientRect();
    const ir = imgEl.getBoundingClientRect();
    if (ir.width < 1 || ir.height < 1) return;
    const left = ir.left - cr.left;
    const top = ir.top - cr.top;
    boxEl.style.left = `${left + region.x * ir.width}px`;
    boxEl.style.top = `${top + region.y * ir.height}px`;
    boxEl.style.width = `${region.w * ir.width}px`;
    boxEl.style.height = `${region.h * ir.height}px`;
  }

  function clampRegion(r) {
    const min = 0.08;
    let { x, y, w, h } = r;
    w = Math.max(min, Math.min(1, w));
    h = Math.max(min, Math.min(1, h));
    x = Math.max(0, Math.min(1 - w, x));
    y = Math.max(0, Math.min(1 - h, y));
    return { x, y, w, h };
  }

  function pointerPos(e) {
    const cr = container.getBoundingClientRect();
    const t = e.touches?.[0] || e.changedTouches?.[0];
    const clientX = t ? t.clientX : e.clientX;
    const clientY = t ? t.clientY : e.clientY;
    return { px: clientX - cr.left, py: clientY - cr.top };
  }

  function onPointerDown(e) {
    if (e.target === imgEl) return;
    e.preventDefault();
    const target = e.target;
    const { px, py } = pointerPos(e);
    startX = px;
    startY = py;
    startRegion = { ...region };
    mode = target.classList.contains('crop-handle-br') ? 'resize' : 'move';
  }

  function onPointerMove(e) {
    if (!mode) return;
    e.preventDefault();
    const { px, py } = pointerPos(e);
    const ir = imgEl.getBoundingClientRect();
    const dx = (px - startX) / ir.width;
    const dy = (py - startY) / ir.height;

    if (mode === 'move') {
      region = clampRegion({
        x: startRegion.x + dx,
        y: startRegion.y + dy,
        w: startRegion.w,
        h: startRegion.h,
      });
    } else {
      region = clampRegion({
        x: startRegion.x,
        y: startRegion.y,
        w: startRegion.w + dx,
        h: startRegion.h + dy,
      });
    }
    layout();
    onChange?.(region);
  }

  function onPointerUp() {
    mode = null;
  }

  boxEl.addEventListener('mousedown', onPointerDown);
  boxEl.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchend', onPointerUp);

  const onResize = () => layout();
  window.addEventListener('resize', onResize);

  return {
    getRegion: () => ({ ...region }),
    setRegion: (r) => {
      region = clampRegion(r);
      layout();
      onChange?.(region);
    },
    relayout: layout,
    destroy: () => {
      boxEl.removeEventListener('mousedown', onPointerDown);
      boxEl.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchend', onPointerUp);
      window.removeEventListener('resize', onResize);
    },
  };
}

export async function getCroppedBlob(img, region) {
  const sx = Math.round(region.x * img.naturalWidth);
  const sy = Math.round(region.y * img.naturalHeight);
  const sw = Math.max(1, Math.round(region.w * img.naturalWidth));
  const sh = Math.max(1, Math.round(region.h * img.naturalHeight));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('クロップに失敗しました'))),
      'image/jpeg',
      0.95
    );
  });
}
