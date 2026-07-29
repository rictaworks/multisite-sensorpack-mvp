# 作業報告：Issue #25 E2E主要導線Playwrightテスト(全25件のissue分割 完了)

- **日付：** 2026-07-29（JST）
- **担当Issue：** [#25 [infra] E2E主要導線Playwrightテスト](https://github.com/rictaworks/multisite-sensorpack-mvp/issues/25)
- **PR：** [#50 [web] E2E主要導線Playwrightテスト (#25)](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/50)（squash mergeで`main`へマージ済み、マージコミット`303b12b`）
- **ブランチ：** `feature/issue-25-e2e-playwright`（マージ後、リモートブランチは削除済み）

## 本Issueをもって完了する全体像

Issue #25は`project-manager`によるIssue分割の最後の1件であり、依存する#9・#10・#11・#12・
#14・#15・#17〜#22はすべてマージ済みであることを`gh issue view 25`・`git pull origin main`で
確認した。本Issueのマージにより、**25件のIssue分割の全実装が完了**した
（`gh issue list --state open`が空配列であることを確認済み）。

## 目的

requirements.md 1.6の主要ユーザーフロー（ログイン→デバイス登録→ダッシュボード確認→
アラート確認→AIサマリー閲覧）を、実ブラウザ(Chromium/Playwright)で検証する
(`.claude/rules/testing.md`「Playwright — 実ブラウザでのE2E」、Edit scope：`src/web/e2e/**`)。

## 実施内容

1. **調査**：`gh issue view 25`で受け入れ条件を確認。`requirements.md`の主要フロー、
   `.claude/rules/testing.md`、`.claude/rules/environment.md`、そしてWORK/配下の
   Issue #17〜#22の作業報告を通読し、各画面の実装状況（モックAPIか実結線か、
   画面間リンクの有無、認証ガードの有無）を把握したうえで着手した。
2. **重要な事前調査（本Issue固有）**：`npx playwright install --with-deps chromium`後、
   `next dev`（Turbopack・`--webpack`の両方）でPlaywrightを使い各画面へアクセスした
   ところ、SSRのHTMLは正しく返るがクライアント側の`useEffect`・クリックハンドラが
   一切発火しない（ハイドレーションが完了しない）現象を確認した。HMR WebSocketの
   ハンドシェイクが`net::ERR_INVALID_HTTP_RESPONSE`で失敗し続けることを確認したが、
   同一のコンポーネントツリーが`next build && next start`（本番ビルド）では正しく
   ハイドレーションし、すべてのインタラクションが機能することを確認した
   （このサンドボックス環境固有の制約であり、アプリ側のコード変更は一切不要）。
   このため`playwright.config.ts`は本番ビルドを`APP_ENV=development`／
   `APP_ENV=production`の2ポートで起動する構成とした（詳細コメントを
   `playwright.config.ts`・`src/web/e2e/README.md`に記載）。
3. **実装**：`src/web/e2e/`に7つのspecファイル＋サポートモジュールを追加。
   - `login.spec.ts` / `environment-production.spec.ts`：ログイン画面の7言語表示、
     reCAPTCHA(Google公式テストキー)通過→Googleボタン実体化、
     `.claude/rules/environment.md`が要求する開発用バイパスボタンのfail-closed
     （production環境で一切描画されない）をSSR出力から検証。
   - `dashboard.spec.ts`：拠点一覧の集計値・拠点カード、デバイス詳細への実際の
     `<Link>`遷移、24h/7日間切替。
   - `device-claim.spec.ts`：バリデーションエラー・クレームコード発行・
     レート制限時のエラー表示。
   - `alerts.spec.ts`：ack操作によるタブ件数・バッジ件数の変化、解決ずみタブには
     ackボタンが出ないこと。
   - `control.spec.ts`：LED/ファンのトグル→カスタム確認ダイアログ→コマンド状態
     遷移。ネイティブ`confirm()`等が一切発火しないことをテスト自体（`page.on('dialog')`）
     で直接検証。
   - `summary.spec.ts`：生成→同日再読み込みでのクォータ済み表示・同一内容の再表示。
   - `primary-journey.spec.ts`：上記を一続きにしたholistic smoke test。
   - `e2e/support/messages.ts`：翻訳文言をロケールJSONから直接読み込み、テスト内に
     翻訳文言を二重管理しないためのヘルパー。
   - `e2e/support/recaptcha.ts`：Google公式の「常に検証を通過するテスト用
     reCAPTCHA v2キー」を使い、実際のGoogleウィジェット(iframe)を操作するヘルパー。
   - `e2e/support/claimApiStub.ts`：device-claim画面のみ実際に`fetch`する
     `/api/v1/sites`・`/api/v1/claim-codes`をPlaywrightのネットワーク層でスタブする
     ヘルパー（後述「本Issueで判明したスコープの実態」参照）。
4. **CI**：`.github/workflows/web-e2e.yml`を新設。既存`web-ci.yml`（lint+Jest、
   PR作成時・`main`へのpush時）とは分離し、実行時間が長い（ブラウザダウンロード・
   本番ビルド・複数サーバー起動）ことを踏まえてPR作成時のみ実行する
   （`.claude/rules/ci-cd.md`に基づく判断）。
5. **`jest.config.js`**：`e2e/**`をJestの収集対象から除外（Playwrightの`test`/`expect`
   グローバルとJestのそれが衝突するため）。

## 本Issueで判明したスコープの実態（正直な記載）

- **バックエンド実結線状況**：ダッシュボード／お知らせ／運用ツール／きょうのまとめの
  4画面はいずれも純粋なインメモリのモック実装で、ネットワーク呼び出しを一切行わない。
  デバイス登録画面のみ実際に`/api/v1/sites`・`/api/v1/claim-codes`へ`fetch`するが、
  Rails側の同一オリジンプロキシが未結線のため、`e2e/support/claimApiStub.ts`で
  その2エンドポイントのみPlaywrightのネットワーク層でスタブしている
  （アプリへのフォールバック実装ではなく、E2Eテストの一般的な技法）。
  したがって本E2Eスイートが検証しているのは「実際にはフロントエンド単体の
  画面遷移・表示・バリデーション」であり、Rails APIとの実結合のE2Eではない
  （後述の残課題一覧の「フロントエンドのモックAPI→実バックエンド結線」が
  解消され次第、より深いE2Eへ拡張可能）。
- **画面間の実リンク**：`HomeView`から他画面への実際の`<Link>`がまだ存在しない
  ため、本スイートの画面遷移の多くは`page.goto()`による直接遷移であり、実際の
  リンククリックではない。ダッシュボードの拠点一覧→デバイス詳細のみ、実際に
  動作している`next-intl`の`<Link>`をクリックして検証している。
- **認証ガード未実装**：`/dashboard` `/alerts` `/control` `/summary` `/devices/claim`
  はいずれも未認証でも到達可能なため、本スイートはログインを経由せず各画面へ
  直接遷移している。
- **開発環境自動認証(devBypass)ボタンの「クリック→ホーム遷移」成功パスは
  自動テストの対象外**：`next build`によりクライアントバンドルの`NODE_ENV`は
  常に`"production"`に静的埋め込みされるため、ビルド済みバンドルに対しては
  `APP_ENV`をどう設定してサーバーを起動しても、このボタンをクリックすると
  意図通り例外を送出する（`lib/auth/devAutoAuth.ts`の多層防御チェックが正しく
  機能した結果であり、アプリのバグではない）。ボタンの表示/非表示による
  fail-closed要件自体はSSR出力から確定的に検証済み。実際のクリック後の遷移
  成功は、実機での`npm run dev`実行時の手動確認、または本サンドボックス制約
  自体の解消を要する別issueのフォローアップ候補とした。

## テスト結果

```
cd src/web
npx playwright test                 # 25 passed（約47秒）
npx playwright test --repeat-each=2 # 50 passed（安定性確認のため2回実行）
npm run lint                        # 0 errors, 0 warnings
npx jest --ci                       # 28 suites / 150 tests green（既存分含む、リグレッションなし）
npx tsc --noEmit                    # e2e/** ・ playwright.config.ts由来のエラーなし
npm audit                           # 高深刻度26件（既存ベースラインと同数、新規依存起因なし）
```

CI（GitHub Actions、PR #50）：`lint-and-test`（41秒）・`e2e`（1分19秒）ともにgreen
https://github.com/rictaworks/multisite-sensorpack-mvp/pull/50/checks

## セキュリティレビュー（コミット前・`.claude/rules/testing.md`準拠）

- `.claude/QC10.md`：QC07（アクセシビリティ）＝全テストが`role`/`aria-*`ベースの
  Playwrightロケータのみを使用しており、既存コンポーネントのARIA実装を実ブラウザで
  再検証する副次効果がある。QC09（ライブラリ更新）＝`npm audit`で新規追加した
  `@playwright/test`・`dotenv`・`dotenv-cli`に起因する脆弱性がないことを確認
  （既存の高深刻度26件は不変、Issue #17〜#22と同一のベースライン）。
- `.claude/OWASP10.md`：A05（設定ミス）＝環境依存値（Google Client IDのダミー値、
  reCAPTCHAテストキー、意図的に到達不能なバックエンドURL）はすべて`.env.e2e`
  経由（`.claude/rules/testing.md`「テストコードにハードコードしない」準拠）。
  A06（脆弱ライブラリ）＝上記確認済み。A07（認証・認可）＝開発用バイパスの
  実際の悪用ではなく、fail-closed契約（production環境での非到達性）の検証のみに
  使用。
- `.claude/CC.md`：Google公式に公開されているreCAPTCHA v2テストキー
  （`developers.google.com/recaptcha/docs/faq`記載）をドキュメント通りの用途で
  使用しており、著作権・利用規約上の問題はない。AI生成コンテンツの新規追加なし。
- コーディング原則：ネイティブ`alert()`/`confirm()`/`prompt()`が一切発火しないこと
  を`control.spec.ts`で`page.on('dialog')`により直接検証。文言はロケールJSONから
  読み込み、テストコード内への翻訳文言の二重管理を避けた（`e2e/support/messages.ts`）。
- `git status`でシークレットファイル（`.env.e2e`等）が含まれていないことを確認済み
  （`.gitignore`の`.env.*`パターンで除外、コミットしたのは非シークレットの
  `e2e/e2e.env.example`テンプレートのみ）。

## 完了確認

- ローカルPlaywright：green（25 passed、`--repeat-each=2`で50 passedも確認）
- ローカルJest：green（28 suites / 150 tests、リグレッションなし）
- ローカルESLint：green（0 errors）
- CI（`web-e2e.yml`・`web-ci.yml`、PR #50）：green
- PR #50：`gh pr merge --squash`で`main`へマージ済み（マージコミット`303b12b`）。
  Issue #25は`Closes #25`により自動クローズ済み
- リモートフィーチャーブランチ：削除済み
- `gh issue list --state open`：0件（**25件のIssue分割の全実装が完了**）

## 横断的な残課題一覧（全21件のWORK/報告を通読して集約）

本Issueの担当範囲外だが、全25件のissue完了時点で残っている横断的な残課題を
以下に集約する（各issueのWORK/報告で個別に言及済みのものを重複排除・カテゴリ別に整理）。

### 1. フロントエンドのモックAPI→実バックエンド結線

| 画面 | モック/クライアントファイル | 接続すべきRailsエンドポイント（Rails側の実装状況） |
|---|---|---|
| ダッシュボード | `src/web/lib/dashboard/mockData.ts` | `GET /dashboard/sites-summary`・`/devices`・`/devices/{id}`・`/devices/{id}/telemetry-series`・`/devices/{id}/commands`（**Rails側はIssue #12で実装済み**、FE差し替え未着手） |
| 運用ツール | `src/web/components/control/mockControlApi.ts` | `POST /devices/{deviceId}/commands`（**Rails側はIssue #11で実装済み**）／`GET`・`PUT /devices/{deviceId}/automation-rule`（契約はあるがRails側未実装） |
| お知らせ | `src/web/components/alerts/alertsRepository.ts` | `GET /alerts`・`POST /alerts/{alertId}/ack`（**Rails側はIssue #15で実装済み**） |
| きょうのまとめ | `src/web/components/summary/aiSummaryClient.ts` | `GET /ai-summaries/today`・`POST /ai-summaries`（**Rails側はIssue #14で実装済み**、ただしURLプレフィックスが契約と不一致、下記2節参照） |
| デバイス登録 | `src/web/components/claim/api.ts`（実fetch、モックではない） | `GET /sites`・`POST /claim-codes`（`GET /sites`＝`listSites`はIssue #12でも未実装のまま明記されており、疎通未確認） |
| デバイス登録3ステップ目「つながりました」 | 未実装 | ESP32実クレーム検知（#8＋#23結線後の疎通確認、フォローアップissue起票予定と#19に明記） |

### 2. 契約(openapi.yaml)と実装の不一致

- **アラート種別コードの不一致**：DBシード（#6）の`alert_types.code`は
  `threshold_upper_breach`/`threshold_lower_breach`/`offline`だが、契約の
  `AlertTypeCode`列挙は`upper_breach`/`lower_breach`/`offline`。Issue #15の
  レスポンスは無変換で透過しているため未解消。
- **`Device`契約に表示名フィールドが無い**：FEは`デバイス #{id}`のフォールバック
  表示で代替（#18で明記）。契約拡張が別途必要。
- **`GET /api/alerts/unread_count`が契約外**：#15が独自追加したエンドポイントで
  openapi.yaml未定義。
- **`automation-rule`エンドポイントが契約にあるがRails側未実装**（#11のEdit
  scope外のまま）。
- **URLプレフィックスの不統一**：`/auth/session`（プレフィックスなし、#7）、
  `/api/alerts`（`/v1`なし、#15）、`/api/v1/claim-codes`（#8）、
  `/api/v1/dashboard/sites-summary`・`/api/v1/devices`（#12）、
  `/api/ai-summaries/*`（`/v1`なし、#14）と、契約の`servers`（`/api/v1`）に対し
  issueごとに不統一（#8で横断的な整理issue起票の必要性を明記）。
- **拠点(Site)CRUD が契約にあるがRails側未実装**：#12が「拠点一覧は集計表示に
  限定」と明言し、拠点自体のCRUDは意図的にスコープ外のまま。
- **`AutomationRule.manualOverrideUntil`の意味論不一致**：契約はデバイス単位の
  単一カラムだが、実際の抑止判定はアクチュエータ単位で`commands`テーブルから
  都度導出（#11の設計判断、将来的な契約拡張の余地ありと明記）。
- `openapi-typescript`生成物とFastAPI実行時OpenAPIとの自動diffチェック、Rails側の
  `committee`/`openapi_first`による自動契約検証、いずれもCI未導入（#5, #8）。

### 3. 認証ガード未実装

**フロントエンド**：`/dashboard`・`/dashboard/[deviceId]`（#18）・`/alerts`（#20）・
`/control`（#21）・`/summary`（#22）・`/devices/claim`（#19）のいずれも
`requireSession()`未適用。「ログイン導線（#17）実装後、各画面担当issueでガード
追加が必要」と#17自身の残課題にも横断的にまとめて記載されている。

**バックエンド**：
- `Api::AlertsController`（#15）が本番でも到達不能な暫定認証（development/test
  限定の`X-Debug-User-Id`ヘッダー）のまま。Issue #14時点でも「引き続き暫定
  デバッグヘッダー認証のまま」と明記され未解消（fail closedのため本番では
  全リクエスト401＝安全側ではあるが未実装）。
- reCAPTCHA siteverify未検証：Rails側`/auth/session`はトークンの必須パラメータ
  チェックのみで、Google siteverify APIへの実際の検証は未実装（#7, #17）。
- `POST /devices/{deviceId}/commands`にレート制限なし（#11）。
- `config.force_ssl`未設定（Brakeman検出、実デプロイ設定側の残課題、#7）。
- `ClaimDeviceService::RateLimiter`が単一プロセス前提のインメモリ実装
  （複数プロセススケール時はRedis等への置き換えが必要、#8）。
- 管理画面（F9、#16）のFont Awesome CDN読み込みにSRI(`integrity`属性)なし（#16）。

### 4. その他の横断的・システム的な残課題

**フロントエンド共通**
- `@types/jest`未導入によるCIスコープ外の`tsc --noEmit`型エラー（#2由来、
  #17・#18・#20・#21・#22で繰り返し指摘）。
- `npm audit`の既存high脆弱性26件（jest/eslint系devDependency、#2由来、本番
  バンドル非対象）。
- Cookie同意バナー（CC08）未実装（#17でサイト全体の横断課題として指摘）。
- CC09（AI生成物である旨の画面表示）未対応（#13, #14, #22で繰り返し指摘、
  service-manager/クライアント確認が必要）。
- 全画面共通のヘッダー・ナビゲーションコンポーネント未構築（#20で明記、
  本Issue #25のE2Eスイートが「画面間の実リンクがない」制約を受けている直接の原因）。
- 画面のピクセル単位のビジュアルスタイリング未対応（`VelioraOfficeDesignSystem`が
  実体として存在しないため、#18・#21・#22で共通して指摘、designerエージェントの
  レビュー待ち）。
- `middleware.ts`→`proxy.ts`移行未対応（Next.js 16非推奨警告、next-intl側対応待ち）。

**Rails API（`src/api`）横断**
- 閾値ブリーチ・オフラインアラートのseverityが仮に`warning`固定（#9, #10）。
- `OfflineDetectionJob`・`HourlyAggregationJob`・`RawDataPurgeJob`の実際の
  スケジューリング（cron/solid_queue recurring）が未設定（#10, #12、`TASKS/`への
  起票が必要）。
- 重複seq／値域外テレメトリ受信時は`last_seen_at`更新等を実行しない設計のため、
  再送頻発デバイスの誤オフライン判定リスク（#9）。

**FastAPI/AI（`src/ai`）横断**
- LangSmithダッシュボードの実際の確認は本番稼働後（#3, #13）。
- FastAPI呼び出し失敗時（502 `ai_service_unavailable`）の実ネットワーク障害挙動は
  E2E環境での確認が必要（#14。本Issue #25のスイートはモッククライアントのみを
  対象としており、この経路は未カバー）。

**ファームウェア（`src/firmware`）横断**
- ファームウェア向けCI（GitHub Actions）が#4時点から一貫して未整備（#4, #23, #24）。
- クレームAPIのルートCA証明書が未設定（本番ドメイン確定後に設定、fail closed
  実装自体は完了済み、#23, #24）。
- APモードのセットアップパスワードが固定テンプレート値のまま（#23）。
- APモード設定画面の7言語対応が未実施（#23）。
- テレメトリ送信失敗時のストア&フォワードなし、Wi-Fi切断時の能動的再接続ロジック
  未実装（#24）。
- 実機での動作確認は一貫してこのリポジトリのスコープ外（Claude Desktop側、#4, #23, #24）。

### 5. 本Issue(#25)固有で新たに判明した残課題

- **このサンドボックス開発コンテナでは`next dev`のPlaywrightハイドレーションが
  機能しない**：`next build && next start`で回避しているが、根本原因（HMR
  WebSocketハンドシェイク失敗）自体は未解決。実機ローカル環境やGitHub Actions
  ランナーでは問題なく動作する可能性が高いが、確証はない（CI上では本番ビルド
  戦略のまま実行し、実際にgreenであることをPR #50のCIで確認済み）。
- **開発環境自動認証ボタンの「クリック→ホーム遷移」成功パスが自動テスト化
  できていない**：上記「本Issueで判明したスコープの実態」参照。
- 本E2Eスイートは「フロントエンド単体の画面遷移・表示・バリデーション」の検証に
  とどまり、Rails APIとの実結合を検証するものではない。1節の「フロントエンドの
  モックAPI→実バックエンド結線」が進むにつれて、このE2Eスイートを段階的に
  実結線後のシナリオへ拡張していくフォローアップが必要。
