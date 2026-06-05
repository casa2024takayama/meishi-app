import { structureText } from './claude.js';
import {
  defaultCropRegion,
  detectCardRegion,
  fileToJpegBlob,
  getCroppedBlob,
  initCropSelector,
  loadImageFromFile,
} from './crop.js';
import { deleteCard, emptyCard, getAllCards, getCard, saveCard } from './db.js';
import { exportCardsToXlsx } from './export.js';
import { progressLabel, progressPercent, runOcr } from './ocr.js';
import { getSettings, saveSettings } from './settings.js';
import {
  applyParsedToForm,
  hideImageModal,
  readEditForm,
  renderCapture,
  renderDetail,
  renderEdit,
  renderList,
  renderSettings,
  showImageModal,
} from './ui.js';

const app = document.getElementById('app');
const pageTitle = document.getElementById('page-title');
const btnBack = document.getElementById('btn-back');
const loadingEl = document.getElementById('loading');

const draft = { card: null, imageUrl: null };

let captureState = null;
let lastRoute = '';
let listObjectUrls = [];

function revokeListUrls() {
  listObjectUrls.forEach((u) => URL.revokeObjectURL(u));
  listObjectUrls = [];
}

function revokeDraftUrl() {
  if (draft.imageUrl) {
    URL.revokeObjectURL(draft.imageUrl);
    draft.imageUrl = null;
  }
}

function showLoading(message = '処理中...') {
  if (!loadingEl) return;
  loadingEl.querySelector('.loading-text').textContent = message;
  loadingEl.classList.remove('hidden');
}

function hideLoading() {
  loadingEl?.classList.add('hidden');
}

function navigate(hash) {
  const next = hash.startsWith('#') ? hash : `#${hash}`;
  if (window.location.hash === next) {
    render();
  } else {
    window.location.hash = next;
  }
}

function parseRoute() {
  const raw = window.location.hash.slice(1).replace(/^\//, '');
  if (!raw) return { parts: [], name: 'list' };
  const parts = raw.split('/').filter(Boolean);
  return { parts, name: parts[0] || 'list' };
}

function setHeader(title, showBack) {
  pageTitle.textContent = title;
  btnBack.classList.toggle('hidden', !showBack);
}

async function goToEditFromCapture(imageBlob, ocrText) {
  const settings = getSettings();
  const useClaude = settings.claudeEnabled && (ocrText || '').trim();
  if (useClaude) showLoading('AI で項目を整理中...');

  try {
    revokeDraftUrl();
    const parsed = await structureText(ocrText || '', {
      preferClaude: settings.claudeEnabled,
    });
    draft.card = {
      ...emptyCard(),
      ...parsed,
      rawOcrText: ocrText || '',
      imageBlob,
    };
    draft.imageUrl = URL.createObjectURL(imageBlob);
    navigate('#/edit');
  } catch (err) {
    console.error(err);
    alert(`編集画面への移動に失敗しました: ${err.message}`);
  } finally {
    hideLoading();
  }
}

async function render() {
  const { parts, name } = parseRoute();

  if (lastRoute === 'capture' && name !== 'capture') {
    destroyCaptureState();
  }
  if (name !== 'list') revokeListUrls();
  lastRoute = name;

  app.innerHTML = '';

  if (name === 'list') {
    setHeader('名刺一覧', false);
    revokeListUrls();
    const cards = await getAllCards();
    app.innerHTML = renderList(cards, listObjectUrls);
    document.getElementById('fab-add')?.addEventListener('click', () => navigate('#/capture'));
    document.getElementById('btn-export-xlsx')?.addEventListener('click', async () => {
      showLoading('Excel を作成中...');
      try {
        const count = await exportCardsToXlsx();
        hideLoading();
        alert(`${count} 件を Excel に出力しました`);
      } catch (err) {
        hideLoading();
        alert(err.message);
      }
    });
    return;
  }

  if (name === 'settings') {
    setHeader('設定', true);
    const settings = getSettings();
    app.innerHTML = renderSettings(settings);
    bindSettingsEvents();
    return;
  }

  if (name === 'capture') {
    setHeader('名刺を追加', true);
    app.innerHTML = renderCapture();
    bindCaptureEvents();
    return;
  }

  if (name === 'edit') {
    setHeader('名刺を編集', true);
    const id = parts[1];
    let card;
    let imageUrl = null;

    if (id) {
      card = await getCard(id);
      if (!card) {
        navigate('#/');
        return;
      }
      if (card.imageBlob) imageUrl = URL.createObjectURL(card.imageBlob);
    } else {
      card = draft.card;
      imageUrl = draft.imageUrl;
      if (!card || !card.imageBlob) {
        navigate('#/capture');
        return;
      }
    }

    app.innerHTML = renderEdit(card, imageUrl);
    bindEditEvents(card, imageUrl);
    requestAnimationFrame(() => window.scrollTo(0, 0));
    return;
  }

  if (name === 'detail') {
    setHeader('名刺詳細', true);
    const id = parts[1];
    const card = await getCard(id);
    if (!card) {
      navigate('#/');
      return;
    }
    const imageUrl = card.imageBlob ? URL.createObjectURL(card.imageBlob) : null;
    app.innerHTML = renderDetail(card, imageUrl);
    bindDetailEvents(card, imageUrl);
    return;
  }

  navigate('#/');
}

function bindSettingsEvents() {
  const form = document.getElementById('settings-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    saveSettings({
      claudeEnabled: document.getElementById('claude-enabled')?.checked ?? false,
      apiKey: String(fd.get('apiKey') || '').trim(),
      proxyUrl: String(fd.get('proxyUrl') || '').trim(),
    });
    alert('設定を保存しました');
    navigate('#/');
  });
}

function destroyCaptureState() {
  if (captureState?.cropApi) captureState.cropApi.destroy();
  if (captureState?.previewUrl) URL.revokeObjectURL(captureState.previewUrl);
  captureState = null;
}

function bindCaptureEvents() {
  destroyCaptureState();

  const fileInput = document.getElementById('file-input');
  const fileLabel = document.getElementById('file-label');
  const postCapture = document.getElementById('post-capture');
  const pasteOcr = document.getElementById('paste-ocr');
  const btnLivetextEdit = document.getElementById('btn-livetext-edit');
  const btnEditNoOcr = document.getElementById('btn-edit-no-ocr');
  const cropContainer = document.getElementById('crop-container');
  const cropImage = document.getElementById('crop-image');
  const cropBox = document.getElementById('crop-box');
  const btnResetCrop = document.getElementById('btn-reset-crop');
  const btnRetake = document.getElementById('btn-retake');
  const btnOcr = document.getElementById('btn-ocr');
  const ocrProgress = document.getElementById('ocr-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const ocrResult = document.getElementById('ocr-result');
  const captureFooter = document.getElementById('capture-footer');
  const btnToEdit = document.getElementById('btn-to-edit');

  let fullImageBlob = null;
  let ocrText = '';

  captureState = { cropApi: null, previewUrl: null, img: null };

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    destroyCaptureState();
    captureState = { cropApi: null, previewUrl: null, img: null };

    try {
      fullImageBlob = await fileToJpegBlob(file);
      const { img, url } = await loadImageFromFile(fullImageBlob);
      captureState.previewUrl = url;
      captureState.img = img;

      cropImage.src = url;
      fileLabel.classList.add('hidden');
      postCapture.classList.remove('hidden');
      if (pasteOcr) pasteOcr.value = '';
      ocrResult.classList.add('hidden');
      captureFooter.classList.add('hidden');
      ocrText = '';

      const setupCrop = () => {
        if (captureState.cropApi) captureState.cropApi.destroy();
        captureState.cropApi = initCropSelector(
          cropContainer,
          cropImage,
          cropBox,
          null
        );
        // 名刺の矩形を自動検出してクロップ枠を初期セット（失敗時は既定枠）
        let detected = null;
        try {
          detected = detectCardRegion(captureState.img);
        } catch (err) {
          console.warn('自動切り抜きの検出に失敗:', err);
        }
        captureState.cropApi.setRegion(detected || defaultCropRegion());
        captureState.cropApi.relayout();
      };
      cropImage.onload = setupCrop;
      if (cropImage.complete) setupCrop();
    } catch (err) {
      alert(err.message);
      fileInput.value = '';
    }
  });

  btnResetCrop?.addEventListener('click', () => {
    captureState?.cropApi?.setRegion(defaultCropRegion());
  });

  btnRetake?.addEventListener('click', () => {
    destroyCaptureState();
    fullImageBlob = null;
    ocrText = '';
    fileInput.value = '';
    cropImage.src = '';
    fileLabel.classList.remove('hidden');
    postCapture.classList.add('hidden');
    if (pasteOcr) pasteOcr.value = '';
    ocrProgress.classList.add('hidden');
    ocrResult.classList.add('hidden');
    captureFooter.classList.add('hidden');
  });

  btnLivetextEdit?.addEventListener('click', async () => {
    if (!fullImageBlob) return;
    const text = pasteOcr?.value?.trim() || '';
    if (!text) {
      alert('テキストを貼り付けてください。\n写真アプリで「テキスト認識」→ コピー した内容を使います。');
      return;
    }
    await goToEditFromCapture(fullImageBlob, text);
  });

  btnEditNoOcr?.addEventListener('click', async () => {
    if (!fullImageBlob) return;
    await goToEditFromCapture(fullImageBlob, pasteOcr?.value?.trim() || '');
  });

  async function runOcrOnCrop() {
    if (!fullImageBlob || !captureState?.img) return null;

    const region = captureState.cropApi?.getRegion() || defaultCropRegion();
    const cropped = await getCroppedBlob(captureState.img, region);
    return runOcr(cropped, (msg) => {
      progressFill.style.width = `${progressPercent(msg)}%`;
      progressText.textContent = progressLabel(msg);
    });
  }

  btnOcr?.addEventListener('click', async () => {
    if (!fullImageBlob) return;
    btnOcr.disabled = true;
    btnRetake.disabled = true;
    ocrProgress.classList.remove('hidden');
    ocrResult.classList.add('hidden');
    captureFooter.classList.add('hidden');

    try {
      const { text } = await runOcrOnCrop();
      ocrText = text;
      ocrResult.textContent = text || '（テキストが認識されませんでした）';
      ocrResult.classList.remove('hidden');
      captureFooter.classList.remove('hidden');
      captureFooter.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } catch (err) {
      ocrResult.textContent = `OCR エラー: ${err.message}`;
      ocrResult.classList.remove('hidden');
      captureFooter.classList.remove('hidden');
    } finally {
      btnOcr.disabled = false;
      btnRetake.disabled = false;
      ocrProgress.classList.add('hidden');
    }
  });

  btnToEdit?.addEventListener('click', async () => {
    if (!fullImageBlob) return;
    await goToEditFromCapture(fullImageBlob, ocrText);
  });
}

function bindEditEvents(existingCard, imageUrl) {
  const form = document.getElementById('edit-form');
  const editImage = document.getElementById('edit-image');

  editImage?.addEventListener('click', () => {
    if (imageUrl) showImageModal(imageUrl);
  });

  document.getElementById('btn-reparse-local')?.addEventListener('click', async () => {
    const raw = document.getElementById('field-raw-ocr')?.value?.trim() || '';
    showLoading('ローカルで再解析中...');
    try {
      const parsed = await structureText(raw, { preferClaude: false });
      applyParsedToForm(parsed);
    } finally {
      hideLoading();
    }
  });

  document.getElementById('btn-reparse-claude')?.addEventListener('click', async () => {
    const raw = document.getElementById('field-raw-ocr')?.value?.trim() || '';
    if (!raw) {
      alert('OCR 生テキストを入力してください');
      return;
    }
    const settings = getSettings();
    if (!settings.apiKey) {
      alert('設定画面で API キーを入力してください');
      navigate('#/settings');
      return;
    }
    showLoading('Claude で再解析中...');
    try {
      const parsed = await structureText(raw, { forceClaude: true, throwOnError: true });
      applyParsedToForm(parsed);
    } catch (err) {
      alert(`再解析に失敗しました: ${err.message}`);
    } finally {
      hideLoading();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = readEditForm(form);
    const otherField = document.getElementById('field-other');
    const other = otherField
      ? otherField.value.split('\n').map((l) => l.trim()).filter(Boolean)
      : [];
    const rawOcrText = document.getElementById('field-raw-ocr')?.value?.trim() || '';

    const card = {
      ...existingCard,
      ...formData,
      other,
      rawOcrText: rawOcrText || existingCard.rawOcrText || '',
      imageBlob: existingCard.imageBlob,
      imageThumbBlob: existingCard.imageThumbBlob,
    };

    await saveCard(card);
    revokeDraftUrl();
    draft.card = null;
    navigate('#/');
  });
}

function bindDetailEvents(card, imageUrl) {
  document.getElementById('detail-image')?.addEventListener('click', () => {
    if (imageUrl) showImageModal(imageUrl);
  });

  document.getElementById('btn-delete')?.addEventListener('click', async () => {
    if (!confirm('この名刺を削除しますか？')) return;
    await deleteCard(card.id);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    navigate('#/');
  });
}

btnBack.addEventListener('click', () => {
  if (window.history.length > 1) {
    history.back();
  } else {
    navigate('#/');
  }
});

document.getElementById('modal-close').addEventListener('click', hideImageModal);
document.querySelector('.modal-backdrop')?.addEventListener('click', hideImageModal);

window.addEventListener('hashchange', render);
window.addEventListener('load', () => {
  if (!window.location.hash || window.location.hash === '#') navigate('#/');
  else render();
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('App error:', e.reason);
});

window.addEventListener('error', (e) => {
  console.error('App error:', e.error || e.message);
});
