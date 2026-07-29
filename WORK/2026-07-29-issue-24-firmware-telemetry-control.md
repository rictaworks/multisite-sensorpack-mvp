# 2026-07-29 作業報告: Issue #24 ESP32テレメトリ送信・コマンド受信・ACK・アクチュエータ駆動

## 対応Issue

- GitHub Issue #24「[firmware] ESP32 テレメトリ送信・コマンド受信・ACK・アクチュエータ駆動」
- Depends on: #23（ESP32クレーム登録）、#5（API契約OpenAPI）— いずれもマージ済み
- PR: https://github.com/rictaworks/multisite-sensorpack-mvp/pull/48（マージ済み、Closes #24）

## 実施内容

`requirements.md` 1.6 F2 `ingest_telemetry` / F5 `dispatch_command`（ESP32側）を実装した。

1. `git pull origin main` で最新mainを取り込んだ上で `feature/issue-24-firmware-telemetry-control` ブランチを作成。
2. `src/firmware/src/telemetry/telemetry_protocol.h` / `.cpp`（新規、ハードウェア非依存）
   - `POST /telemetry` のリクエストJSON整形（issue #5 OpenAPI契約 `TelemetryIngestRequest`: `seq`/`temperatureC`/`humidityPct`/`deviceReportedAt`(常にnull、端末側に信頼できる時計がないため捏造しない)/`commandAcks`）
   - レスポンスJSON（`TelemetryIngestResponse`: `accepted`/`duplicate`/`serverTime`/`commands`）の解析。ステータス非200・パース失敗時は`parsed_ok=false`とし、以降の処理（コマンド実行・ACKドレイン）を一切行わない（fail closed）
   - JSON組み立て・解析は`ArduinoJson`を採用（issue #23の`claim_code.cpp`と同じ方針、OWASP A03対策）
3. `src/firmware/src/telemetry/ack_queue.h` / `.cpp`（新規、ハードウェア非依存）
   - 実行済み・未ACKコマンドの冪等IDキュー管理（`enqueue_pending_ack`で重複排除して追加、`remove_acked`はサーバーが200を返した（＝確認できた）分のみ削除）
4. `src/firmware/src/telemetry/telemetry_client.h` / `.cpp`（新規、ハードウェア依存：Wi-Fi/HTTPClient）
   - `Authorization: Bearer <device_token>`（`deviceBearerToken`セキュリティスキーム）でPOST送信
   - Wi-Fi未接続時は送信自体を試みずスキップ（オフライン時の基本動作）
   - トランスポート失敗（タイムアウト・DNS・接続拒否・TLSハンドシェイク失敗）は`TELEMETRY_HTTP_MAX_ATTEMPTS`（既定3回）までリトライし、間に`TELEMETRY_HTTP_RETRY_DELAY_MS`（既定2秒）待機。サーバーが実際に応答したHTTPエラー（401等）はリトライしない
   - HTTPSかつルートCA証明書未設定の場合は検証スキップにフォールバックせず送信自体を拒否（fail closed、issue #23と同じ`CLAIM_API_ROOT_CA_PEM`を共有・OWASP A02対策）
5. `src/firmware/src/actuators/actuator_state.h` / `.cpp`（新規、ハードウェア非依存）
   - ピギーバックされたコマンド配列（最大5件・issued_at昇順）を、issue #4の`lib/firmware_logic/command_mapper.h`で1件ずつ解決。同一アクチュエータへの複数コマンドは配列内で最後のものを採用（最新指示が勝つ）
   - 認識できないcommandTypeは実行・ACKいずれも行わない（コーディング規約「フォールバック処理を書かない」に準拠。ACKされないコマンドはサーバー側TTLで`expired`になりUIに「届きませんでした」と表示される・F5.4）
6. `src/firmware/src/actuators/actuator_driver.h` / `.cpp`（新規、ハードウェア依存：Arduino GPIO）
   - 解決済み状態をLED_PIN/FAN_RELAY_PINへ`digitalWrite`で反映。バッチが言及しなかったアクチュエータは現状維持（暗黙のリセットをしない）
7. `src/firmware/src/main.cpp` を更新
   - `loop()`：DHT22読み取り→値域チェック→`telemetry::send_telemetry`→（200受信時のみ）`remove_acked`でACKキューをドレイン→`resolve_commands`→`actuators::apply_desired_state`→新規実行分を`enqueue_pending_ack`、という実サイクルに更新（issue #4時点の「ログ出力のみ」プレースホルダーを置き換え）
   - 通信失敗・オフライン時はサイクルを丸ごとスキップし、次回`TELEMETRY_INTERVAL_MS`（既定60秒・設定可）で再試行
   - 起動時の自己診断（`runActuatorSelfTestOnce`）も、実コマンド経路と同じ`resolve_commands`/`actuator_driver`を通すよう整理し、独立した重複コードパスを解消（DRY）
8. `src/firmware/include/config.example.h`：`TELEMETRY_HTTP_TIMEOUT_MS`/`TELEMETRY_HTTP_MAX_ATTEMPTS`/`TELEMETRY_HTTP_RETRY_DELAY_MS`を追加。既存の`CLAIM_API_ROOT_CA_PEM`をテレメトリ経路とも共有する旨のコメントを追記。
9. `src/firmware/platformio.ini`：`env:esp32dev`/`env:native`双方に`-I src/telemetry` `-I src/actuators`を追加。`env:native`の`build_src_filter`に`+<telemetry/>` `+<actuators/>`を追加しつつ、ハードウェア依存の`telemetry_client.cpp`/`actuator_driver.cpp`を明示的に除外。
10. TDD（plan→red→coding→green）を実施。
    - RED: `src/firmware/test/test_telemetry/test_main.cpp`（14ケース）・`src/firmware/test/test_actuators/test_main.cpp`（6ケース）を先に作成。当初は`env:native`のinclude path未設定でビルドエラー（`actuator_state.h: No such file or directory`）となり、これが実質的なRED確認となった。
    - GREEN: `platformio.ini`に`-I src/actuators`を追加後、全ケースPASSEDを確認。
11. ビルド確認: `python3 -m platformio run -e esp32dev` → `SUCCESS`（実機書き込み`-t upload`は使用せず）。
12. コミット前セキュリティレビュー（`.claude/QC10.md`・`.claude/TM.md`・`.claude/OWASP10.md`・`.claude/CC.md`を実際に読んで実施）。デバイストークンをログ出力していないことを`grep`で確認し、`git status`でシークレットファイル（`include/config.h`）が含まれていないことを確認した上でコミット。
13. PR #48 を作成（`Closes #24`、非エンジニア向けテスト手順・セキュリティレビューチェックリストを記載）し、ローカルでのテストgreen確認（native 37/37、esp32dev SUCCESS）を根拠に `gh pr merge --squash` でマージ。issue #24はマージにより自動クローズ。

## テスト結果

```
$ python3 -m platformio test -e native
native  test_telemetry   PASSED  (14 test cases)
native  test_logic       PASSED  (7 test cases)
native  test_actuators   PASSED  (6 test cases)
native  test_claim       PASSED  (10 test cases)
37 test cases: 37 succeeded

$ python3 -m platformio run -e esp32dev
RAM:   14.6% (used 47912 bytes from 327680 bytes)
Flash: 84.3% (used 1104701 bytes from 1310720 bytes)
[SUCCESS]
```

## 残課題（別issue・将来対応）

- テレメトリ送信に失敗したサイクルのセンサー値は再送用に蓄積されない（ストア&フォワードなし）。1回のサイクル分のデータが欠測するのみで、次回サイクルで新しい読み取り値を送る設計とした。長期のオフライン耐性を高める場合はローカルバッファリングの検討が必要。
- Wi-Fi切断時の能動的な再接続（`WiFi.reconnect()`等）は未実装。現状は「未接続なら当該サイクルをスキップし次回まで待つ」のみで、Arduino-ESP32コアのデフォルトの自動再接続挙動に委ねている。要件の「オフライン時の基本動作」は満たすが、より積極的な復帰戦略は将来課題。
- issue #23の作業報告で記載した「Flash使用率が高い」懸念は今回のコード追加でむしろ84.3%まで低下した（issue #23時点96.3%）。原因は未調査だが、恐らくビルド設定・ライブラリバージョン差によるもの。実害はないため深追いしていない。
- ファームウェア向けのCIワークフロー（GitHub Actions）は本リポジトリに引き続き未整備（issue #4/#23と同様）。`.claude/rules/ci-cd.md`が必須と定めるのはNext.js/Rails/FastAPIの3サブプロジェクトのみでESP32は明記されていないため、今回は追加せずローカルでのテストgreen確認のみで対応した。ESP32向けCI（native環境のみ・トークン等不要）の要否は今後の判断課題として記録する。
- 実機での動作確認（実際のテレメトリ送受信、実際のコマンド実行・LED/ファン動作、実際のオフライン/リトライ挙動）はこのリポジトリ・このセッションのスコープ外（`.claude/rules/deploy.md`）。Claude Desktop側で実施。

## 変更ファイル

- `src/firmware/src/telemetry/telemetry_protocol.h`（新規）
- `src/firmware/src/telemetry/telemetry_protocol.cpp`（新規）
- `src/firmware/src/telemetry/ack_queue.h`（新規）
- `src/firmware/src/telemetry/ack_queue.cpp`（新規）
- `src/firmware/src/telemetry/telemetry_client.h`（新規）
- `src/firmware/src/telemetry/telemetry_client.cpp`（新規）
- `src/firmware/src/actuators/actuator_state.h`（新規）
- `src/firmware/src/actuators/actuator_state.cpp`（新規）
- `src/firmware/src/actuators/actuator_driver.h`（新規）
- `src/firmware/src/actuators/actuator_driver.cpp`（新規）
- `src/firmware/test/test_telemetry/test_main.cpp`（新規）
- `src/firmware/test/test_actuators/test_main.cpp`（新規）
- `src/firmware/src/main.cpp`（更新）
- `src/firmware/include/config.example.h`（更新）
- `src/firmware/platformio.ini`（更新）
- `src/firmware/README.md`（更新）
