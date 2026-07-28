# 作業報告：Issue #14 F7 AI日次サマリー クォータ制御・FastAPI連携

- **日付：** 2026-07-28（JST）
- **担当Issue：** [#14 [api] F7 AI日次サマリー クォータ制御・FastAPI連携](https://github.com/rictaworks/multisite-sensorpack-mvp/issues/14)
- **PR：** [#44 [api] F7 AI日次サマリー クォータ制御・FastAPI連携 (#14)](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/44)（squash merge済み、`main`へマージ。Issue #14も自動クローズ）
- **ブランチ：** `feature/issue-14-quota-control`
- **Depends on：** #6（DBスキーマ）・#13（FastAPI+LangChain日次サマリー生成）・#5（OpenAPI契約）— いずれもマージ済み

## 目的

requirements.md 1.6 F7 `generate_daily_summary` のうち、Railsサイドの担当範囲（JSTクォータ日判定・1日1回制限・Issue #13のFastAPI呼び出し）を実装する。Edit scope：`app/models/ai_summary.rb`（編集）・`app/models/ai_quota_usage.rb`（編集）・`app/services/daily_summary_service.rb`（新規）・`app/controllers/api/summaries_controller.rb`（新規）。

## 実施内容（TDD：plan→red→coding→green）

1. **plan**：作業開始前に`git pull origin main`で最新化（#7認証・テナント分離基盤、#10オフライン検知、#15アラート管理等マージ済みを確認）。`requirements.md` F7・8節、`src/shared/contracts/openapi.yaml`のai-summary/internal-aiタグ、`app/controllers/concerns/authenticatable.rb`・`tenant_scoped.rb`（Issue #7実装済み）を参照し、受け入れ条件を言語化：
   - クォータ日＝JST現在時刻−3hの日付。同一クォータ日に生成済みなら429
   - 過去24hのテレメトリ統計（min/max/avg/閾値超過時間）とアラート履歴の統計値のみをFastAPIへ渡す
   - データなし日はLLMを呼ばず定型文・クォータ不消費
   - requirements.md 1.9 Hカテゴリ6ケース（初回成功／同日2回目429／JST03:00跨ぎ許可／管理者リセット／データなし日クォータ不消費／複数ユーザー独立）をRSpecで検証
   - Issue #7の`Authenticatable`/`TenantScoped`を再利用し、プレースホルダー認証は新設しない（Issue #15の反省点を踏襲）
2. **red**：`spec/services/daily_summary_service_spec.rb`・`spec/requests/api/summaries_spec.rb`を実装前に作成し、`NameError: uninitialized constant DailySummaryService`で失敗することを確認。
3. **coding**：
   - `app/services/daily_summary_service.rb`：`DailySummaryService.quota_date_for(now)`（`ActiveSupport::TimeZone["Asia/Tokyo"]`でJST変換後−3h、JSTにDSTなしのため単純オフセットで正確）。`#call`はクォータ判定→未消費なら過去24h統計・アラート集計→データなしなら定型文（クォータ不消費）→データありならFastAPI呼び出し→サマリー保存とクォータ消費を1トランザクションで実行。閾値超過時間はThreshold（`sensor_type_code`・`direction`・`breach_state`・`updated_at`）を用い、現在BREACHED状態の`updated_at`を超過開始時刻の近似値として集計窓との重なりを算出（Alertモデルにはsensor_type_codeが無くAlert単体では温度/湿度を区別できないための設計判断、コード内コメントに明記）。内部クラス`InternalAiClient`が`Net::HTTP`でIssue #13のFastAPI（`POST /internal/ai/summaries`）を呼び出し、`AI_SERVICE_BASE_URL`/`INTERNAL_AI_API_KEY`未設定時はfail closedで例外化（FastAPI側`require_internal_service_key`と対称）。
   - `app/models/ai_summary.rb`：`data_sufficient?`を追加。専用カラムを増やさず「同一user_id+quota_dateでクォータが消費済みか」から導出（DailySummaryServiceがサマリー保存とクォータ消費を同一トランザクションで行うため整合性が保たれる設計）。
   - `app/models/ai_quota_usage.rb`：`.consumed?`／`.consume!`／`.reset_for!`を追加。`.reset_for!`はF9管理画面（別Issue）から再利用できるよう切り出し、Issue #14では本メソッドの直接呼び出しでH4（管理者リセット）ケースを検証。
   - `app/controllers/api/summaries_controller.rb`：`GET /api/ai-summaries/today`・`POST /api/ai-summaries`。`Authenticatable`/`TenantScoped`を`include`。429は`QuotaExceededError`から`existingSummary`付きで構成、AI呼び出し失敗は502（`ai_service_unavailable`）でフォールバックせず明示的に扱う。
   - `config/routes.rb`：`api`名前空間に2ルート追加。
   - `config/locales/{ja,en,fr,zh,ru,es,ar}.yml`：`ai_summary_quota_exceeded`/`ai_summary_service_unavailable`を7言語に追加（生成されるサマリー本文自体はIssue #13の前例（`LLM_UNAVAILABLE_SUMMARY_TEXT`）に倣い、UIチェイン言語とは別に日本語固定コンテンツとして扱う設計をコメントに明記）。
   - `.env.example`：`AI_SERVICE_BASE_URL`/`INTERNAL_AI_API_KEY`の設定例を追記。
4. **green**：`bundle exec rspec`で新規18件がグリーンになったことを確認後、フルスイート実行。

## テスト結果

```
cd src/api && RAILS_ENV=test bundle exec rspec
```

- 新規 `spec/services/daily_summary_service_spec.rb`：`quota_date_for`のJST03:00境界（02:59:59→前日／03:00:00→当日）2件、requirements.md 1.9 **Hカテゴリ6ケース全て**（H1初回成功／H2同日2回目`QuotaExceededError`／H3 JST03:00跨ぎ許可／H4管理者リセット／H5データなし日クォータ不消費(2件)／H6複数ユーザー独立）、テナント分離（他ユーザーのテレメトリが統計に混入しないこと）1件
- 新規 `spec/requests/api/summaries_spec.rb`：未認証401（GET/POST）、当日未生成時204、生成済み再表示200、初回201、同日2回目429（`existingSummary`付き）、データ不足時201・クォータ不消費、テナント分離1件
- 実装着手時点（#7マージ直後）：**161 examples, 0 failures**（既存143＋新規18）
- 実装完了後、他Issue（#8/#17/#18）と並行マージが発生したため`git merge origin/main`でコンフリクト解消（`config/locales/*.yml`・`config/routes.rb`は追加箇所が競合しただけの単純衝突で両方の変更を保持）後に再実行：**190 examples, 0 failures**
- `bundle exec rubocop`：102 files inspected, no offenses detected
- `bundle exec brakeman -q --no-pager`：Security Warnings: 0
- `bundle exec bundler-audit check --update`：No vulnerabilities found
- CI（GitHub Actions `API CI (RSpec)`）：PR #44で`rspec` pass確認済み

## セキュリティレビュー（コミット前・`.claude/rules/testing.md`準拠）

`.claude/OWASP10.md`の観点で確認：

- **A01（アクセス制御の不備）**：`AiSummary`/`AiQuotaUsage`/`Device`への全クエリに`current_user.id`を必須条件として付与（テナント分離）。他ユーザーのテレメトリ・アラートが統計集計に混入しないことをRSpecで検証済み。
- **A03（インジェクション）**：生SQL文字列連結は不使用。`Alert`の日付条件も名前付きバインド変数経由。
- **A04（セキュリティ設計の欠如）**：クォータ消費とサマリー保存を1トランザクションに包み、部分状態（消費済みなのにサマリー無し等）を防止。不整合検知時はフォールバックせず`raise`。
- **A05（セキュリティ設定ミス）**：`AI_SERVICE_BASE_URL`/`INTERNAL_AI_API_KEY`未設定時はfail closedで例外化（Issue #13 FastAPI側と対称）。
- **A06（脆弱・古いライブラリ）**：新規gem追加なし（`Net::HTTP`は標準ライブラリ）。`bundler-audit`で脆弱性0件。
- **A07（認証・認可の欠陥）**：Issue #7の`Authenticatable`/`TenantScoped`をそのまま`include`し、Issue #15のような暫定デバッグヘッダー認証は新設していない。
- **A08（データ整合性）**：クォータ判定→消費までを1トランザクションにすることで二重消費・二重生成のレースを防止。
- **A09（ログ・監視不足）**：クォータ超過・データ不足・生成成功・AI呼び出し失敗の各所で`Rails.logger`に記録。
- **A10（SSRF）**：FastAPI呼び出し先URLは環境変数固定値のみで組み立て、ユーザー入力由来のURLは一切使用していない。

`.claude/QC10.md`・`.claude/CC.md`は主にWebフロントエンド公開ページ・法務表記に関するチェックリストであり、本Issueはバックエンド内部APIのみの変更のため大半の項目は対象外（N/A）。`git status`でシークレットファイル（`config/master.key`・`.env`等）が含まれていないことを確認済み。

## 残課題（本Issueのスコープ外・今後のIssue向け）

- 開発者向け管理画面（F9）からの「AIクォータ手動リセット」ボタン自体は本Issueの対象外。`AiQuotaUsage.reset_for!`をモデルに切り出し済みなので、F9管理画面Issueはそのまま呼び出す想定。
- `POST /internal/ai/summaries`呼び出し失敗時（FastAPI側障害等）は502（`ai_service_unavailable`）を返す設計だが、実際のネットワーク障害時の挙動はE2E環境でのみ確認可能なため、本Issueではユニット/リクエストスペックの範囲に留めている。
- `app/controllers/api/alerts_controller.rb`（Issue #15）は引き続き暫定デバッグヘッダー認証のまま（Issue #7 PRで既知の残課題として記載済み）。本Issueのスコープ外のため変更していない。
- ユーザー向けダッシュボードでのAIサマリー表示UI・AI生成コンテンツである旨の明記（`.claude/CC.md` CC09）は別Issue（フロントエンド側）の担当。
