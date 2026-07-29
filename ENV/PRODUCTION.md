# 本番環境

本番環境に関する情報を記載する。

- デプロイ先: フロントエンド＝Vercel（無料）／Rails API・FastAPI・管理画面＝Railway（無料、不可時のみRender）
- DB: PostgreSQL
- シークレット・認証情報はプラットフォームの環境変数（Railway Variables・Vercel Environment Variables等）で管理し、このファイルには値を記載しない。

> `.claude/agents/deployer.md` / `.claude/agents/service-manager.md` を参照。
