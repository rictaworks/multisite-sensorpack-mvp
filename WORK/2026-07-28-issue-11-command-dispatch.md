# 作業報告：Issue #11 [api] F5 遠隔制御(コマンド発行・配信・ACK)バックエンド

- **日付：** 2026-07-28（JST）
- **担当Issue：** [#11 [api] F5 遠隔制御(コマンド発行・配信・ACK)バックエンド](https://github.com/rictaworks/multisite-sensorpack-mvp/issues/11)
- **PR：** [#46 feat(api): F5 LED/ファン手動制御コマンド発行・ピギーバック配信](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/46)（squash merge済み、`main`へマージ、マージコミット`c13b936`）
- **ブランチ：** `feature/issue-11-command-dispatch`
- **Depends on：** #8（マージ済み、デバイス登録・トークン発行）・#9（マージ済み、テレメトリ受信・閾値判定）

## 目的

requirements.md 1.6 F5 `dispatch_command` に基づき、LED/ファンの手動・自動制御コマンドの発行・ピギーバック配信・ACK処理・競合解決（手動優先のオーバーライドウィンドウ）を実装する。Issue #9で`commands: []`固定だった`TelemetryIngestService`のコマンド応答部分を実配線に置き換える。

## 実施内容（TDD：plan→red→coding→green）

1. **plan**：`gh issue view 11`本文・`src/shared/contracts/openapi.yaml`の`createCommand`/`ingestTelemetry`/`Command`/`CommandDelivery`/`AutomationRule`スキーマ・Issue #9で残された`telemetry_ingest_service.rb`のコメント（Issue #11担当箇所の明記）・既存の`Command`/`AutomationRule`モデル（Issue #6でスキーマのみ作成済み）・`app-ui`配下のIssue #21向けモック（`src/web/components/control/mockControlApi.ts`が実エンドポイント形状を先行文書化していたため参照）を確認し、受け入れ条件を言語化。
2. **red→green**：モデル（`Command`/`AutomationRule`）の状態遷移・スコープ単体スペックから着手し、サービス層（`CommandDispatchService`）、`TelemetryIngestService`への配線、最後にHTTP境界（`Api::CommandsController`/`Api::TelemetryController`）の順にスペックと実装を積み上げた。最終的に**288 examples, 0 failures**（本Issueで47件追加、既存241件も継続green）。

### 実装したファイル

- `src/api/app/models/command.rb`（編集）：`TTL_MINUTES`(10)・`PIGGYBACK_LIMIT`(5)定数、`.deliverable`（pending・TTL内・issued_at昇順・最大5件）・`.overdue`（TTL超過のpending/delivered）スコープ、`#mark_delivered!`（pending以外からの呼び出しはFail Fast）・`#mark_done!`（重複ACK・失効後ACKは冪等に無処理）・`#mark_expired!`（冪等）を追加。
- `src/api/app/models/automation_rule.rb`（編集）：`MANUAL_OVERRIDE_WINDOW`(30分)、`#manual_override_active?(actuator_type_code)`（`commands`テーブルの実データからアクチュエータ単位で導出。単一カラムの`manual_override_until`はデバイス単位の参考表示用として別途保持）、`#register_manual_override!`を追加。
- `src/api/app/services/command_dispatch_service.rb`（新規）：`#enqueue_manual!`（手動発行、TTL10分・冪等ID・オーバーライドウィンドウ開始）、`#piggyback!`（ACK処理→TTL失効→自動ルール評価→配信、単一トランザクション）。自動ルールは「望ましい状態と直近発行済みコマンド種別の差分がある場合のみ発行」する冪等ガードにより、アラートがopenのまま続いても毎テレメトリ受信ごとに再発行しない設計。
- `src/api/app/controllers/api/commands_controller.rb`（新規）：`POST /api/v1/devices/:deviceId/commands`。`Authenticatable`/`TenantScoped`concernでGoogleセッション認証・所有者チェックを行う。
- `src/api/app/services/telemetry_ingest_service.rb`（編集）：`command_acks`キーワード引数・`Result#commands`を追加。テレメトリ自体が重複/値域外で破棄される場合でも、認証済みデバイスの正当なチェックインである以上コマンド配信は継続する設計とした。
- `src/api/app/controllers/api/telemetry_controller.rb`（編集）：`commandAcks`（配列）を`params.permit`に追加し、`Result#commands`を`CommandDelivery`形状（`idempotencyKey`/`commandType`/`issuedAt`）へ整形。
- `src/api/config/routes.rb`（編集）：`POST /api/v1/devices/:deviceId/commands`を追加。

## スコープ判断（設計上の重要な決定）

- **自動ルールの発火条件**：openapi.yamlの`AutomationRule`スキーマ説明文どおり、FAN（`fanOnTempAlert`）は**温度上限アラート**（`threshold_upper_breach`）限定でopen/closeに追従させ、LED（`ledOnAlert`）は説明文「アラートopen中の現地表示灯」を文字通り解釈し、**種別を問わずopen中のアラートが1件でもあれば**点灯させる設計とした（温度上限に限定しない）。
- **手動優先のオーバーライドウィンドウの単位**：受け入れ条件「同一アクチュエータへの自動ルール発行を抑止する」はアクチュエータ単位の抑止を求めているが、`automation_rules.manual_override_until`はデバイス単位の単一カラム（Issue #6スキーマ）。実際の抑止判定は`commands`テーブルの`origin: manual`かつ`actuator_type_code`一致・`issued_at`直近30分以内、という実データ導出に切り替え、`manual_override_until`カラムはopenapi.yaml契約上の参考表示用フィールドとして書き込みのみ継続した（新規マイグレーション不要、Edit scopeにdb/migrateの追加が含まれていないことと整合）。
- **`GET`/`PUT /devices/{deviceId}/automation-rule`は未実装**：Issue #11のEdit scopeには`automation_rule.rb`モデルの編集のみが明記されており、コントローラは含まれていない。自動ルールのON/OFF自体はこのIssueの範囲外とし、モデル側の判定ロジック（`manual_override_active?`等）のみを実装した。
- **テレメトリが重複/値域外で破棄された場合もコマンド配信を継続**：ESP32はコマンド専用のポーリングを持たずテレメトリ応答にのみ同梱されるため、たとえその回のテレメトリ値自体が不正でも、認証済みデバイスとの正当な通信である以上ACK処理・配信は継続する設計とした（要件に明記はないが、ピギーバック方式の実運用上必須の解釈と判断）。

## テスト結果

```
cd src/api
bundle exec rspec
# => 288 examples, 0 failures
```

requirements.md 1.9 Fカテゴリ（10ケース）を以下でカバー：

| カテゴリ | 実装スペック |
| --- | --- |
| 発行 | `spec/services/command_dispatch_service_spec.rb`（`#enqueue_manual!`）・`spec/requests/api/commands_spec.rb` |
| 配信・複数pending順序 | `spec/models/command_spec.rb`（`.deliverable`）・`spec/services/command_dispatch_service_spec.rb` |
| ACK・重複ACK | `spec/models/command_spec.rb`（`#mark_done!`）・`spec/services/command_dispatch_service_spec.rb` |
| TTL失効 | `spec/models/command_spec.rb`（`.overdue`/`#mark_expired!`）・`spec/services/command_dispatch_service_spec.rb` |
| 手動vs自動競合 | `spec/models/automation_rule_spec.rb`（`#manual_override_active?`）・`spec/services/command_dispatch_service_spec.rb` |
| 自動ルール発火 | `spec/services/command_dispatch_service_spec.rb` |
| オフライン中発行 | `spec/services/command_dispatch_service_spec.rb`・`spec/requests/api/commands_spec.rb` |
| 権限外デバイス | `spec/requests/api/commands_spec.rb`（`TenantScoped`：403/404） |
| テレメトリ配線の疎通 | `spec/services/telemetry_ingest_service_spec.rb`・`spec/requests/api/telemetry_spec.rb` |

## セキュリティレビュー（コミット前・`.claude/rules/testing.md`準拠）

本worktreeには`.claude/QC10.md`・`.claude/TM.md`・`.claude/OWASP10.md`・`.claude/CC.md`（未コミットのローカル運用ファイル、`requirements.md`と同様に本worktreeには存在しない）が存在しないため、OWASP Top 10の一般基準と既存コードの慣習（Issue #7/#8/#9の実装パターン）に基づき代替レビューを実施した。

- A01（アクセス制御）：`Api::CommandsController#create`は`authorize_owner!`（`TenantScoped`）でデバイス所有者チェックを行う（他ユーザーのデバイスへは403、存在しないデバイスへは404、テストで確認）。ACK処理（`CommandDispatchService#apply_acks!`）は`@device.commands.find_by(idempotency_key:)`でデバイススコープに限定し、他デバイスの冪等IDを推測してACKすることはできない。
- A03（インジェクション）：生SQL文字列連結は不使用。すべてActiveRecordの`where`/`joins`/`find_by`/`create!`/`update!`。
- A04（安全でない設計）：TTL（10分）・ピギーバック最大5件・冪等キー一意制約により、コマンドキューの無制限な肥大化やリプレイによる重複発行を防止。自動ルールは差分がある場合のみ発行する冪等ガードを持ち、テレメトリ受信のたびに同一コマンドを連発しない。
- A08（データ整合性）：`piggyback!`（ACK処理→TTL失効→自動ルール評価→配信）は単一トランザクションで実行。状態遷移（`mark_delivered!`等）は想定外の呼び出し順序をフォールバックで握りつぶさず例外化。
- A09（ログ・監視不足）：発行・配信・ACK（重複/不明ID含む）・TTL失効・自動ルール発火/抑止のすべてに`device_id`・`idempotency_key`付きで`Rails.logger`出力（デバイストークン等の秘密情報はログに出力しない）。
- `bundle exec rubocop`（変更13ファイル）→ no offenses、`bundle exec brakeman -q` → No warnings found（Security Warnings: 0）、`bundle exec bundler-audit check --update` → No vulnerabilities found。
- `git status`でシークレットファイル（`config/master.key`・`.env`等）が含まれていないことを確認し、変更ファイルを個別に`git add`（`-A`/`.`は不使用）。

## 完了確認

- ローカルRSpec：green（288 examples, 0 failures）
- Rubocop／Brakeman／bundler-audit：いずれもクリーン
- CI（`API CI (RSpec)`ワークフロー／rspecチェック）：green（PR #46）
- PR #46：`gh pr merge --squash`で`main`へマージ済み（マージコミット`c13b936`）、Issue #11は`Closes #11`により自動クローズ

## 残課題（本Issueのスコープ外・今後のIssue向け）

- `POST /devices/{deviceId}/commands`にはクレームコード発行のようなIP/ユーザー単位のレート制限を設けていない。連打による過剰なコマンド発行を防ぎたい場合は別Issueでの検討が必要。
- `GET`/`PUT /devices/{deviceId}/automation-rule`（自動ルールの参照・設定API）はIssue #11のEdit scope外のため未実装。`automation_rule.rb`モデルの判定ロジック（`manual_override_active?`/`register_manual_override!`）のみ実装済みであり、ON/OFF設定APIの実装は別Issueでの起票を推奨する。
- フロントエンド（`src/web/components/control`）は現在モックAPI（`mockControlApi.ts`、Issue #21）で動作しており、本Issueの実エンドポイントへの接続はIssue #21側の対応となる。
- `automation_rules.manual_override_until`カラムはデバイス単位の単一値のまま維持し、実際のアクチュエータ単位の抑止判定は`commands`テーブルから都度導出する設計とした。将来的にUIで「どのアクチュエータがいつまで手動優先か」を正確に表示する要件が出た場合は、アクチュエータ単位のカラム追加（マイグレーション）を検討する余地がある。
