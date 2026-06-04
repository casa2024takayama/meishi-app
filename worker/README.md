# Claude プロキシ（Cloudflare Workers）

GitHub Pages 上のアプリから Claude API を呼ぶための CORS プロキシです。  
**API キーは Worker に保存しません。** iPhone のアプリ設定からリクエストごとに送られます。

## 前提

- [Cloudflare](https://dash.cloudflare.com/) アカウント（無料枠で可）
- [Anthropic](https://console.anthropic.com/) で API キー取得

## 方法 A: ターミナル（wrangler・推奨）

### 1. Node.js と wrangler を用意

```bash
npm install -g wrangler
```

### 2. Cloudflare にログイン

```bash
wrangler login
```

ブラウザが開くので Cloudflare アカウントで認証します。

### 3. デプロイ

```bash
cd ~/Projects/meishi-app/worker
wrangler deploy
```

成功すると URL が表示されます。例:

```
https://meishi-claude-proxy.<あなたのサブドメイン>.workers.dev
```

### 4. 動作確認（Mac ターミナル）

```bash
curl -X POST "https://meishi-claude-proxy.<サブドメイン>.workers.dev/api/structure" \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"sk-ant-...","text":"株式会社テスト\n山田太郎\n03-1234-5678"}'
```

`fields` を含む JSON が返れば OK です。

---

## 方法 B: Cloudflare ダッシュボード（CLI なし）

1. https://dash.cloudflare.com/ → **Workers & Pages** → **Create**
2. **Create Worker** → 名前例: `meishi-claude-proxy`
3. **Edit code** で [`claude-proxy.js`](claude-proxy.js) の内容をすべて貼り付け → **Save and deploy**
4. 表示された URL + `/api/structure` がプロキシ URL  
   例: `https://meishi-claude-proxy.<account>.workers.dev/api/structure`

---

## iPhone アプリ側の設定

1. Safari で https://casa2024takayama.github.io/meishi-app/ を開く
2. **設定**
3. **Anthropic API キー**: `sk-ant-...` を入力
4. **プロキシ URL**: 上記 Worker の URL + `/api/structure`
5. **Claude で項目を自動入力** を ON → **保存**
6. 名刺追加 → Live Text でコピー → 貼り付け → **標準OCRのテキストで編集へ**

## よくあるエラー

| 症状 | 対処 |
|---|---|
| `Failed to fetch` | プロキシ URL の末尾が `/api/structure` か確認。Worker がデプロイ済みか確認 |
| `apiKey and text are required` | 設定で API キーを保存したか、貼り付けテキストが空でないか確認 |
| `Anthropic API error` | API キー・残高・権限を Anthropic コンソールで確認 |
| CORS エラー | Worker コードが最新版か（OPTIONS 対応あり） |

## ローカル開発（Mac + python サーバー）の場合

GitHub Pages ではなく `http://192.168.x.x:8080` で試すときは、Worker の代わりに Mac 上で:

```bash
cd ~/Projects/meishi-app
node proxy/server.js
```

プロキシ URL: `http://<MacのIP>:8787/api/structure`
