# CI/CD運用

## CI（必須）

- 各サブプロジェクト（フロントエンド／バックエンドAPI／AIサマリー）が作成され次第、GitHub Actionsで以下を自動実行するCIを整備する。
  - Next.js: lint + Jest
  - Rails API: RSpec
  - FastAPI: pytest
- CIはPR作成時・`main` へのpush時に走らせる。
- サブプロジェクトがまだ存在しない段階で、テスト対象のない空のCIワークフローを作らない（誤解を招くため）。サブプロジェクトを作成するタスクと同時にCIも整備し、`TASKS/` に起票する。

## CD（このリポジトリのスコープ外）

- CD（本番デプロイ、Vercel／Railway等への自動デプロイ設定）は **Claude Desktop側で別途設定する**。このリポジトリ内のワークフローファイルとしては構築しない。
