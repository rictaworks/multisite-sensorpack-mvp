# 作業報告：Issue #15 [api] F8 アラート管理API(一覧・ack)

- **日付：** 2026-07-28（JST）
- **担当Issue：** [#15 [api] F8 アラート管理API(一覧・ack)](https://github.com/rictaworks/multisite-sensorpack-mvp/issues/15)
- **PR：** [#39 feat(api): F8 アラート管理API(一覧・未対応件数・ack)を追加](https://github.com/rictaworks/multisite-sensorpack-mvp/pull/39)（squash merge済み、`main`へマージ、マージコミット`3c53a99`）
- **ブランチ：** `feature/issue-15-alert-management`
- **Depends on：** #6（マージ済み、DBスキーマ・マスタデータ）

## 目的

requirements.md 1.6 F8 `manage_alerts` に基づき、アラートの一覧取得・確認(ack)・アプリ内通知バッジ用の未対応件数取得APIを実装する。通知はアプリ内通知のみでメール通知は実装しない(requirements.md 1.4)。closeはユーザー操作からは行えず、閾値/オフラインの解除条件成立時の自動処理(#9・#10)のみで行う。

## 実施内容（TDD：plan→red→coding→green）

1. **plan**：Issue #15受け入れ条件・`src/shared/contracts/openapi.yaml`(`listAlerts`/`acknowledgeAlert`)を正として言語化。
   - `GET /api/alerts`：statusクエリ(カンマ区切り)未指定時はopen/acknowledgedのみ、deviceIdクエリで絞り込み可
   - `GET /api/alerts/unread_count`：通知バッジ用のopen件数(openapi.yamlに未定義の追加エンドポイントだが、契約のレスポンススキーマは`additionalProperties`制限がなく拡張可能と判断し、契約テスト`src/shared/contracts/tests/contract.test.mjs`は変更不要であることを確認済み)
   - `POST /api/alerts/:alertId/ack`：open→acknowledged、acknowledged→acknowledged(冪等)、closed→409
   - テナント分離：自分の拠点配下デバイスのアラートのみ操作可(他ユーザーのアラートは403、存在しないIDは404)
2. **red**：`spec/requests/api/alerts_spec.rb`(新規15件)・`spec/models/alert_spec.rb`(追記3件)を先に作成し、ルーティング・コントローラ未実装の状態で実行、404/NameError等で失敗することを確認。
3. **coding**：
   - `src/api/app/models/alert.rb`：`AlreadyClosedError`例外クラスと`Alert#acknowledge!`(状態遷移をモデルに集約。open→acknowledged、acknowledged→冪等no-op、closed→例外送出)を追加。
   - `src/api/app/controllers/api/alerts_controller.rb`(新規)：`index`/`unread_count`/`ack`の3アクション。`scoped_alerts`で`Alert.joins(device: :site).where(sites: { user_id: current_user.id })`によりテナント分離を構造的に保証。レスポンスはopenapi.yamlのAlertスキーマに合わせたcamelCase(`deviceId`/`alertType`/`openedAt`等)で手動シリアライズ(シリアライザgem未導入のためYAGNIに則りプレーンなHash構築)。
   - `src/api/config/routes.rb`：`namespace :api`配下に`alerts`/`alerts/unread_count`/`alerts/:alertId/ack`を追加。
   - **認証の暫定実装について**：Google OAuthセッション基盤(#7)は本Issue時点で未マージ。`current_user`をセッションから解決する実装は#7の担当範囲(Edit scope: `concerns/*.rb`・`sessions_controller.rb`)であり、本Issueでは重複実装を避けるため、`Api::AlertsController`内に閉じたプライベートメソッドとして「development/test環境限定の`X-Debug-User-Id`ヘッダー」でcurrent_userを解決する暫定実装のみを置いた。production環境ではこのヘッダーを一切参照せず`current_user`は常に`nil`となり、結果として全リクエストが401になる(fail closed。「未実装の認証を偽装して通す」のではなく「実認証が揃うまで安全側に倒して誰も通さない」設計)。`.claude/rules/environment.md`の要求どおり、production環境でバイパスされないことを検証するテストを追加した。#7マージ後はこの部分をApplicationController共通のセッションベース実装に置き換える想定(コード内にNOTEコメントで明記)。
4. **green**：`bundle exec rspec` → 実装直後**100 examples, 0 failures**。その後、並行実装中だったIssue #10(`app/models/alert.rb`を編集)がmainへ先にマージされたため、`git merge origin/main`でコンフリクト(`alert.rb`・`alert_spec.rb`)が発生。両者の変更(#10の`scope :open`/`auto_close!`と、本Issueの`AlreadyClosedError`/`acknowledge!`)を両方保持する形で解消し、マージ後に再度**116 examples, 0 failures**を確認。

## テスト結果

```
cd src/api
bundle exec rspec
# => 116 examples, 0 failures（マージ後の最終確認）
```

`spec/requests/api/alerts_spec.rb`(15件)の内訳：

| 観点 | 検証内容 |
| --- | --- |
| 認証 | 未認証は401(一覧・件数・ack全て) |
| 一覧 | 既定はopen/acknowledgedのみ、closed・他テナントは含まない |
| 一覧 | statusクエリでの明示的な絞り込み(例：closed) |
| 一覧 | deviceIdクエリでのデバイス単位絞り込み |
| 一覧 | レスポンス形状がopenapi.yaml契約のcamelCaseと一致 |
| 一覧 | 不正なstatus値は400 |
| 未対応件数 | 自分のopenアラート件数のみ(acknowledged/closed/他テナントは含めない) |
| ack | open→acknowledged遷移、acknowledged_at記録 |
| ack | 既にacknowledged済みへの再ackは冪等に200 |
| ack | closed済みへのackは409、状態変更なし |
| ack | 存在しないIDは404 |
| ack | **テナント分離**：他ユーザーのアラートは403、状態変更なし |
| 環境フェイルクローズ | development/test以外ではデバッグヘッダーが機能せず401 |

`spec/models/alert_spec.rb`への追加(`#acknowledge!`、3件)：open→acknowledged、二重ackの冪等性、closed済みへの`AlreadyClosedError`送出。

## セキュリティレビュー（コミット前・`.claude/rules/testing.md`準拠）

- `.claude/QC10.md`：本Issueはバックエンドの純粋なJSON APIでHTML/UIを持たないため大半の項目は非該当。QC10相当のエラーハンドリングは401/403/404/409/400を明示的に返すことで対応(想定外状態の握りつぶし・フォールバックはしない)。
- `.claude/OWASP10.md`：
  - **A01（アクセス制御）**：`scoped_alerts`による拠点所有者スコープ＋`set_alert`での明示的な所有者チェック(403)。テナント分離を専用のリクエストスペックで検証。
  - A03（インジェクション）：生SQL不使用、ActiveRecordのパラメータ化クエリのみ。statusクエリはActiveRecordが安全に処理するが、想定外値は`Alert::STATUSES`ホワイトリストで400として明示的に拒否(フォールバックで無視しない)。
  - A04（セキュリティ設計）：状態遷移ロジックをモデル(`Alert#acknowledge!`)に集約し、手動close試行を`AlreadyClosedError`で明示的に拒否。
  - **A05/A07（設定ミス・認証欠陥）**：認証基盤(#7)未着手という制約下で、暫定手段を「development/testのみ許可」のアローリストとして実装し、production環境では絶対にバイパスされない(fail closed)ことをテストで保証。
  - A06（脆弱な依存）：新規gem追加なし。`bin/bundler-audit` → 脆弱性0件。
  - A09（ログ・監視）：一覧取得・ack遷移・テナント越境試行(warn)にログ出力を追加し、デバッグ追跡可能性を確保。
  - `bin/rubocop` → 83ファイル中offense 0件、`bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error` → Security Warnings 0件。
- `.claude/CC.md`：法務・表示義務系の項目はバックエンドAPIのため非該当。
- `git status`でシークレットファイル(`config/master.key`・`.env`等)が含まれていないことを確認(ステージ対象は`alert.rb`・`alerts_controller.rb`(新規)・`routes.rb`・`alerts_spec.rb`(新規)・`alert_spec.rb`のみ)。

## 完了確認

- ローカルRSpec：green（マージ後116 examples, 0 failures）
- Rubocop／Brakeman／bundler-audit：いずれもクリーン
- CI（`api-ci.yml`の`rspec`ジョブ）：PR #39でgreen確認後、main反映後のpushトリガーでもgreenを確認
- PR #39：`gh pr merge --squash`で`main`へマージ済み（マージコミット`3c53a99`）、Issue #15は`Closes #15`により自動クローズ
- マージ時のコンフリクト：Issue #10(`app/models/alert.rb`編集)との競合が発生したが、想定内の通常のマージフローで解消（両Issueの変更を両方保持）

## 残課題（本Issueのスコープ外・今後のIssue向け）

- **認証の本実装**：Issue #7(Google OAuth・テナント分離基盤)がマージされ次第、`Api::AlertsController`の暫定`current_user`/`resolve_current_user`をApplicationController共通のセッションベース実装に置き換える必要がある(コード内にNOTEコメントで明記済み)。それまでproduction環境ではこのAPIに誰もアクセスできない(意図的なfail closed)。
- **アラート種別コードの不一致**：DBシード(#6)の`alert_types.code`は`threshold_upper_breach`/`threshold_lower_breach`/`offline`だが、`src/shared/contracts/openapi.yaml`の`AlertTypeCode`列挙は`upper_breach`/`lower_breach`/`offline`となっており値が一致していない。本Issueのレスポンスは`alert_type_code`をそのまま`alertType`として透過するのみで、このマッピング解消は本Issueのスコープ外(#6または契約側の別Issueでの対応が必要)。
- `unread_count`エンドポイントはopenapi.yamlに未定義のため、Issue #20(web お知らせUI)が実クライアントに接続する際は契約への追記(または既存`/alerts`レスポンスへの統合)を検討の余地がある。
- F6ダッシュボードの`openAlertCount`集計との整合(同じ「open件数」の考え方を再利用できるか)は、F6実装Issue側の判断に委ねる。
