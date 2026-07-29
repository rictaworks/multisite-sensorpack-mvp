# E2E (Playwright) — Issue #25

実ブラウザ(Chromium)で主要導線を検証する Playwright テスト一式(`.claude/rules/testing.md`
「Playwright — 実ブラウザでのE2E(ログイン・画面遷移などの主要導線)」)。

## 対象と受け入れ条件との対応

Issue #25 の作業指示にある主要導線を、それぞれ以下のファイルでカバーする。

| 画面/導線 | ファイル |
|---|---|
| トップページ→ログイン画面表示 | `login.spec.ts` |
| 開発環境自動認証(devBypassボタン)の表示・fail-closed | `login.spec.ts` / `environment-production.spec.ts` |
| ダッシュボード(拠点一覧・デバイス詳細・24h/7d切替) | `dashboard.spec.ts` |
| デバイス登録画面の入力・バリデーション | `device-claim.spec.ts` |
| お知らせ(アラート)一覧・ack | `alerts.spec.ts` |
| 運用ツール(遠隔制御・自動ルール) | `control.spec.ts` |
| きょうのまとめ(AI日次サマリー) | `summary.spec.ts` |
| 上記を通しでつなげた確認 | `primary-journey.spec.ts` |

## スコープに関する重要な注記(正直に記載)

- **バックエンド実結線が未完了の画面**: `dashboard` / `alerts` / `control` / `summary` は
  いずれも純粋なインメモリのモック実装(ネットワーク呼び出しなし)。`device-claim`
  画面のみ実際に `/api/v1/sites` と `/api/v1/claim-codes` へ`fetch`するが、Rails側の
  同一オリジンプロキシがまだ結線されていない(Issue #19以降の全WORK/報告に記載済みの
  既知の残課題)。このスイートでは `device-claim.spec.ts` / `primary-journey.spec.ts` が
  `e2e/support/claimApiStub.ts` によって、その2エンドポイントだけを Playwright の
  ネットワーク層でスタブしている。これはアプリ側にフォールバックを実装したのではなく、
  E2Eテストの一般的な技法(バックエンド未接続箇所のネットワーク層スタブ)である。
- **画面間の実リンクがまだ存在しない**: `HomeView` から `/login` 等への実際の
  `<Link>` はまだ実装されていない(共通ヘッダー・ナビゲーションの導入は
  Issue #18〜#22 のいずれのWORK/報告でも「別issueでの検討を推奨」とされている
  既知の残課題)。そのため本スイートの画面遷移の多くは `page.goto()` による直接遷移で
  あり、実際のリンククリックではない。ダッシュボードの拠点一覧→デバイス詳細のみ、
  実際に動作している `next-intl` の `<Link>` をクリックして検証している
  (`dashboard.spec.ts`)。
- **認証ガードが未実装**: `/dashboard` `/alerts` `/control` `/summary` `/devices/claim`
  はいずれも未認証でも到達可能(`requireSession`等のガードが未実装。Issue #17以降の
  各WORK/報告に記載済みの既知の残課題)。したがって本スイートはログインを経由せず
  各画面へ直接遷移している。
- **開発環境自動認証(devBypass)ボタンの「クリック→ホーム遷移」成功パスは未検証**:
  `playwright.config.ts` の冒頭コメントに詳細を記載しているが、`next dev` はこの
  開発コンテナのサンドボックス環境でPlaywrightからハイドレーションが確認できず
  (HMR WebSocketのハンドシェイクが `net::ERR_INVALID_HTTP_RESPONSE` で失敗し、
  `useEffect`やクリックハンドラが一切発火しない)、本スイートは代わりに
  `next build && next start`(本番ビルド)で全プロジェクトを配信している。一方で
  `lib/auth/devAutoAuth.ts` のクライアント側再チェックは `process.env.NODE_ENV`
  (Next.jsがビルド時にクライアントバンドルへ静的に埋め込む値、`next build`では常に
  `"production"`)を参照するため、ビルド済みバンドルに対しては `APP_ENV` を
  どう設定してサーバーを起動しても、ボタンをクリックすると意図した通り例外を
  送出して失敗する(これは設計上のfail-closedの副作用であり、アプリのバグではない)。
  そのため本スイートでは「`APP_ENV=development`のときのみボタン自体がSSRで
  描画される」ことと「`APP_ENV=production`のときは一切描画されない」ことを検証し
  (`.claude/rules/environment.md`が要求するfail-closed要件そのもの)、実際の
  クリック後の遷移成功は検証対象から外している。実機での`npm run dev`実行時の
  手動確認、またはこのサンドボックス制約自体の解消は別issueのフォローアップ候補。

## ローカルでの実行方法

```bash
cd src/web
cp e2e/e2e.env.example .env.e2e   # 初回のみ。値はすべて非シークレット(詳細はファイル内コメント参照)
npx playwright install --with-deps chromium   # 初回のみ
npm run test:e2e
```

`npm run test:e2e` は `pretest:e2e`(`next build`)を自動実行してから
`playwright test` を実行する。`playwright.config.ts` が本番ビルドを
`APP_ENV=development` / `APP_ENV=production` それぞれのポートで2つ起動し、
`environment-production.spec.ts` のみ後者に対して実行される。

失敗時のトレース/スクリーンショット/動画は `test-results/`、HTMLレポートは
`playwright-report/`(いずれも`.gitignore`対象)に出力される。

```bash
npx playwright show-report   # 直近の実行結果をブラウザで確認
```

## CIでの実行方法

`.github/workflows/web-e2e.yml`(このIssueで新設)が、`src/web/**` に変更のある
プルリクエスト作成時に実行する。既存の `web-ci.yml`(lint + Jest、PR作成時・
`main`へのpush時)とは別ワークフローに分離した。理由:

- Playwrightはブラウザダウンロード・本番ビルド・複数サーバー起動を伴い
  `web-ci.yml`(数十秒)より実行時間が長い(`.claude/rules/ci-cd.md`「実行時間が
  長い場合はPR時のみ実行等の判断も可」を踏まえ、`main`へのpush時には実行しない)。
- 既存のCIジョブが失敗した場合の切り分けを容易にするため。
