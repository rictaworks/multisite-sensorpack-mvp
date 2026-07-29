# 作業報告：Issue #16 [api] F9 開発者向け管理画面(BASIC認証)

- **日付：** 2026-07-29（JST）
- **担当Issue：** [#16 [api] F9 開発者向け管理画面(BASIC認証)](https://github.com/rictaworks/multisite-sensorpack-mvp/issues/16)
- **PR：** [#49 feat(api): F9 開発者向け管理画面(BASIC認証)を実装](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/49)（squash merge済み、`main`へマージ、リモートの作業ブランチは削除済み）
- **ブランチ：** `feature/issue-16-admin-panel`（マージ後、ローカル・リモートとも削除）
- **Depends on：** #6（マージ済み、DBスキーマ）・#14（マージ済み、AIサマリークォータ制御・`AiQuotaUsage.reset_for!`）

## 目的

requirements.md 1.6 F9・受け入れ条件に基づき、デバイス一覧参照とAIクォータ手動リセットができる、Rails製BASIC認証の開発者向け管理画面を実装する。`.claude/rules/environment.md`により一般消費者向けGoogleログイン導線とは完全に分離し、`.claude/rules/i18n.md`により日本語のみのUIとする。

## 実施内容（TDD：plan→red→coding→green）

1. **plan**：Issue #16本文・requirements.md F9・`.claude/rules/environment.md`（BASIC認証は消費者向けGoogleログインとは別物）・`.claude/rules/i18n.md`（F9は日本語のみ、多言語対応の対象外）・`.claude/rules/architecture.md`（車輪の再発明を避ける）を確認し、受け入れ条件を言語化した。
2. **red**：`spec/requests/admin/devices_spec.rb`・`spec/requests/admin/ai_quota_usages_spec.rb`をルーティング・コントローラ実装より先に作成し、`13 examples, 13 failures`（すべて404）を確認した。
3. **coding→green**：ルーティング・コントローラ・ビューを実装し、最終的に**13 examples, 0 failures**（本Issueで追加した分）。既存スイートを含めた全体では**301 examples, 0 failures**。

### 実装したファイル

- `src/api/app/controllers/admin/base_controller.rb`（新規）：BASIC認証の共通コントローラ。`ApplicationController`が`ActionController::API`継承のため既定で含まれない`ActionController::HttpAuthentication::Basic::ControllerMethods`（認証本体）と`ActionView::Layouts`（ERBテンプレート・レイアウト描画に必須。`ActionController::API`は`ActionView::Rendering`自体を含まないため、これがないと`render :index`が空レスポンスになることを実装中に確認した）を明示的に`include`した。認証情報は`ENV["ADMIN_BASIC_AUTH_USER"]`/`ENV["ADMIN_BASIC_AUTH_PASSWORD"]`をリクエストごとに参照し、値が空なら常に拒否（fail closed）。比較はSHA-256ダイジェスト同士を`ActiveSupport::SecurityUtils.secure_compare`することでタイミング攻撃と長さ不一致例外の両方を回避。状態変更リクエスト（POST）はOriginヘッダーがリクエスト先ホストと一致するか検証し、不一致なら403（`ActionController::RequestForgeryProtection`が使えないAPIモードでのCSRF対策の補完）。`I18n.with_locale(:ja)`で常に日本語ロケールに固定。
- `src/api/app/controllers/admin/devices_controller.rb`（新規）：デバイス一覧（ID・拠点・状態・最終通信時刻・破棄件数・削除フラグ）を表示。論理削除済みデバイスも含めて全件表示する。
- `src/api/app/controllers/admin/ai_quota_usages_controller.rb`（新規）：クォータ消費記録一覧の表示（`index`）と、指定ユーザー・クォータ日の手動リセット（`create`）。リセット処理自体はIssue #14で実装済みの`AiQuotaUsage.reset_for!`をそのまま呼び出し、自前実装しない。存在しない`user_id`・不正な`quota_date`はフォールバックで握りつぶさず`ActiveRecord::RecordNotFound`/`ArgumentError`/`Date::Error`を明示的にrescueし、422＋日本語メッセージで返す。
- `src/api/app/views/layouts/admin.html.erb`（新規）・`src/api/app/views/admin/devices/index.html.erb`（新規）・`src/api/app/views/admin/ai_quota_usages/index.html.erb`（新規）：日本語のみのUI。アイコンはFont Awesome（CDN経由）のみ使用し絵文字は不使用。ネイティブの`alert()`/`confirm()`/`prompt()`は一切使用していない（JS自体を使わないサーバーレンダリングのみの構成のため、該当し得ない）。
- `src/api/config/routes.rb`（edit）：`namespace :admin`配下に`root`（`admin_root`）・`resources :devices, only: [:index]`・`resources :ai_quota_usages, only: [:index, :create]`を追加。
- `src/api/config/initializers/admin_basic_auth.rb`（新規）：`config/initializers/omniauth_google.rb`と同じ方針で、production環境でBASIC認証情報が未設定のまま起動することを防ぐ（fail fast）。
- `src/api/config/locales/ja.yml`（edit）：`admin.*`名前空間に管理画面専用の文言を追加。F9は日本語のみでよいため、`en/fr/zh/ru/es/ar.yml`への追加は行っていない（`.claude/rules/i18n.md`のコメントに準拠）。
- `src/api/.env.example`（edit）：`ADMIN_BASIC_AUTH_USER`/`ADMIN_BASIC_AUTH_PASSWORD`のプレースホルダー（値は空）を追加。実際の認証情報はコミットしていない。
- `src/api/spec/requests/admin/devices_spec.rb`・`src/api/spec/requests/admin/ai_quota_usages_spec.rb`（新規）：未認証・誤資格情報・ENV未設定（fail closed）・Googleセッションcookieのみでのアクセス（分離確認）・正しい資格情報での一覧表示・クォータ手動リセット・不正入力の422・クロスオリジンPOSTの403を検証。

## 実装中に判明したハマりどころ（設計上の重要な決定）

- `ApplicationController`は`ActionController::API`を継承しており、既定では`ActionController::HttpAuthentication`（`http_basic_authenticate_with`等）も`ActionView::Layouts`（ERBテンプレート描画自体）も含まれていない。前者は`Admin::BaseController`で明示`include`し、後者を含めないまま`render :index`を呼ぶとエラーにはならず**中身が空のtext/plainレスポンス（200、content-length 1）が返る**という気づきにくい挙動を実機テストで確認した。`ActionView::Layouts`を明示`include`し`layout "admin"`を指定することで解決した。
- 同じ理由で、コントローラ内で`t(...)`（`AbstractController::Translation`由来）は使えず、既存コード（`sessions_controller.rb`等）の慣例どおり`I18n.t(...)`を使用した（ビュー内の`t(...)`はActionViewのヘルパーのため問題なし）。
- `ActionController::API`は`ActionController::BasicImplicitRender`（アクションの最後に何もrenderしなければ常に`head :no_content`を返す）を使うため、`ActionController::Base`のような「同名テンプレートの暗黙的自動描画」は行われない。`index`アクションの最後に明示的に`render :index`を呼ぶ必要がある。

## セキュリティレビュー（コミット前に実施）

`.claude/QC10.md`・`.claude/TM.md`・`.claude/OWASP10.md`・`.claude/CC.md`を実際に読んだ上でレビューした（要点。詳細はPR #49本文にも記載）。

- **OWASP A01（アクセス制御）**：消費者向けGoogleログイン（`Authenticatable`／セッションcookie）とは完全に別のコントローラ階層・認証機構であり、Googleセッションcookieのみでは`/admin`へアクセスできないことをRSpecで確認した。ENV未設定時はfail closed。Origin検証による状態変更リクエストの追加防御層あり。
- **OWASP A02（暗号処理）**：資格情報の比較はSHA-256ダイジェスト化＋`secure_compare`（タイミング攻撃対策・長さ不一致例外の回避）。
- **OWASP A03（インジェクション）**：DBアクセスはすべてActiveRecord経由（生SQLなし）。ビューは`<%= %>`の自動エスケープのみを使用し、`raw`/`html_safe`は使用していない。ユーザー入力（不正な`user_id`/`quota_date`）はログにのみ出力し、画面には固定の翻訳済みメッセージのみを表示する（反射型XSSの回避）。
- **OWASP A05（設定ミス）**：認証情報はコード非同梱・ENV経由のみ。production起動時に未設定なら例外で起動を止める（`config/initializers/admin_basic_auth.rb`）。
- **OWASP A06（脆弱・古いライブラリ）**：新規gemは追加していない（Rails標準の`ActionController::HttpAuthentication`のみ使用）。`bundle exec bundler-audit check --update` → No vulnerabilities found。
- **OWASP A07（認証・認可の欠陥）**：未認証・誤資格情報・ENV未設定のいずれも401＋`WWW-Authenticate`ヘッダーを返すことをRSpecで確認。
- **OWASP A09（ログ・監視）**：認証試行（ユーザー名のみ、パスワードは記録しない）・リセット操作（user_id/quota_date）・クロスオリジン拒否・入力エラーをRails.loggerに記録。
- `bundle exec brakeman -q` → Security Warnings 0（`BasicAuthTimingAttack`等の関連チェックを含む）。
- `bundle exec rubocop app/controllers/admin config/initializers/admin_basic_auth.rb config/routes.rb spec/requests/admin` → no offenses。
- `git status`で`config/master.key`等のシークレットファイルがステージングに含まれていないことを確認済み（`.env.example`はプレースホルダーのみで実値は含まない）。

## テスト結果

```
$ bundle exec rspec
301 examples, 0 failures

$ bundle exec rubocop app/controllers/admin config/initializers/admin_basic_auth.rb config/routes.rb spec/requests/admin
7 files inspected, no offenses detected

$ bundle exec brakeman -q
Security Warnings: 0

$ bundle exec bundler-audit check --update
No vulnerabilities found
```

CI（`.github/workflows/api-ci.yml`、GitHub Actions上のRSpec）もPR上でgreenを確認した上でマージした。

## マージ結果

- PR [#49](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/49) をsquash mergeし、`main`へ反映済み。
- 作業ブランチ`feature/issue-16-admin-panel`はリモート・（可能な範囲で）ローカルとも削除済み。

## 残課題

- Font AwesomeのCDN読み込み（`app/views/layouts/admin.html.erb`）にSRI（`integrity`属性）を付与していない。本セッションはネットワーク経由でCDN配信物の正確なハッシュ値を検証できなかったため、誤ったハッシュで正規のCSSを誤ってブロックするリスクを避けて意図的に省略した。ネットワーク環境で正しいハッシュを確認できる際に追記することが望ましい。
- 管理画面はモバイル表示の最適化（テーブルの横スクロール対応等）を行っていない。内部開発者がデスクトップから利用する前提のため優先度は低いと判断したが、必要であれば`designer`エージェントによるCRAPレビューを別issueで検討されたい。
- リポジトリ全体を対象とした「i18nを経由しないハードコード文字列の検出テスト」（`.claude/rules/coding-style.md`が求めるCI組み込みのテスト）はまだ存在しない（本Issueのスコープ外、かつ既存コードにも同様の未整備状態が見られたため新設は見送った）。今回追加したUI文言はすべて`I18n.t`/`t`経由であることは目視確認済み。
