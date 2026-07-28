# 作業報告：Issue #8 [api] F1 デバイス登録(クレームコード方式)バックエンド

- **日付：** 2026-07-28（JST）
- **担当Issue：** [#8 [api] F1 デバイス登録(クレームコード方式)バックエンド](https://github.com/rictaworks/multisite-sensorpack-mvp/issues/8)
- **PR：** [#40 feat(api): F1 クレームコード方式のデバイス登録APIを実装](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/40)
- **ブランチ：** `feature/issue-8-claim-registration`
- **Depends on：** #6（マージ済み、DBスキーマ・マスタデータ）、#5（マージ済み、OpenAPI契約）

## 目的

requirements.md 1.6 F1 `claim_device` に基づき、クレームコード発行・ESP32からの照合・デバイス作成のロジックを実装する。`src/shared/contracts/openapi.yaml` の `issueClaimCode`（`POST /claim-codes`）・`claimDevice`（`POST /devices/claim`）の2エンドポイントに準拠する。

## 実施内容（TDD：plan→red→coding→green）

1. **plan**：requirements.md 1.9 Dカテゴリ8ケース（正常/期限切れ/誤コード5回失効/使用済み再利用/他ユーザー横取り/reCAPTCHA失敗/同時クレーム/削除後再登録）と、シーケンス図4.1・ER図のfail_count/expires_at/used_atの意味を先に言語化した。
2. **red**：`spec/models/claim_code_spec.rb`・`spec/models/device_spec.rb`への追加、`spec/services/claim_device_service_spec.rb`・`spec/requests/api/claim_codes_spec.rb`・`spec/requests/api/device_claims_spec.rb`（いずれも新規）を先に作成し、`ClaimDeviceService`未実装等により`NameError`で失敗することを確認。
3. **coding**：
   - `src/api/app/models/claim_code.rb`：`issue!`（発行）、`generate_unique_code`（8桁英数字・重複回避）、`expired?`/`used?`/`exhausted?`/`usable?`（状態判定）、`register_failure!`/`mark_used!`を追加。コード形式(`/\A[A-Z0-9]{8}\z/`)のバリデーションを追加。
   - `src/api/app/models/device.rb`：`digest_for_token`（SHA-256でトークンをハッシュ化）、`provision_for_site!`（provisioning状態のdevice作成＋長寿命トークン発行、`[device, raw_token]`を返す）を追加。**Issue #10（オフライン検知）が同じファイルを編集済みでrebase時にコンフリクトが発生したため、両方の変更（`STATUS_*`定数・`offline_deadline_at`等 と 本Issueの`TOKEN_BYTES`・`provision_for_site!`等）を統合して解消した。**
   - `src/api/app/services/claim_device_service.rb`（新規）：クレーム照合のコアロジック。`ClaimCode#with_lock`による行ロックで同時クレームを直列化し、失敗系(`register_failure!`)・成功系(`mark_used!`)は必ずコミットさせるため、トランザクション内では例外を投げず`outcome`ハッシュとして返し、トランザクション確定後に例外化する設計にした（最初の実装ではトランザクション内で直接raiseしていたためfail_count加算がロールバックされるバグがあり、redテストで検出して修正）。IP単位のレート制限は`ClaimDeviceService::RateLimiter`（クラス内にカプセル化したスライディングウィンドウ、単一Pumaプロセス前提）で実装。
   - `src/api/app/controllers/api/claim_codes_controller.rb`（新規）：コード発行。reCAPTCHA検証（テスト用トークン`test-recaptcha-success`、本番はENV経由のシークレットキーでGoogle siteverify APIを呼び出す）、IP単位レート制限（429）を実装。
   - `src/api/app/controllers/api/device_claims_controller.rb`（新規）：ESP32からのクレーム照合。`ClaimDeviceService`の例外をHTTPステータス・`Error`スキーマにマッピング。
   - `src/api/config/routes.rb`：`openapi.yaml`の`servers`（`/api/v1`）に合わせ、`scope "api/v1", module: "api"`で`POST /claim-codes`・`POST /devices/claim`を追加。
   - **Issue #7（Google OAuth・テナント分離基盤）が並行してマージされたため、`claim_codes_controller.rb`を`Authenticatable`/`TenantScoped` concern（`current_user`・`authorize_owner!`）を使う形にリファクタリングした。** 詳細は後述の「Issue #7統合」を参照。
   - `config/locales/{ja,en,fr,zh,ru,es,ar}.yml`：`rate_limited`/`recaptcha_failed`/`claim_code_not_found`/`claim_code_expired`/`claim_code_used`/`claim_code_locked`のエラーメッセージキーを7言語ぶん追加（i18n.md準拠、`code`はNext.js側のi18n解決キーとして・`message`はRails側I18nの人間可読文言として両立させる設計。CONTRACT.md「エラーレスポンスの形状」参照）。
4. **green**：`bundle exec rspec` → **172 examples, 0 failures**（本Issue分29件、#7・#10・#15までの既存143件も引き続きgreen）。

## Issue #7統合（並行実装との合流）

当初、Issue #7（Google OAuth・テナント分離基盤）は本Issueの依存関係ではなく未実装だったため、`POST /claim-codes`の認証を`X-User-Id`ヘッダによる暫定ブリッジ（`bridge_current_user`、production環境では常に401でfail closed）として実装していた。作業中に#7が並行してマージされたため、`main`への2度目のrebase時に以下のリファクタリングを行った。

- `Api::ClaimCodesController`に`include Authenticatable`・`include TenantScoped`を追加し、暫定ブリッジを削除。
- 拠点の所有チェックを自前実装（`user.sites.find_by`）から`authorize_owner!(Site.find(claim_code_params[:siteId]))`に置き換え。これにより「存在しない拠点」は404（`ActiveRecord::RecordNotFound`）、「他ユーザー所有の拠点」は403と、CONTRACT.mdの区分どおりに整理された（従来は両方403にまとめていたため、この統合はより正確な実装への改善でもある）。
- `claim_codes_spec.rb`のログイン方法を、`X-User-Id`ヘッダから実際の`POST /auth/session`（`GoogleIdTokenVerifier`をスタブ）に置き換え（`tenant_scoping_spec.rb`の`login_as`パターンを踏襲）。
- ルーティング（`routes.rb`）は、#7（`post "auth/session"`等、プレフィックスなし）・#15（`namespace :api`、`/api/alerts`）とも共存させつつ、本Issueの2ルートは`/api/v1`配下に維持した。**理由：** 既に並行マージされたIssue #19（web側のデバイス登録UI）の`src/web/components/claim/api.ts`が`API_BASE_PATH = '/api/v1'`で`/api/v1/claim-codes`を直接fetchする実装を含んでおり、これが実際にフロントエンドと繋がる契約になっているため。一方で#15の`/api/alerts`はopenapi.yamlの`servers`（`/api/v1`）と厳密には食い違っており、このプレフィックスの不整合はissue横断の整理が必要（残課題に記載）。

## テスト結果

```
cd src/api
bundle exec rspec
# => 172 examples, 0 failures
```

requirements.md 1.9 Dカテゴリ（デバイス登録・8ケース）の対応：

| ケース | 検証箇所 |
| --- | --- |
| 正常 | `claim_device_service_spec.rb`・`device_claims_spec.rb`・`claim_codes_spec.rb` |
| 期限切れ | `claim_device_service_spec.rb`（`claim_code_expired`、fail_count加算を確認） |
| 誤コード5回失効(総当たり対策) | `claim_device_service_spec.rb`（5回失敗後`exhausted?`true、6回目は`claim_code_locked`） |
| 使用済み再利用 | `claim_device_service_spec.rb`・`device_claims_spec.rb`（`claim_code_used`、新規device未作成を確認） |
| 他ユーザー横取り | `claim_codes_spec.rb`（他ユーザーでログインし`siteId`指定で403 forbidden、TenantScoped concernによるテナント分離） |
| reCAPTCHA失敗 | `claim_codes_spec.rb`（429 recaptcha_failed） |
| 同時クレーム | `claim_device_service_spec.rb`（同一コードへの2回目の呼び出しが`claim_code_used`で失敗し、deviceは1件のみ作成されることを確認。SQLite＋トランザクショナルフィクスチャの制約上、真のマルチスレッド・マルチコネクションでの競合は再現できないため、`with_lock`による排他制御の結果整合性を逐次呼び出しで検証） |
| 削除後再登録 | `claim_device_service_spec.rb`（論理削除済みdeviceを残したまま新しいclaim_codeで新device作成、旧deviceの`deleted`はtrueのまま） |

加えてIP単位レート制限（発行・照合双方）、未認証・存在しない拠点（404）のテストを追加。

## セキュリティレビュー（コミット前・`.claude/rules/testing.md`準拠）

- `.claude/QC10.md`：バックエンドAPIのみでUIを持たないため大半の項目は非該当。QC10（エラーハンドリング）は`Error`スキーマ(`{error:{code,message}}`)への統一とHTTPステータスの適切な使い分けで対応。
- `.claude/OWASP10.md`：
  - A01（アクセス制御）：Issue #7の`TenantScoped#authorize_owner!`により拠点の所有チェックを行い、他ユーザーの拠点へのコード発行を403で拒否（テナント分離、「他ユーザー横取り」テストで確認）。自前のテナント分離ロジックを再実装しない方針に統一。
  - A02（暗号化の失敗）：デバイストークンは生値をDBに保存せずSHA-256ダイジェストのみ保存（高エントロピーなランダムトークンのため辞書攻撃耐性は十分と判断。パスワードのような低エントロピー値ではないためbcrypt等の低速ハッシュは不要と判断）。
  - A04（セキュアでない設計）：reCAPTCHA・IP単位レート制限・5回失敗即時失効・行ロックによる同時クレーム対策の多層防御を実装。
  - A05（設定ミス）：reCAPTCHAシークレットキーは`ENV.fetch("RECAPTCHA_SECRET_KEY")`（未設定なら例外、デフォルト値へのフォールバックなし）。
  - A06（脆弱・古いライブラリ）：新規gemは追加せず（`bundle exec bundler-audit check --update` → 脆弱性0件）。
  - A07（認証・認可の欠陥）：Issue #7の`Authenticatable`（本番でのfail closedは#7自身のテストスイートで保証済み）に認証を委譲し、本Issueで独自の認証機構を持たない設計に統一。
  - A09（ログ・監視不足）：`ClaimDeviceService`にレート制限超過・不正コード・判定結果のログ出力を追加（生のクレームコード自体はログに残さない設計）。
  - `bundle exec brakeman --quiet --no-pager --exit-on-warn --exit-on-error` → 警告0件、`bundle exec rubocop` → 規約違反0件（98ファイル全体）。
- `.claude/CC.md`：法務・表示義務系の項目はバックエンド処理のため非該当。
- `git status`でシークレットファイル（`config/master.key`、`.env`等）が含まれていないことを確認。

## 完了確認

- ローカルRSpec：green（172 examples, 0 failures）
- Rubocop／Brakeman／bundler-audit：いずれもクリーン
- CI（`api-ci.yml`）：green（PR #40の`rspec`チェック）
- PR #40：`gh pr merge --squash`で`main`へマージ済み

## 残課題（本Issueのスコープ外・今後のIssue向け）

- **URLプレフィックスの不整合：** Issue #7（`/auth/session`、プレフィックスなし）・Issue #15（`/api/alerts`、`/v1`なし）・本Issue（`/api/v1/claim-codes`）で、Rails側のルーティングプレフィックスがissueごとにばらついている。Issue #19（web）の実装が`/api/v1/...`を前提にfetchしているため、本Issueではその実績に合わせたが、`/api/v1`への統一（または本番プロキシ層での吸収方針の明文化）を横断的に整理する別issueの起票が必要。
- レート制限は単一Pumaプロセス前提のプロセス内メモリ実装（`ClaimDeviceService::RateLimiter`）。複数プロセス・複数台にスケールする場合はRedis等の共有ストアへの置き換えが必要（architecture.md「規模に応じた拡張」）。
- `CONTRACT.md`が推奨する`committee`/`openapi_first`によるOpenAPIスキーマの自動検証は本Issueでは未導入（レスポンス形状はRSpecでのキー単位アサートのみ）。
- ダッシュボードの「デバイス追加」画面（reCAPTCHA表示・コード表示UI）はIssue #19（web側、マージ済み）で対応済み。本IssueのAPIとの結合テスト（実際のフロントエンド経由での疎通確認）は未実施。
