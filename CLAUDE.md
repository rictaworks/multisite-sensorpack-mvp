# CLAUDE.md

このファイルは、このリポジトリで作業するすべてのClaude Codeセッションに読み込まれる。ここには恒久的・静的なルールのみを置き、手順（ワークフロー）は `.claude/rules/`、エージェント固有のルールは `.claude/agents/` に分離する（分類方針は `.claude/auto-optimizer.md` に準拠）。

## 基本設定

- タイムゾーンは常に **JST（日本標準時）** を使用する。日時の記録・表示・ログはすべてJST基準。
- 文字エンコーディングは常に **UTF-8**。
- アイコンは **Font Awesome** のみを使用する。絵文字は一切使用しない（コード・UI・コミットメッセージ・ドキュメント全て）。
- 環境変数は必ず `.env`（またはデプロイ先のプラットフォーム環境変数）を参照する。値をコードにハードコードしない。

## コーディング原則（詳細は `.claude/rules/coding-style.md`、`.claude/development-principles.md` も参照）

フォールバック禁止・丁寧な例外処理・デバッグトレース可能性・関数/クラス限定の記述・グローバル変数禁止・文字列外部化・**ネイティブ `alert()`/`confirm()`/`prompt()` の使用禁止**を厳守する。

## 多言語対応（詳細は `.claude/rules/i18n.md`）

当初から日本語・英語・フランス語・中国語・ロシア語・スペイン語・アラビア語に対応する。ただし**開発者用の管理画面は日本語のみ**でよい。

## 環境分岐・ログイン（詳細は `.claude/rules/environment.md`）

環境（dev/test/production）を判定して分岐できるようにする。開発環境の認証済み自動分岐は**本番に絶対到達させない**。一般消費者は実際に使えるGoogleログインのみで利用できること（開発者向け近道を本番UIに露出しない）。

## アーキテクチャ／技術スタック（詳細は `.claude/rules/architecture.md`）

安全なライブラリ・フレームワーク・OSS・SaaSを優先し、車輪の再発明を避けてオリジナルコードを少なく保つ。基本はNext.js＋Rails＋PostgreSQL。規模に応じてマイクロサービス・MVC・API Gateway・メッセージングを意識する。

## デプロイ運用（詳細は `.claude/rules/deploy.md`）

Webはヘッドレスデプロイ・バックエンドドメイン隠蔽・ドメインは`rictaworks.jp`のサブドメイン。Web＝デプロイ以降／デスクトップ・スマホ＝ビルド以降／ESP32＝焼き込み以降はClaude Desktop側の作業でありこのセッションのスコープ外。

## ブランチ運用（`.claude/rules/git-workflow.md` も参照）

- **`main` ブランチで直接作業しない。**
- `src/*` 配下の変更は必ずプルリクエストを作成する。
- `src/*` 以外（ドキュメント・設定等）は `main` への直接pushを許可する。

## デザインモック（`app-ui/`）

- 事前にデザイン指定がある場合、`app-ui/` にモックが配置されている。実装時は必ずこのモックの構成・見た目に従うこと。

## ディレクトリ運用（詳細は `.claude/rules/project-structure.md`）

`TASKS/`（タスク）・`DEBUG/`（バグ報告）・`CLIENT/`（クライアント要望）・`WORK/`（作業報告）・`ENV/DEVELOPMENT.md`（開発環境）・`ENV/PRODUCTION.md`（本番環境）・`SPEC/`（仕様書・リバースエンジニアリング図解）・`DELETE/`（削除コマンド禁止に伴う手動ゴミ箱）を用途に応じて使い分け、更新する。

## エージェント構成（詳細は `.claude/agents/`）

規模に応じて director / project-manager / designer / debugger / tester / data-scientist / deployer / writer / service-manager のサブエージェントを使い分ける。画像アセットは**AI生成**とする（designer担当）。プロダクトコピー・マーケティング文言等のプロのライティングは**writer**エージェントに行わせる。

## PR作成時の注意（詳細は `.claude/rules/git-workflow.md`）

PRの説明には、非エンジニア（クライアント・PM等）でも実施できる丁寧なユーザーテスト手順を必ず記載する。

## テスト・レビュー（詳細は `.claude/rules/testing.md`）

TDD（plan → red test → coding → green test）を厳守する。コミット前に必ずセキュリティレビューを行い、`.claude/QC10.md`・`.claude/TM.md`・`.claude/OWASP10.md`・`.claude/CC.md` を参照する。

## CI/CD（詳細は `.claude/rules/ci-cd.md`）

CI（自動テスト・自動lint）は必須。CD（本番デプロイ）はClaude Desktop側で別途設定する。

---

## 削除系コマンドの禁止（重要）

以下のルールはこのワークスペース内のすべての会話で絶対に守られる：

- Claude はファイルまたはディレクトリを削除するコマンドを一切生成してはならない。
  例：rm, rm -rf, rm *, rmdir, unlink, cache --delete,
      lftp mirror --delete, rsync --delete, git clean -df, find -delete 等。

- 削除が必要な場合でも、Claude は削除コマンドを提案せず、
  「手動で削除してください」といった説明に留めること。

- 削除の推奨・削除操作の自動判断も禁止。

- ssh / lftp / デプロイ系スクリプトを生成する場合でも、
  削除コマンドの生成は禁止。

これらはすべての会話・コード生成に適用される。

## シークレット管理（重要）

- `config/master.key` など機密ファイルを `git add` するコードを生成してはならない
- デプロイスクリプト・セットアップ手順でも同様
- シークレットは必ず環境変数（RAILS_MASTER_KEY 等）で渡すこと
- `.gitignore` への追加を確認する手順を必ずコードに含めること
- 初回コミット前に `git status` でステージング確認を促すこと