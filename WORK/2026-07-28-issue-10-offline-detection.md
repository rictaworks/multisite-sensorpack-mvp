# 作業報告：Issue #10 [api] F4 オフライン検知バックエンド

- **日付：** 2026-07-28（JST）
- **担当Issue：** [#10 [api] F4 オフライン検知バックエンド](https://github.com/rictaworks/multisite-sensorpack-mvp/issues/10)
- **PR：** [#38 feat(api): F4 デバイスオフライン検知バックエンドを実装](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/38)（squash merge済み、`main`へマージ、マージコミット`e1b1acc`）
- **ブランチ：** `feature/issue-10-offline-detection`
- **Depends on：** #6（マージ済み、DBスキーマ・マスタデータ）

## 目的

requirements.md 1.6 F4 `detect_offline` に基づき、テレメトリ送信が途絶したデバイスを自動検知して「オフライン」状態にし、オフラインアラートを発報するバックエンド処理を実装する。冒頭注記の「監視：なし」はサービス自体の死活監視を指すものであり、デバイスのオフライン検知は製品機能として実装対象であることをrequirements.md本文の注記で確認済み。

## 実施内容（TDD：plan→red→coding→green）

1. **plan**：受け入れ条件をrequirements.md F4手順・Issue #10 Edit scopeから言語化。
   - 判定式：現在時刻 − last_seen_at ＞ 期待送信間隔×3＋猶予30秒（境界値ちょうどは正常、厳密な超過のみオフライン）
   - 判定直前にトランザクション内でlast_seen_atを再読込し、走査中の競合（誤発報）を排除
   - オフライン判定時：状態→offline、オフラインアラートをopen（open中は重複生成しない）
   - 復帰：`markOnline`相当のメソッドでonlineへ戻し、オフラインアラートを自動close（呼び出し箇所は#9側の実装に委ねる）
   - provisioning（登録直後・テレメトリ未受信）は判定対象外
2. **red**：`spec/jobs/offline_detection_job_spec.rb`（新規）、`spec/models/device_spec.rb`・`spec/models/alert_spec.rb`への追加テストを先に作成し、`OfflineDetectionJob`未実装／`Device#offline_due?`等未実装の状態で実行、`NameError`/`NoMethodError`で失敗することを確認。
3. **coding**：
   - `src/api/app/jobs/offline_detection_job.rb`（新規）：`Device.online_candidates_for_offline_check`（`deleted: false, status_code: "online"`）を走査し、デバイスごとに`Device.transaction { Device.lock.find_by(id:) ... }`で行ロック付きの再取得を行った上で`offline_due?`を判定、該当すれば`mark_offline!`を呼ぶ。走査後に対象デバイスが消えていた場合はエラーを握りつぶさず`Rails.logger.warn`でログを残してスキップ（デバッグトレース可能性の確保）。
   - `src/api/app/models/device.rb`：`STATUS_PROVISIONING/ONLINE/OFFLINE`・`OFFLINE_INTERVAL_MULTIPLIER`・`OFFLINE_GRACE_PERIOD_SECONDS`等の定数、`offline_deadline_at`/`offline_due?`（境界判定）、`mark_offline!`（状態遷移＋アラートopen、冪等）、`mark_online!`（クラス図の`markOnline()`に対応。状態遷移＋アラート自動close、冪等）、`online_candidates_for_offline_check`スコープを追加。
   - `src/api/app/models/alert.rb`：`Alert.open`スコープ、`Alert#auto_close!`（クラス図の`autoClose()`に対応。closed済みなら何もしない冪等メソッド）を追加。Device側からの重複コードを避け、責務をAlertモデル自身に持たせた。
   - メソッド命名はクラス図のcamelCase（`markOnline`/`autoClose`）を、既存コードベース全体のRuby慣習（snake_case、既存の`STATUSES`/`DIRECTIONS`等の定数パターン）に合わせて`mark_online!`/`auto_close!`として実装（他の`.rb`ファイルにcamelCaseメソッドは存在しないため、一貫性を優先）。
4. **green**：`bundle exec rspec` → **98 examples, 0 failures**（Issue #10関連は33件、既存65件も引き続きgreen）。

## テスト結果

```
cd src/api
bundle exec rspec
# => 98 examples, 0 failures
```

requirements.md 1.9 Cカテゴリ（オフライン検知・6ケース）を`spec/jobs/offline_detection_job_spec.rb`で網羅：

| ケース | 検証内容 |
| --- | --- |
| 未達 | 経過200秒（閾値210秒未満）→ onlineのまま、アラートなし |
| 境界ちょうど | 経過210秒（閾値と厳密に一致）→ onlineのまま、アラートなし（境界値の厳密な超過判定を確認） |
| 超過 | 経過211秒（閾値を1秒超過）→ offline化＋オフラインアラート1件open |
| 超過（重複防止） | ジョブを2回連続実行してもopenアラートは1件のまま |
| 復帰 | `mark_online!`呼び出しでonline復帰＋オフラインアラートがclosedに遷移 |
| テレメトリ同時到達 | `Device.lock`呼び出し直前にDB上の`last_seen_at`を更新するようスタブし、走査時点でstaleだったデバイスが判定直前の再読込で「最新化」されて誤発報しないことを確認 |
| 登録直後provisioning | `last_seen_at`がnilのprovisioningデバイスは対象外（例外も発生しない） |

加えて`spec/models/device_spec.rb`・`spec/models/alert_spec.rb`に`offline_deadline_at`/`offline_due?`/`mark_offline!`/`mark_online!`/`Alert#auto_close!`/`Alert.open`の単体テストを追加。

## セキュリティレビュー（コミット前・`.claude/rules/testing.md`準拠）

- `.claude/QC10.md`：本Issueはバックエンドのバッチ処理でUIを持たないため大半の項目は非該当。QC10（エラーハンドリング）の観点は「デバイス消失等の想定外状態を例外で握りつぶさずログに残す」設計で対応。
- `.claude/OWASP10.md`：
  - A01（アクセス制御）：本ジョブはユーザーリクエスト起点ではない内部バッチ処理であり、テナント越境の入力面はない。
  - A03（インジェクション）：生SQL文字列連結は不使用。すべてActiveRecordの`where`/`pluck`/`lock.find_by`/`update!`/`update_all`（テストコードのみ、パラメータ化済み）を使用。
  - A08（ソフトウェア／データ整合性）：`Device.transaction`内で行ロック付き再取得を行うことで、走査時点の古いデータに基づく誤ったオフライン判定・二重発報を防止。
  - A09（ログ・監視不足）：状態遷移（`mark_offline!`/`mark_online!`）・異常系（デバイス消失）に`Rails.logger.info/warn`を追加し、デバッグ追跡可能性を確保。
  - `bundle exec brakeman -q` → 警告0件、`bundle exec bundler-audit check --update` → 脆弱性0件、`bundle exec rubocop` → 規約違反0件（対象ファイルすべて）。
- `.claude/CC.md`：法務・表示義務系の項目はバックエンド処理のため非該当。
- `git status`でシークレットファイル（`config/master.key`、`.env`等）が含まれていないことを確認（ステージ対象は`src/api/app/jobs/offline_detection_job.rb`、`src/api/app/models/device.rb`、`src/api/app/models/alert.rb`、`src/api/spec/jobs/offline_detection_job_spec.rb`、`src/api/spec/models/device_spec.rb`、`src/api/spec/models/alert_spec.rb`のみ）。

## 完了確認

- ローカルRSpec：green（98 examples, 0 failures）
- Rubocop／Brakeman／bundler-audit：いずれもクリーン
- CI（`api-ci.yml`）：green（PR #38の`rspec`チェック）
- PR #38：`gh pr merge --squash`で`main`へマージ済み（マージコミット`e1b1acc`）、Issue #10は`Closes #10`により自動クローズ

## 残課題（本Issueのスコープ外・今後のIssue向け）

- `mark_online!`（テレメトリ受信時のonline復帰）の実際の呼び出し箇所は#9（`ingest_telemetry`）側の実装に委ねる（Issue #10の受け入れ条件どおり、本Issueではメソッド本体の用意まで）。
- `OfflineDetectionJob`を実際に1分周期で実行するスケジューリング設定（solid_queueのrecurring設定やcron等）は、Edit scope（`offline_detection_job.rb`／`device.rb`／`alert.rb`のみ）に含まれておらず、デプロイ運用側の別タスクとして`TASKS/`に起票が必要。
- オフラインアラートの重要度（severity）は要件に明記がなかったため`warning`を採用した。運用上より重大度を上げるべきか（例：`critical`）は、実際の運用フィードバック次第でservice-managerエージェント側の判断を仰ぐ余地がある。
- F6ダッシュボードでのオフライン状態・アラート表示は別Issue（F6関連）で対応。
