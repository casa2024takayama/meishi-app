/* global Tesseract */
import { preprocessForOcr } from './preprocess.js';

const TESS_BASE = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
};

const CORE_PATHS = [
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0/tesseract-core-lstm.wasm.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0/tesseract-core.wasm.js',
];

let worker = null;
let workerInit = null;

function safeLogger(onProgress) {
  return (m) => {
    if (m?.status === 'recognizing text' || m?.status?.includes('loading')) {
      onProgress?.(m);
    }
  };
}

async function initWorker(onProgress) {
  if (worker) return worker;
  if (workerInit) return workerInit;

  workerInit = (async () => {
    const oem = Tesseract.OEM?.LSTM_ONLY ?? 1;
    const psm = Tesseract.PSM?.SINGLE_BLOCK ?? '6';
    let lastErr;

    for (const corePath of CORE_PATHS) {
      try {
        const w = await Tesseract.createWorker(['jpn', 'eng'], oem, {
          ...TESS_BASE,
          corePath,
          logger: safeLogger(onProgress),
        });
        await w.setParameters({
          tessedit_pageseg_mode: psm,
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        });
        worker = w;
        return w;
      } catch (err) {
        lastErr = err;
        await resetWorker();
      }
    }
    throw lastErr || new Error('OCR エンジンの起動に失敗しました');
  })();

  try {
    return await workerInit;
  } catch (err) {
    workerInit = null;
    worker = null;
    throw err;
  }
}

export async function resetWorker() {
  if (worker) {
    try {
      await worker.terminate();
    } catch (_) {
      /* ignore */
    }
  }
  worker = null;
  workerInit = null;
}

export async function runOcr(imageBlob, onProgress) {
  let preprocessed;
  try {
    preprocessed = await preprocessForOcr(imageBlob);
  } catch (err) {
    console.warn('前処理をスキップ:', err);
    preprocessed = imageBlob;
  }

  try {
    const w = await initWorker(onProgress);
    const { data } = await w.recognize(preprocessed);
    return { text: (data.text || '').trim() };
  } catch (err) {
    await resetWorker();
    throw err;
  }
}

export function progressLabel(message) {
  if (!message) return 'OCR 準備中...';
  if (message.status === 'loading language traineddata') return '言語データを読み込み中...';
  if (message.status === 'initializing api') return 'OCR エンジンを初期化中...';
  if (message.status === 'initialized api') return 'OCR 準備完了';
  if (message.status === 'recognizing text') {
    const pct = Math.round((message.progress || 0) * 100);
    return `文字認識中... ${pct}%`;
  }
  return '処理中...';
}

export function progressPercent(message) {
  if (message?.status === 'recognizing text') {
    return Math.round((message.progress || 0) * 100);
  }
  if (message?.progress) return Math.round(message.progress * 100);
  return 5;
}
