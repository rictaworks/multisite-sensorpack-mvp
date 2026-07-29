# multisite-sensorpack-mvp

1人で複数拠点を遠隔監視できる後付けセンサーパックのMVP。詳細仕様は [`requirements.md`](./requirements.md) を参照。

## 自動ログイン

本サービスは **Googleログイン（OAuth 2.0 / OpenID Connect）** のみに対応する（`requirements.md` 1.3節）。

1. トップページにアクセスすると、未ログインの場合はGoogleログイン導線が表示される。
2. 「Googleでログイン」を選択し、Googleアカウントの認証を行う。
3. 認証後はopaqueなユーザーID（`sub`値）のみが保持され、メールアドレス・氏名は保存されない。
4. 開発環境でのログイン方法・テストアカウントの扱いは [`ENV/DEVELOPMENT.md`](./ENV/DEVELOPMENT.md) を参照。

> 実装が進み次第、具体的な画面キャプチャ・手順をここに追記する。

## ページ一覧

実装済みページが増え次第、このセクションを更新すること（`writer` エージェント／`.claude/agents/writer.md` の担当範囲）。

| ページ名 | URL |
|---|---|
| （未実装） | — |

## API一覧

エンドポイントの正は [`SPEC/`](./SPEC/) 配下（`SPEC/api/` を想定）。実装済みAPIが増え次第、このセクションを更新すること。

| タイトル | エンドポイントURL |
|---|---|
| （未実装） | — |
