# 名刺管理 Web アプリ

iPhone Safari 向けの名刺管理 Web アプリ（Phase 1〜2 + Phase 4 Claude 構造化）。

## 開発環境（Mac）

### 1. 静的ファイルサーバー（必須）

```bash
cd ~/Projects/meishi-app
python3 -m http.server 8080 --bind 0.0.0.0
```

- Mac: http://localhost:8080
- iPhone（同一 Wi-Fi）: http://\<MacのIP\>:8080

```bash
ipconfig getifaddr en0
```

### 2. Claude プロキシ（Phase 4・Claude 利用時のみ）

Safari から Anthropic API を直接呼べないため、Mac 上でプロキシを起動します。

```bash
cd ~/Projects/meishi-app
node proxy/server.js
```

- 待ち受け: http://0.0.0.0:8787/api/structure
- iPhone の設定画面でプロキシ URL を `http://<MacのIP>:8787/api/structure` に指定

## iPhone 実機テスト

### 推奨フロー（精度重視）

1. このアプリで名刺を撮影
2. **写真アプリ**で同じ写真を開く → **テキスト認識** → **コピー**
3. アプリに戻り、貼り付け欄にペースト
4. **標準OCRのテキストで編集へ**

### Claude 構造化（Phase 4）

1. 一覧 → **設定**
2. Anthropic API キーを入力
3. プロキシ URL を設定（上記）
4. **Claude で項目を自動入力** を ON → 保存
5. 標準 OCR のテキストで編集へ → 項目が自動入力される
6. 編集画面で **Claudeで再解析** / **ローカルで再解析** を比較

### チェックリスト

- [ ] 設定保存ができる
- [ ] Claude ON + プロキシ起動で編集画面に項目が入る
- [ ] Claude OFF でローカル（正規表現）のみ動作
- [ ] プロキシ停止時はローカルにフォールバック
- [ ] 保存後、一覧・詳細に反映される

## ファイル構成

```
meishi-app/
├── index.html
├── css/style.css
├── js/
│   ├── app.js
│   ├── claude.js      # Claude 構造化 + フォールバック
│   ├── settings.js    # localStorage 設定
│   ├── parser.js
│   └── ...
├── proxy/
│   └── server.js      # CORS プロキシ（開発用）
└── README.md
```

## GitHub Pages に公開する

このアプリは **静的ファイルのみ** のため GitHub Pages にそのまま載せられます。

### 手順

1. GitHub にリポジトリを作成（例: `meishi-app`）
2. このフォルダを push

```bash
cd ~/Projects/meishi-app
git init
git add .
git commit -m "Initial commit: meishi app"
git branch -M main
git remote add origin https://github.com/casa2024takayama/meishi-app.git
git push -u origin main
```

公開 URL: **https://casa2024takayama.github.io/meishi-app/**

3. GitHub → **Settings → Pages**
   - Source: **GitHub Actions**（`.github/workflows/pages.yml` が自動デプロイ）
   - または Deploy from branch: `main` / `/ (root)`

4. 公開 URL:
   - https://casa2024takayama.github.io/meishi-app/

### GitHub Pages で動くもの / 動かないもの

| 機能 | GitHub Pages |
|---|---|
| 撮影・保存・一覧・編集 | 動く（HTTPS のため `crypto.randomUUID` も可） |
| iPhone 標準 OCR + 貼り付け | 動く |
| ローカル正規表現 parser | 動く |
| Tesseract（アプリ内 OCR） | 動く（CDN から読み込み） |
| Claude 構造化 | **Mac プロキシは不可** → Cloudflare Worker を使う |

### Claude を GitHub Pages で使う

Mac の `proxy/server.js` は Pages では動きません。**Cloudflare Workers** にプロキシをデプロイします。

**詳細手順:** [`worker/README.md`](worker/README.md)

#### 最短手順

```bash
npm install -g wrangler
wrangler login
cd ~/Projects/meishi-app/worker
wrangler deploy
```

表示された URL の末尾に `/api/structure` を付けて、アプリの **設定 → プロキシ URL** に入力します。

例: `https://meishi-claude-proxy.<あなた>.workers.dev/api/structure`

あわせて [Anthropic Console](https://console.anthropic.com/) の API キーを **設定 → Anthropic API キー** に保存し、**Claude で項目を自動入力** を ON にします。

### ローカル開発との違い

- **Mac の python サーバーは不要**（Pages が HTTPS で配信）
- iPhone は `https://<ユーザー名>.github.io/meishi-app/` をブックマークするだけで OK
- データは各端末の IndexedDB に保存（端末間同期は Phase 3 の Excel 予定）

## 注意

- `file://` 直開きは不可。HTTP/HTTPS サーバー経由でアクセス
- Claude 利用時は名刺テキストが Anthropic に送信されます
- API キーは iPhone の localStorage にのみ保存（プロキシ・Worker に保存しません）
