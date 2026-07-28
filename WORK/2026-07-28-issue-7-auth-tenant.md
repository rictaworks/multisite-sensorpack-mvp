# 作業報告：Issue #7 Googleログイン認証・テナント分離基盤

- **日付：** 2026-07-28（JST）
- **担当Issue：** [#7 [api] 認証(Google OAuth)・テナント分離基盤](https://github.com/rictaworks/multisite-sensorpack-mvp/issues/7)
- **PR：** [#41 feat(api): Googleログイン認証・テナント分離基盤 (#7)](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/41)（squash merge済み、`main`へマージ、マージコミット`26345a6`）
- **ブランチ：** `feature/issue-7-auth-tenant`（マージ後にリモート削除済み）
- **Depends on：** #6（マージ済み、DBスキーマ・users.google_sub）

## 目的

Googleログイン(OAuth2/OIDC)によるセッション確立と、全クエリにユーザーIDを必須付与するテナント分離の仕組みを整備する。以降の全リソースコントローラー(#8/#10/#15等)が共通で`include`して使う基盤。

## 実施内容（TDD：plan→red→coding→green）

1. **plan**：受け入れ条件を「`current_user`がGoogleログインで解決できDBには`google_sub`のみ保存される」「他ユーザーのデータへ構造的にアクセスできないことを検証するリクエストスペックがある」「development限定の自動認証バイパスがproduction/testでは絶対に到達しないことをテストで保証する」の3点に言語化。
2. **red**：先に以下のスペックを作成し、対象クラスが存在せず`NameError`で失敗することを確認。
   - `spec/services/google_id_token_verifier_spec.rb`
   - `spec/requests/sessions_spec.rb`
   - `spec/requests/tenant_scoping_spec.rb`
   - `spec/requests/development_bypass_spec.rb`
3. **coding**：
   - `app/services/google_id_token_verifier.rb`：Google IDトークンを検証しopaqueな`sub`のみ取り出す。JWT署名検証・JWKS取得はGoogle公式の`googleauth` gem (`Google::Auth::IDTokens.verify_oidc`) に委譲し、独自実装(車輪の再発明)を避けた。
     - Issue記載の「omniauth-google-oauth2」は、Next.js側で既にOAuth/OIDCフローが完結しIDトークンをRailsへ渡す構成(サーバー主導のリダイレクトフローではない)には適合しないため不採用とし、`Gemfile`・`config/initializers/omniauth_google.rb`にその判断理由を明記した。
   - `app/controllers/concerns/authenticatable.rb`：`session_id`という暗号化cookie(`cookies.encrypted`、httpOnly・Secure(production)・SameSite=Lax)から`current_user`を解決。development限定の自動認証バイパスは`Rails.env.development?`のみで判定(単一の情報源)し、本番UIへの露出経路も一切実装していない。
   - `app/controllers/concerns/tenant_scoped.rb`：`authorize_owner!`でレコード所有者(`#user`または`#site.user`)を検証し、他ユーザー所有なら403、レコード不存在なら404を返す(`rescue_from`で一元化)。
   - `app/controllers/sessions_controller.rb`：`POST/GET/DELETE /auth/session`(`src/shared/contracts/openapi.yaml`準拠)。
   - `config/application.rb`・`app/controllers/application_controller.rb`：APIモードで既定除外される`ActionDispatch::Cookies`を有効化。
   - `config/locales/{ja,en,fr,zh,ru,es,ar}.yml`：認証エラーメッセージを7言語で外部化(i18n.md準拠)。
4. **green**：`bundle exec rspec` → **143 examples, 0 failures**(#7分は31examples、マージ後の#8/#10/#15分含め全体で143)。

## テスト結果

```
cd src/api
bundle exec rspec
# => 143 examples, 0 failures
bundle exec rubocop
# => 92 files inspected, no offenses detected
bundle exec brakeman --quiet --no-pager --exit-on-warn --exit-on-error
# => Security Warnings: 0
bundle exec bundler-audit check --update
# => No vulnerabilities found
```

- `spec/requests/sessions_spec.rb`：ログイン成功時に`google_sub`のみ保持したUserレコードが作成されること(カラムが`id, google_sub, created_at, updated_at`のみ)、既存ユーザーの重複作成なし、IDトークン不正時401、必須パラメータ欠落時400、ログアウト後401を検証。
- `spec/requests/tenant_scoping_spec.rb`：一時的なプローブコントローラー(`TenantScopingProbeController`/`TenantScopingDeviceProbeController`)を使い、Site(`#user`)・Device(`#site.user`)双方の所有者解決パターンで、未認証401・所有者本人200・他ユーザー403・存在しないID404・他ユーザーアクセスによるレコード非改変を検証。実運用の`SitesController`等は#8/#10/#15が別途実装するため、この基盤の振る舞いのみを検証する構成とした。
- `spec/requests/development_bypass_spec.rb`：`Rails.env`をdevelopment/test/productionへ一時的に切り替え、**production環境では開発用バイパスが絶対に機能せず401のままであること**を明示的に検証(environment.md準拠)。

## セキュリティレビュー（コミット前・`.claude/rules/testing.md`準拠）

`.claude/OWASP10.md`の該当項目を確認：

- **A01(アクセス制御の不備)**：`TenantScoped#authorize_owner!`で所有者チェックを一元化。未知の所有者解決パターンは`NotImplementedError`で即座に失敗させ、fail openを防止。
- **A02(暗号処理)**：セッションはRails標準の`cookies.encrypted`(AES-GCM)。独自の署名/暗号化実装なし。
- **A03(インジェクション)**：生SQL不使用。`params.permit`で許可リスト化。
- **A05(セキュリティ設定ミス)**：development限定バイパスは`Rails.env.development?`のみで判定し、クライアントから切り替え可能なパラメータは存在しない。production環境で`GOOGLE_OAUTH_CLIENT_ID`未設定なら起動時に例外(fail fast)。
- **A06(脆弱・古いライブラリ)**：`bundler-audit`で脆弱性0件。Google公式・保守されている`googleauth`を採用。
- **A07(認証・認可の欠陥)**：セッションは検証成立後のみ発行。cookieはhttpOnly・Secure(production)・SameSite=Lax(クロスサイトfetch/フォームPOSTでcookieが送信されないためCSRF対策としても機能する設計とした)。
- **A09(ログ・監視不足)**：認証成功/失敗・テナント分離違反・開発バイパス発動をRails.loggerに記録。Google sub値はログ上部分マスクのみ(生値は出力しない)。
- `.claude/CC.md` CC04(個人情報保護)：DBにはgoogle_subのみ保持し、メール・氏名等は保存しないことをスペックで検証。
- `git status`でシークレットファイル(`config/master.key`、`.env`等)が含まれていないことを確認済み。

## 完了確認

- ローカルRSpec：green（143 examples, 0 failures、うち#7分は#6以前の82件から+31examples追加分に相当）
- Rubocop／Brakeman／bundler-audit：いずれもクリーン
- CI（`api-ci.yml`）：green（[実行ログ](https://github.com/rictaworks/multisite-sensorpack-mvp/actions/runs/30406304781)）
- PR #41：`gh pr merge --squash`で`main`へマージ済み（マージコミット`26345a6`）、リモートブランチ削除済み
- マージ前に`git pull origin main`で#6を、マージ作業時に#8(未マージ)以外の#10(オフライン検知)・#15(F8アラート管理)・#20/#21/#22等のマージ済み変更を取り込み、`config/routes.rb`の軽微なコンフリクトのみ手動解消（両ルートブロックを併存させる形）。

## 残課題（本Issueのスコープ外・フォローアップ）

- reCAPTCHA(`recaptchaToken`)は契約上の必須パラメータチェックのみ行い、Google siteverify APIへの実際の検証は未実装(Bot対策issueで別途対応予定)。ログにも未検証である旨を明示。
- `app/controllers/api/alerts_controller.rb`(#15)は本Issueマージ前に暫定実装された`X-Debug-User-Id`ヘッダー方式のcurrent_user解決を使用している(コード内にNOTEで明記済み)。本PRマージ後、`Authenticatable`/`TenantScoped` concernへ置き換えるフォローアップ issue の起票を推奨。
- `config/environments/production.rb`の`config.force_ssl`は未設定のまま(Brakemanの`-A`実行時のみ検出される既存の指摘であり、本Issueの新規変更によるものではない)。実際のデプロイ設定に合わせて`assume_ssl`と併せて有効化するのはClaude Desktop側のデプロイ作業スコープ。
- Site/DeviceのRESTリソースコントローラー本体(`SitesController`等)は#8/#10/#15が別途実装する。今回整備した`Authenticatable`/`TenantScoped`をそのまま`include`して使う想定。
