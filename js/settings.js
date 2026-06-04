const STORAGE_KEY = 'meishi_settings';

export function getDefaultProxyUrl() {
  const { protocol, hostname } = window.location;
  // GitHub Pages では Mac ローカルプロキシは使えない
  if (hostname.endsWith('github.io')) {
    return '';
  }
  // ローカル開発（python http.server）向け
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:8787/api/structure`;
  }
  // LAN 上の Mac（例: 192.168.x.x:8080 で配信）
  return `${protocol}//${hostname}:8787/api/structure`;
}

export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      claudeEnabled: Boolean(parsed.claudeEnabled),
      apiKey: parsed.apiKey || '',
      proxyUrl: parsed.proxyUrl || getDefaultProxyUrl(),
    };
  } catch {
    return {
      claudeEnabled: false,
      apiKey: '',
      proxyUrl: getDefaultProxyUrl(),
    };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      claudeEnabled: Boolean(settings.claudeEnabled),
      apiKey: settings.apiKey || '',
      proxyUrl: settings.proxyUrl || getDefaultProxyUrl(),
    })
  );
}
