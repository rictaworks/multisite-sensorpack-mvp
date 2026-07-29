# 2026-07-28 GitHub Issue分割・発行(初回)

`.claude/Manager.md` に従い、`requirements.md` と `app-ui/` を元にGitHub Issueを分割・発行した記録。issue発行はマネージャーサブエージェントが行い、subagentへのアサインは人間が手動で行う(`.claude/Manager.md` の役割分担に準拠)。

- 対象リポジトリ: `rictaworks/multisite-sensorpack-mvp`
- 発行issue数: **25件**(epicなし、フラット構成)
- ラベル: `area:frontend` / `area:api` / `area:ai` / `area:firmware` / `area:infra`(領域分類)、`priority:high`(ボトルネックissueの優先度マーカー)。状態(ready/blocked)はラベルで持たず、各issue本文の「Depends on」から都度導出する方針(`.claude/Manager.md` 3節)。

## ディレクトリ構成の前提(今回のissue分割で採用)

サブプロジェクトが未作成のため、以下のディレクトリ構成を今回のissue群で新設する前提とした。

| ディレクトリ | 内容 |
|---|---|
| `src/web/` | Next.js(TypeScript)フロントエンド |
| `src/api/` | Ruby on Rails(APIモード)バックエンド |
| `src/ai/` | Python + FastAPI + LangChain(AI日次サマリー) |
| `src/firmware/` | ESP32(Arduino/PlatformIO)ファームウェア |
| `src/shared/contracts/` | OpenAPIスキーマ・API契約ドキュメント(複数issueから参照される基盤) |
| `src/tools/telemetry-simulator/` | 実機代替の開発・E2E用テレメトリシミュレータ(#9で作成) |
| `src/web/e2e/` | Playwright E2Eテスト(#25) |

いずれも `src/*` 配下のため、実装issueの着手時は `.claude/rules/git-workflow.md` に従い、必ずフィーチャーブランチ＋プルリクエストで作業すること(mainへの直接push禁止)。

## 発行issue一覧・依存関係・Edit scope

| # | タイトル | 領域 | Depends on | Edit scope概要 |
|---|---|---|---|---|
| [#1](../../issues/1) | [基盤][api] Rails APIひな形構築 + CI | area:api / priority:high | なし | `src/api/**`(new), `.github/workflows/api-ci.yml`(new) |
| [#2](../../issues/2) | [基盤][web] Next.jsひな形構築 + CI + i18n基盤 | area:frontend / priority:high | なし | `src/web/**`(new), `src/web/locales/*.json`(new, 7言語), `.github/workflows/web-ci.yml`(new) |
| [#3](../../issues/3) | [基盤][ai] FastAPIひな形構築 + CI | area:ai / priority:high | なし | `src/ai/**`(new), `.github/workflows/ai-ci.yml`(new) |
| [#4](../../issues/4) | [基盤][firmware] ESP32ファームウェアひな形構築 | area:firmware / priority:high | なし | `src/firmware/**`(new) |
| [#5](../../issues/5) | [基盤][infra] API契約・共有型定義(OpenAPI) | area:infra / priority:high | なし | `src/shared/contracts/openapi.yaml`, `CONTRACT.md`(new) |
| [#6](../../issues/6) | [api] DBスキーマ・マスタデータ投入 | area:api / priority:high | #1 | `src/api/db/migrate/**`, `db/seeds.rb`, `app/models/*.rb`(skeleton, new) |
| [#7](../../issues/7) | [api] 認証(Google OAuth)・テナント分離基盤 | area:api | #6 | `app/controllers/concerns/*`, `sessions_controller.rb`, `omniauth*.rb`(new) |
| [#8](../../issues/8) | [api] F1 デバイス登録(クレームコード方式)バックエンド | area:api | #6, #5 | `claim_code.rb`, `device.rb`(edit), `claim_device_service.rb`等(new) |
| [#9](../../issues/9) | [api] F2+F3 テレメトリ受信・閾値判定(ヒステリシス)バックエンド | area:api / priority:high | #8, #5 | `telemetry_ingest_service.rb`, `threshold_evaluation_service.rb`(new)、`telemetry-simulator`(new) |
| [#10](../../issues/10) | [api] F4 オフライン検知バックエンド | area:api | #6 | `offline_detection_job.rb`(new), `device.rb`/`alert.rb`(edit) |
| [#11](../../issues/11) | [api] F5 遠隔制御(コマンド発行・配信・ACK)バックエンド | area:api | #8, #9 | `command.rb`/`automation_rule.rb`(edit), `command_dispatch_service.rb`(new) |
| [#12](../../issues/12) | [api] F6 ダッシュボード集計API・日次集約/生データ削除ジョブ | area:api | #9, #10, #11 | `sites_controller.rb`, `devices_controller.rb`, 集約/削除ジョブ(new) |
| [#13](../../issues/13) | [ai] FastAPI+LangChain 日次サマリー生成サービス | area:ai | #3, #5 | `src/ai/app/routers/summary.py`等(new) |
| [#14](../../issues/14) | [api] F7 AI日次サマリー クォータ制御・FastAPI連携 | area:api | #6, #13, #5 | `daily_summary_service.rb`, `summaries_controller.rb`(new) |
| [#15](../../issues/15) | [api] F8 アラート管理API(一覧・ack) | area:api | #6 | `alerts_controller.rb`(new), `alert.rb`(edit) |
| [#16](../../issues/16) | [api] F9 開発者向け管理画面(BASIC認証) | area:api | #6, #14 | `admin/*.rb`, `admin/**/*.erb`(new), `routes.rb`(edit) |
| [#17](../../issues/17) | [web] Googleログイン画面・認証状態管理 | area:frontend | #2, #5 | `app/(auth)/**`, `lib/auth/**`(new), `locales/*.json`(edit) |
| [#18](../../issues/18) | [web] ダッシュボード(拠点一覧・デバイス詳細・グラフ)UI | area:frontend | #2, #5 | `app/dashboard/**`(new), `locales/*.json`(edit) |
| [#19](../../issues/19) | [web] デバイス登録UI(クレームコード発行・reCAPTCHA) | area:frontend | #2, #5 | `app/devices/claim/**`(new), `locales/*.json`(edit) |
| [#20](../../issues/20) | [web] お知らせ(アラート)一覧・ack UI | area:frontend | #2, #5 | `app/alerts/**`(new), `locales/*.json`(edit) |
| [#21](../../issues/21) | [web] 運用ツール(遠隔制御・自動ルール)UI | area:frontend | #2, #5 | `app/control/**`(new), `locales/*.json`(edit) |
| [#22](../../issues/22) | [web] きょうのまとめ(AI日次サマリー)UI | area:frontend | #2, #5 | `app/summary/**`(new), `locales/*.json`(edit) |
| [#23](../../issues/23) | [firmware] ESP32 クレーム登録(APモード・WiFi設定) | area:firmware | #4, #5 | `src/firmware/src/claim/**`, `wifi_provisioning/**`(new) |
| [#24](../../issues/24) | [firmware] ESP32 テレメトリ送信・コマンド受信・ACK・アクチュエータ駆動 | area:firmware | #23, #5 | `src/firmware/src/telemetry/**`, `actuators/**`(new) |
| [#25](../../issues/25) | [infra] E2E主要導線Playwrightテスト | area:infra | #9,#10,#11,#12,#14,#15,#17〜#22 | `src/web/e2e/**`(new) |

各issue本文には目的/Depends on(`- [ ] #<番号>`形式)/Edit scope/受け入れ条件を必須項目として記載済み(`.claude/Manager.md` 2節準拠)。

## Grouping方針

1. **土台(#1〜#5、依存なし)**: Next.js/Rails/FastAPI/ESP32それぞれのひな形+CI、およびAPI契約(OpenAPI)を、互いに独立した並列issueとして先行させた。5人(または5並列)が同時着手できる。
2. **バックエンド機能群(#6〜#16)**: `#6`(DBスキーマ)を土台に、F1〜F9の関数ロジック(requirements.md 1.6)ごとに1issue、原則1機能=1issueで分割。F2とF3はrequirements.md上「テレメトリ保存後にF3を同期実行する」と密結合のため1issueに統合した。F4(オフライン検知)はDeviceスキーマのみに依存させ、F2/F3実装と並列進行できるようにした。
3. **AI連携(#13, #14)**: FastAPI側の生成ロジック(#13)とRails側のクォータ制御・呼び出し(#14)を分離し、AI/バックエンドで並列着手可能にした。
4. **フロントエンド機能群(#17〜#22)**: `app-ui/SensorPack Dashboard.dc.html` の画面単位(ログイン/拠点のようす/センサーパックを追加する/お知らせ/運用ツール/きょうのまとめ)に1:1対応させ、全画面issueが `#2`(web土台)と `#5`(契約)のみに依存する形にして最大限並列化した。`app-ui/` は各issueで参照のみとしEdit scope外。
5. **ファームウェア(#23, #24)**: クレーム登録(WiFi/AP)とテレメトリ送信・制御を分離。
6. **統合E2E(#25)**: 最終的な主要導線検証として、関連するバックエンド・フロントエンドissueの多くに依存する形にした(意図的な最終ゲート)。コンフリクト解消・ロジック整合性の担保は通常のマージフローとセキュリティレビュー/コードレビューに委ね、本issueは「動く」ことの確認に限定。

## クリティカルパス・ボトルネック分析

直接の依存(fan-out)数が多い順:

| issue | 直接ブロックするissue数 |
|---|---|
| **#5(API契約)** | **12件**(#8,9,13,14,17〜24のうちAPI契約を直接参照する全issue) |
| **#6(DBスキーマ)** | **6件**(#7,8,10,14,15,16) |
| **#2(web土台)** | **6件**(#17〜#22) |
| #9(F2+F3) | 3件(#11,12,25) |
| #8, #10, #11, #14 | 各2件 |

- **最大のボトルネックは #5(API契約/OpenAPI)。** 依存なしで即着手可能だが、web/api/ai/firmwareのほぼ全機能issueが直接参照するため、#1〜#4の土台issueと同時並行で最優先に着手・完了させるべき。
- 次点は **#6(DBスキーマ・マスタデータ)**。Railsバックエンドの全機能issueの土台であり、#1完了後ただちに着手すべき。
- フロントエンドは **#2(web土台)** 完了後、#5があれば6画面すべて並列着手可能。
- **最長の依存チェーン(critical path)**: `#1 → #6 → #8 → #9 → #11 → #12 → #25`(7段)。これがバックエンド側で最も長い一本道であり、この経路の各issueは着手可能になり次第優先的に着手・完了させることで全体のリードタイムを最短化できる。
- `#25`(E2E)は設計上最後に多くのissueへ依存する意図的な最終ゲートであり、ボトルネックというより統合確認の役割。

## 発行時バリデーション結果

- 循環依存: なし(全25issueに対しDFSで検証済み)
- 存在しないissue番号への参照: なし
- 全issueに目的/Depends on/Edit scope/受け入れ条件のセクションが存在することを確認済み

## 発行時点(2026-07-28)でreadyなissue

依存なし、またはすべての依存issueがclosedのもの。発行直後のため以下の5件がready(#1〜#4はいずれも独立、#5は他issueの土台だが依存関係自体は「なし」)。

- **#1** [基盤][api] Rails APIひな形構築 + CI
- **#2** [基盤][web] Next.jsひな形構築 + CI + i18n基盤
- **#3** [基盤][ai] FastAPIひな形構築 + CI
- **#4** [基盤][firmware] ESP32ファームウェアひな形構築
- **#5** [基盤][infra] API契約・共有型定義(OpenAPI)

この5件は互いに独立しているため、人手を割ければ最大5並列で同時着手できる。次にreadyになるのは #1 close後の #6、および #2・#5 close後の #17〜#22(6画面同時並列)である。
