# CLIENT/

クライアント要望・フィードバックを管理するディレクトリ。

- `service-manager` エージェント（`.claude/agents/service-manager.md`）が受け付け、`director` と連携してMVPスコープとの整合性を確認したうえで `TASKS/` への起票につなげる。
- 要望をそのまま実装スコープに追加しない（YAGNI・MVPスコープ厳守）。
