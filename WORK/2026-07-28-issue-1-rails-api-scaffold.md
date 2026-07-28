# 作業報告：Issue #1 Rails APIひな形構築 + CI

- **日付：** 2026-07-28（JST）
- **担当Issue：** [#1 [基盤][api] Rails APIひな形構築 + CI](https://github.com/rictaworks/multisite-sensorpack-mvp/issues/1)
- **PR：** [#28 [基盤][api] Rails APIひな形構築 + CI](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/28)（squash merge済み、`main`へマージ）
- **ブランチ：** `feature/issue-1-rails-api-scaffold`

## 目的

Rails APIモードのひな形を作成し、RSpecによるテスト基盤とGitHub ActionsによるCIを整備する。以降のすべてのバックエンド機能issueの土台となる（Issue #1のEdit scope：`src/api/**`、`.github/workflows/api-ci.yml`）。

## 実施内容（TDD：plan→red→coding→green）

1. **plan**：受け入れ条件を「`GET /health`が200でJSONを返す」「開発/テストはSQLite、本番はPostgreSQLとして`database.yml`が両対応」「RSpec導入・CIでの自動実行」「機密ファイル非混入」に言語化。
2. **red**：`src/api/spec/requests/health_spec.rb`を実装前に作成し、ルーティング未定義により`404 Not Found`で失敗することを確認（3 examples, 3 failures）。
3. **coding**：
   - `rails new src/api --api --database=sqlite3 --skip-test --skip-bundle`でひな形生成（Ruby 3.4.7 / Rails 8.1.3）。
   - `Gemfile`：`pg`（本番PostgreSQL用）、`rspec-rails`、`dotenv-rails`（development/test）を追加。
   - `config/database.yml`：development/testはSQLite、productionはPostgreSQL（`DATABASE_URL`環境変数経由、値のハードコードなし）に書き換え。
   - `app/controllers/health_controller.rb` + `config/routes.rb`：`GET /health`で`{"status":"ok","environment":Rails.env}`を返す。想定外の例外は握りつぶさずRails標準のエラーハンドリングに委ねる。ログ出力によるデバッグトレース可能性を確保。
   - `.env.example` / `README.md`：セットアップ手順（bundle install → db:prepare → rspec）を記載。
   - `.github/workflows/api-ci.yml`：`src/api/**`変更時にPR作成・`main` push時でRSpecを自動実行（`RAILS_ENV=test`）。
4. **green**：RSpec 3件すべてグリーン（ローカル・CI双方で確認）。

## テスト結果

```
cd src/api && bundle exec rspec
# => 3 examples, 0 failures
```

- `GET /health`：ステータスコード200／JSONで`status: "ok"`と`environment`（`Rails.env`）を返す／Content-Typeが`application/json`

CI（GitHub Actions, `api-ci.yml`）でも同内容がグリーンであることを確認（[実行結果](https://github.com/rictaworks/multisite-sensorpack-mvp/actions/runs/30401961516)）。

## 発生した問題と対処

- `rails new`が`src/api/.git`（ネストしたgitリポジトリ）と`src/api/.github/`（Rails標準生成の重複CI設定。GitHub Actionsはリポジトリルートの`.github/workflows/`しか読まないため実行されない無効な二重設定）を自動生成した。削除コマンドは使用せず、`mv`で`DELETE/`配下（`DELETE/src-api-nested-dotgit`、`DELETE/src-api-nested-github-rails-default-ci`）へ退避し、コミット対象から除外した。
- `.gitignore`の`/.env*`ルールにより、コミットしたい`.env.example`まで誤って除外されていたため、`!/.env.example`の例外行を追加した。
- CI初回実行時、`ruby/setup-ruby@v1`に存在しない`ruby-version-file` inputを指定していたため「Unexpected input(s)」警告が発生。inputを削除し、`working-directory: src/api`配下の`.ruby-version`を自動検出させる標準挙動に修正して警告を解消した（[修正前後のCI実行]で警告消失を確認）。

## セキュリティレビュー（コミット前・`.claude/rules/testing.md`準拠）

- `.claude/QC10.md`：QC10（エラーハンドリング）＝Rails標準の404/500ハンドリングを使用。他項目はフロントエンド/Web公開ページ向けのため本ひな形段階では非該当。
- `.claude/OWASP10.md`：
  - A05（セキュリティ設定ミス）：`config/master.key`・`.env`は`.gitignore`で除外済み（`git status`・`git add -n`で二重確認）。
  - A06（脆弱または古いライブラリ）：`bundle exec bundler-audit check` → 脆弱性0件。`bundle exec brakeman -q` → 警告0件。`bundle exec rubocop` → 規約違反0件。
  - A09（ログ・監視不足）：ヘルスチェック呼び出し時にログ出力を追加し、後から追跡できるようにした。
- `.claude/CC.md`：該当項目なし（バックエンドひな形のみのため法令表示等は対象外）。
- `git status` / `git add -n src/api .github/workflows`でシークレットファイルが含まれていないことを確認（`config/master.key`は追跡対象外、`config/credentials.yml.enc`は暗号化済みで安全にコミット可能）。

## 完了確認

- ローカルRSpec：green（3 examples, 0 failures）
- CI（`api-ci.yml`）：green（[実行ログ](https://github.com/rictaworks/multisite-sensorpack-mvp/actions/runs/30401961516)）
- PR #28：`gh pr merge --squash`で`main`へマージ済み

## 残課題（本Issueのスコープ外・今後のIssue向け）

- 実際のドメインモデル（拠点・デバイス・テレメトリ等）の実装は後続issueで対応。
- Googleログイン（OAuth 2.0 / OpenID Connect）の実装（`.claude/rules/environment.md`）は後続issueで対応。
- 開発環境の自動認証分岐（本番到達不可であることの検証テストを含む）は認証実装issueで対応。
- CORS設定（`rack-cors`）はフロントエンド連携issueで必要に応じて有効化。
- 本番デプロイ（Railway、ドメイン`rictaworks.jp`サブドメイン化）はClaude Desktop側のスコープ。
