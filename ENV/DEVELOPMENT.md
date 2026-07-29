# 開発環境

開発環境に関する情報を記載する。

- DB: SQLite（本番はPostgreSQL。スキーマは両対応の型のみ使用する。`requirements.md` 8節）
- 環境変数: `.env` を参照する（値はここに書かない）
- フロントエンド: Next.js（TypeScript）
- バックエンドAPI: Ruby on Rails（APIモード）
- AIサマリー: Python + FastAPI + LangChain（LangSmithで観測）

> このファイルには接続文字列やAPIキーなどのシークレット値を直接記載しない。値は必ず `.env` またはプラットフォームの環境変数を参照する。
