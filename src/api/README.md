# Sensorpack API (Rails, APIモード)

多拠点センサーパック(SensorPack)のバックエンドAPI。Ruby on Rails APIモードで実装する。
以降のすべてのバックエンド機能issueの土台となるひな形リポジトリ(issue #1)。

## 技術スタック

- Ruby 3.4.7 / Rails 8.1 (APIモード)
- DB: SQLite3(開発・テスト環境) / PostgreSQL(本番環境)
- テスト: RSpec

環境判定は `RAILS_ENV` を単一の情報源として行う(`development` / `test` / `production`)。

## セットアップ手順

### 1. 依存関係のインストール

```bash
cd src/api
bundle install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成する(`.env` はGit管理対象外)。

```bash
cp .env.example .env
```

開発・テスト環境ではSQLiteを使用するため、`.env` の追加設定は基本的に不要。
本番環境(production)でのみ `DATABASE_URL`(PostgreSQL接続文字列)の設定が必要。

### 3. データベースのセットアップ

```bash
bin/rails db:prepare
# もしくは
RAILS_ENV=test bin/rails db:prepare
```

### 4. サーバー起動

```bash
bin/rails server
```

起動後、以下でヘルスチェックを確認できる。

```bash
curl http://localhost:3000/health
# => {"status":"ok","environment":"development"}
```

### 5. テスト実行(RSpec)

```bash
bundle exec rspec
```

## エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/health` | アプリケーションのヘルスチェック。`{"status":"ok","environment":"<RAILS_ENV>"}` を返す |
| GET | `/up` | Rails標準のヘルスチェック(起動確認用) |

## シークレット管理

- `config/master.key` および `.env` はGit管理対象外(`.gitignore` 済み)。
- 本番環境の接続情報(`DATABASE_URL` 等)はデプロイ先プラットフォームの環境変数で設定し、コードにハードコードしない。
- コミット前は必ず `git status` でシークレットファイルが含まれていないことを確認する。

## CI

`.github/workflows/api-ci.yml` にて、PR作成時・`main` へのpush時にRSpecを自動実行する。
