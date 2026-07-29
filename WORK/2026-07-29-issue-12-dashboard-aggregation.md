# 作業報告：Issue #12 [api] F6 ダッシュボード集計API・日次集約/生データ削除ジョブ

- **日付：** 2026-07-29（JST）
- **担当Issue：** [#12 [api] F6 ダッシュボード集計API・日次集約/生データ削除ジョブ](https://github.com/rictaworks/multisite-sensorpack-mvp/issues/12)
- **PR：** [#47](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/47)（squash merge済み、`main`へマージ、マージコミット`bbe1852`）
- **ブランチ：** `feature/issue-12-dashboard-aggregation`
- **Depends on：** #9（マージ済み、テレメトリ受信・閾値判定）・#10（マージ済み、オフライン検知）・#11（マージ済み、コマンド発行）

## 目的

requirements.md 1.6 F6 `render_dashboard` に基づき、拠点一覧・デバイス詳細の集計読み取りAPIと、7日超データの時間粒度集約・14日超生データ削除ジョブを実装する。

## 実施内容（TDD：plan→red→coding→green）

1. **plan**：`gh issue view 12`本文・`requirements.md` F6節（1.6/1.9）・`src/shared/contracts/openapi.yaml`の`/dashboard/sites-summary`・`/devices`系エンドポイント・`Site`/`Device`/`DeviceDetail`/`TelemetrySeriesPoint`スキーマ・`src/web/lib/dashboard/mockData.ts`（Issue #18が「実際のRails API連携は後続issueの範囲」として残した参照実装）・既存の`TenantScoped`/`Authenticatable`concern・`db/schema.rb`（`hourly_aggregates`/`telemetry_readings`テーブル定義）を確認し、受け入れ条件を言語化した。
2. **red→green**：まずモデル層（`HourlyAggregate.aggregate_pending_hours!`）と2つのジョブのRSpecを先に書いて失敗を確認し（`NoMethodError`/`NameError`）、次にHTTP境界（`Api::SitesController`/`Api::DevicesController`）のrequest specを先に書いてルーティング未定義による404失敗を確認した上で、実装を積み上げた。最終的に**311 examples, 0 failures**（本Issueで27件追加、既存284件も継続green）。

### 実装したファイル

- `src/api/app/controllers/api/sites_controller.rb`（新規）：`GET /api/v1/dashboard/sites-summary`。`current_user.sites`起点のクエリのみを対象にし、`SiteAggregates`という内部ヘルパークラスで「デバイス数」「オンライン数」「openアラート数」をそれぞれ`group(:site_id).count`の1クエリずつ、「拠点の最新温湿度」を「デバイスごとの最新telemetry_reading idをGROUP BYで一括取得→該当idをまとめてIN取得→Ruby側で拠点単位に畳み込む」という2クエリで算出し、拠点件数によらず一定クエリ数に抑えた（N+1回避）。
- `src/api/app/controllers/api/devices_controller.rb`（新規）：ダッシュボード向け参照エンドポイント4本。
  - `GET /api/v1/devices`（`siteId`絞り込み対応、`current_user.sites`との積集合でスコープ）
  - `GET /api/v1/devices/:deviceId`（`TenantScoped#authorize_owner!`で所有者チェック、閾値・自動ルールつきの`DeviceDetail`）
  - `GET /api/v1/devices/:deviceId/telemetry-series`（`range=24h`→生データ`telemetry_readings`、`range=7d`→`hourly_aggregates`。`sensorType`/`range`のバリデーションあり）
  - `GET /api/v1/devices/:deviceId/commands`（コマンド履歴、発行日時降順）
- `src/api/app/models/hourly_aggregate.rb`（編集）：`SENSOR_COLUMNS`定数（センサー種別→telemetry_readingsカラムの対応表）、`.in_range`スコープ、`.aggregate_pending_hours!`クラスメソッド（指定時刻より前の完了済み時間バケットのみを対象に、min/max/avgを冪等に集約。既存バケットは再集約せず、未対応のsensor_type_codeはフォールバックせず`ArgumentError`を送出）を追加。
- `src/api/app/jobs/hourly_aggregation_job.rb`（新規）：全デバイス×センサー種別（温度・湿度）を走査し、`HourlyAggregate.aggregate_pending_hours!`を呼び出す薄いジョブ（判定ロジック自体はモデル側、`OfflineDetectionJob`/`Device`と同様の設計方針）。
- `src/api/app/jobs/raw_data_purge_job.rb`（新規）：14日を超えた`telemetry_readings`を`delete_all`で削除するジョブ。
- `src/api/config/routes.rb`（編集）：上記5エンドポイントのルーティングを`scope "api/v1", module: "api"`配下に追加。

## スコープ判断（設計上の重要な決定）

- **`range=7d`は常に`hourly_aggregates`から参照し、`range=24h`は常に`telemetry_readings`から参照する単純な二分岐とした。** requirements.md 1.6 F6.5の文言「7日を超えた生データを集約」を字義通りに実装すると、直近7日分はまだ集約されておらず`hourly_aggregates`に存在しないタイミングが生じうる。`HourlyAggregationJob`を「7日超のデータのみ」ではなく「完了済みの全時間バケットを継続的に」集約する設計に変更し、`hourly_aggregates`が常に最新まで積み上がっている前提を作ることで、mockData.ts（Issue #18が先行文書化した契約整合の参照実装）の`isAggregated = (range === '7d')`という単純な挙動と、1.9 Iカテゴリの「生データ削除後の集約参照」（14日で生データが消えても7d表示が壊れない）の両方を満たした。
- **`GET /sites`（`listSites`）・`POST /sites`（`createSite`）・`DELETE /sites/{siteId}`は本Issueでは未実装。** openapi.yamlには定義があるが、Issue #12のEdit scope・受け入れ条件はいずれも「拠点一覧＝集計表示」（`/dashboard/sites-summary`）に限定されており、拠点のCRUD自体はF1（デバイス登録）やUC群の別issueで扱うべき関心事と判断した。実装ファイルも`sites_controller.rb`は`dashboard_summary`アクションのみを持つ。
- **拠点の「最新温湿度」は、拠点配下の全デバイスのうち直近1件のテレメトリ読み取り行（温度・湿度が同一行）をそのまま採用する。** デバイスごとに温度の最新値・湿度の最新値を別々に探すと非対称な組み合わせになり得るため、1行分のペア値として扱うこととした。
- **`GET /devices/:deviceId/commands`は`devices_controller.rb`に実装し、既存の`commands_controller.rb`（Issue #11、`POST`のみ）は変更しなかった。** Issue #12のEdit scopeが`devices_controller.rb`を「ダッシュボード向け参照エンドポイント」と明記しており、同一パスへの`GET`/`POST`をコントローラ間で分担する既存の`config/routes.rb`の設計方針（`commands_controller.rb`は発行のみを担当）を踏襲した。
- **`GET /alerts?deviceId=`（アラート履歴）は変更なし。** 受け入れ条件の「デバイス詳細：…アラート履歴を返す」はIssue #15（F8）で実装済みの`Api::AlertsController#index`（`deviceId`クエリ対応）で既に満たされているため、本Issueでは重複実装しなかった。

## テスト結果

```
cd src/api
bundle exec rspec
# => 311 examples, 0 failures
```

requirements.md 1.9のGカテゴリ（テナント分離）・Iカテゴリ（拠点集計/時系列粒度切替/生データ削除後の集約参照/openアラート数）を以下でカバー：

| カテゴリ | 実装スペック |
| --- | --- |
| 拠点集計・openアラート数 | `spec/requests/dashboard_sites_summary_spec.rb` |
| 時系列粒度切替（24h生データ/7d集約データ） | `spec/requests/devices_dashboard_spec.rb` |
| 生データ削除後の集約参照 | `spec/requests/devices_dashboard_spec.rb`（生データ0件の状態で`hourly_aggregates`のみから7d参照できることを検証） |
| 拠点・デバイス一覧/詳細のテナント分離（他ユーザーの拠点・デバイスへの越境不可、401/403/404） | `spec/requests/dashboard_sites_summary_spec.rb`・`spec/requests/devices_dashboard_spec.rb` |
| 日次集約ジョブ（min/max/avg・進行中バケット除外・冪等性） | `spec/jobs/hourly_aggregation_job_spec.rb`・`spec/models/hourly_aggregate_spec.rb` |
| 生データ削除ジョブ（14日境界） | `spec/jobs/raw_data_purge_job_spec.rb` |

## セキュリティレビュー（コミット前・`.claude/rules/testing.md`準拠）

`.claude/QC10.md`・`.claude/TM.md`・`.claude/OWASP10.md`・`.claude/CC.md`を実際に読み、以下の観点でレビューした。

- **QC10**：バックエンドAPIのみの変更でHTML/SEO関連項目は対象外。エラーハンドリング項目（QC10）は401（未認証）・403（テナント越境）・404（未存在）・400（不正パラメータ）を適切なJSONエラーボディで返すことをrequest specで確認済み。
- **TM**：ブラックボックス（HTTPリクエスト/レスポンスのrequest spec）とホワイトボックス（`HourlyAggregate.aggregate_pending_hours!`の内部境界を狙ったmodel spec）の両方でRSpecによる単体・結合テストを作成。
- **OWASP10**
  - A01（アクセス制御）：一覧系（`SitesController#dashboard_summary`/`DevicesController#index`）は`current_user.sites`起点のクエリスコープにより他ユーザーデータが構造的に混入し得ない設計（siteIdクエリに他ユーザーの拠点IDを渡しても積集合で空になることをテストで確認）。個別レコード系（`show`/`telemetry_series`/`commands`）は`TenantScoped#authorize_owner!`で所有者チェックし、他ユーザーのデバイスへは403を返す。
  - A03（インジェクション）：生SQL文字列連結は不使用。`group("devices.site_id")`のみリテラル文字列（ユーザー入力なし）で、他はすべてActiveRecordのプレースホルダ（`where("recorded_at >= ?", ...)`）またはハッシュ条件。`sensorType`パラメータは`SensorType.exists?`で許可値検証してから使用。
  - A04（安全でない設計）：拠点集計はN+1を避けるグループ集計設計（issue本文の明示要求）。集約ジョブは冪等（既存バケットへの再書き込みなし）で再実行安全。
  - A09（ログ・監視不足）：`SitesController#dashboard_summary`・`DevicesController`各アクション・両ジョブに`user_id`/`device_id`/件数等の非機密情報つきで`Rails.logger`出力。デバイストークン等の秘密情報は出力しない。
- **CC**：著作権・商標・特商法表示等に関わる変更はなし（対象外）。
- `bundle exec rubocop app/controllers/api/sites_controller.rb app/controllers/api/devices_controller.rb app/models/hourly_aggregate.rb app/jobs/hourly_aggregation_job.rb app/jobs/raw_data_purge_job.rb config/routes.rb` → no offenses detected
- `bundle exec brakeman -q` → No warnings found（Security Warnings: 0）
- `bundle exec bundler-audit check --update` → No vulnerabilities found
- `git status`でシークレットファイル（`config/master.key`・`.env`等）が含まれていないことを確認し、変更ファイルを個別に`git add`（`-A`/`.`は不使用）。

## 完了確認

- ローカルRSpec：green（311 examples, 0 failures）
- Rubocop／Brakeman／bundler-audit：いずれもクリーン
- CI（`API CI (RSpec)`ワークフロー／rspecチェック）：green（PR #47）
- PR #47：`gh pr merge --squash`で`main`へマージ済み（マージコミット`bbe1852`）、Issue #12は`Closes #12`により自動クローズ

## 残課題（本Issueのスコープ外・今後のIssue向け）

- ダッシュボードUI（Issue #18、マージ済み）は現在`src/web/lib/dashboard/mockData.ts`のモックデータで動作している。本PRで実装したAPIへの接続（`fetch`呼び出しへの置き換え）は別issueでの対応が必要（mockData.tsのコメントに明記済みの既知の残課題）。
- `GET`/`POST`/`DELETE /sites`（拠点自体のCRUD）は未実装。拠点作成・削除のフローが必要になった時点で別issueとして起票することを推奨する。
- `HourlyAggregationJob`/`RawDataPurgeJob`の実際の日次スケジューリング設定（cron/solid_queue recurring等）はデプロイ運用側のタスクとし、本Issueではジョブのロジック本体のみを実装した（`.claude/rules/deploy.md`のスコープ境界に準拠）。
- 拠点数・デバイス数が今後大きく増える場合、`SiteAggregates#compute_latest_readings`のRuby側畳み込みや`HourlyAggregate.aggregate_pending_hours!`の全件Ruby集計はMVP規模（`requirements.md` 1.8節：ユーザー2・拠点2・デバイス2台という最小構成）を前提にしており、大規模化する場合はSQL側での集計（DBポータビリティとのトレードオフ）を再検討する余地がある。
