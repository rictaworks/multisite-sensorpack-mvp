# 作業報告：Issue #6 DBスキーマ・マスタデータ投入

- **日付：** 2026-07-28（JST）
- **担当Issue：** [#6 [api] DBスキーマ・マスタデータ投入](https://github.com/rictaworks/multisite-sensorpack-mvp/issues/6)
- **PR：** [#33 [api] DBスキーマ・マスタデータ投入 (#6)](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/33)（squash merge済み、`main`へマージ、マージコミット`78a13de`）
- **ブランチ：** `feature/issue-6-db-schema`（マージ後にリモート削除済み）
- **Depends on：** #1（マージ済み、Rails APIひな形）

## 目的

requirements.mdのER図(2節)に準拠したマイグレーションを作成し、マスタデータ(合計17件)を投入する。以降の全バックエンド機能issueの土台となる。

## 実施内容（TDD：plan→red→coding→green）

1. **plan**：受け入れ条件を「ER図の全17テーブルがマイグレーションとして存在」「開発(SQLite)・本番(PostgreSQL)両対応の型のみ使用」「マスタデータ17件投入」「`users`はgoogle_subのみ保持しメールアドレス等のカラムが存在しない」「各モデルのアソシエーションをRSpecで検証」に言語化。
2. **red**：先にモデルスペック(`spec/models/*.rb`、19ファイル)を作成し、テーブル未作成の状態で`bundle exec rspec spec/models/user_spec.rb`を実行、`ActiveRecord::PendingMigrationError`で失敗することを確認(18 pending migrations)。
3. **coding**：
   - `bin/rails generate migration`で依存順(マスタ→users→sites→devices→…→ai_quota_usages)に18本のマイグレーションを生成し、内容を実装。
     - ER図記載の17テーブルに加え、requirements.md 1.7節が明示する「マスタデータ17件(センサー種別2/**アクチュエータ種別2**/コマンド種別4/アラート種別3/重要度3/デバイス状態3)」の内訳を満たすため、ER図には未記載の`actuator_types`マスタテーブルを追加し、`command_types.actuator_type_code`から参照する構成とした(単体のER図記載テーブル数と、1.7節のマスタ件数内訳の両方の受け入れ条件を矛盾なく満たすための設計判断)。
     - マスタテーブル(`sensor_types`等)は`id: :string, primary_key: :code`で文字列主キーとし、`t.foreign_key`で子テーブルから参照。SQLite・PostgreSQL双方で`create_table`時のFK制約が正しく動作することを確認。
     - decimal/string/boolean/datetime/integer/textのみ使用し、ネイティブuuid型・jsonb等DB非互換の型は不使用(`commands.idempotency_key`もstring型でUUID文字列を保持)。
   - `app/models/*.rb`に18モデルを追加。アソシエーション定義と、presence/uniqueness/inclusion/numericalityの最小限のバリデーションのみを実装(ビジネスロジックは各機能issueで追加する方針を遵守)。
   - `db/seeds.rb`：`MasterDataSeeder`クラスとして関数・クラス内にロジックを閉じ込め(トップレベル直書き禁止のコーディング規約に準拠)、`find_or_create_by!`で冪等にマスタ17件を投入。
   - `spec/rails_helper.rb`：`config.before(:suite) { Rails.application.load_seed }`を追加し、テストスイート全体でマスタデータを1回だけ投入(以降は各テストのトランザクションロールバックで維持)。
4. **green**：`bin/rails db:prepare`(開発・テスト双方)実行後、`bundle exec rspec` → **82 examples, 0 failures**。

## テスト結果

```
cd src/api
bin/rails db:prepare
RAILS_ENV=test bin/rails db:prepare
bin/rails db:seed
bundle exec rspec
# => 82 examples, 0 failures
```

- マスタデータ件数：`sensor=2 actuator=2 command=4 alert_type=3 severity=3 status=3`(合計17件)を`spec/models/master_data_seed_spec.rb`で検証。
- `users`のカラムが`id, google_sub, created_at, updated_at`のみであり、`email`等を含まないことを`spec/models/user_spec.rb`で検証(requirements.md 1.4)。
- `sites`に住所系カラムが存在しないことを`spec/models/site_spec.rb`で検証(自由入力ラベル)。
- CI(`api-ci.yml`)でも同内容がグリーンであることを確認（[実行結果](https://github.com/rictaworks/multisite-sensorpack-mvp/actions/runs/30403879298)）。

## セキュリティレビュー（コミット前・`.claude/rules/testing.md`準拠）

- `.claude/QC10.md`：QC10(エラーハンドリング)＝NOT NULL制約・バリデーションで想定外データを明示的に拒否し、フォールバックによる誤魔化しをしない設計とした。他項目はフロントエンド向けのため本issueでは非該当。
- `.claude/OWASP10.md`：
  - A02(暗号処理)：`device_token_digest`という命名の通りダイジェスト(ハッシュ)を保存する前提のカラム設計とした(実際のハッシュ化処理はF1/F2issueで実装)。
  - A03(インジェクション)：生SQL・文字列連結によるクエリは不使用。ActiveRecordのみを使用。
  - A05(セキュリティ設定ミス)：`config/database.yml`は変更しておらず、本番接続情報は環境変数(`DATABASE_URL`)経由のまま。
  - A06(脆弱または古いライブラリ)：`bundle exec bundler-audit check --update` → 脆弱性0件。`bundle exec brakeman -q` → 警告0件。`bundle exec rubocop` → 規約違反0件。新規gem追加なし。
- `.claude/CC.md`：CC04(個人情報保護)＝`users`テーブルにメールアドレス等の個人情報カラムが存在しないことをモデルスペックで検証済み。
- `git status`でシークレットファイル(`config/master.key`、`.env`等)が含まれていないことを確認(ステージした対象は`src/api/db/migrate/**`, `src/api/db/schema.rb`, `src/api/db/seeds.rb`, `src/api/app/models/**`, `src/api/spec/models/**`, `src/api/spec/rails_helper.rb`のみ)。

## 完了確認

- ローカルRSpec：green（82 examples, 0 failures）
- Rubocop／Brakeman／bundler-audit：いずれもクリーン
- CI（`api-ci.yml`）：green（[実行ログ](https://github.com/rictaworks/multisite-sensorpack-mvp/actions/runs/30403879298)）
- PR #33：`gh pr merge --squash`で`main`へマージ済み（マージコミット`78a13de`）、リモートブランチ削除済み

## 残課題（本Issueのスコープ外・今後のIssue向け）

- 閾値判定(F3)のヒステリシス評価ロジック、オフライン検知(F4)の判定ジョブ、コマンド配信(F5)の冪等ACK処理、AI日次サマリー(F7)のクォータ判定ロジックなど、モデルに紐づく実際のビジネスロジックは各機能issueで実装する。
- クレームコード(F1)のreCAPTCHA連携・8桁コード生成処理・総当たり対策(5回失効)のアプリケーションロジックは未実装(スキーマ上のカラムのみ用意)。
- `device_token_digest`のハッシュ化・検証処理（bcrypt等の導入判断を含む）は認証・デバイス登録issueで対応。
- Googleログイン(OAuth 2.0 / OpenID Connect)本体の実装は別issueで対応。
- 本番デプロイ(Railway、PostgreSQLマイグレーション適用)はClaude Desktop側のスコープ。
