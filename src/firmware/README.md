# ESP32 センサーパック ファームウェア（issue #4 ひな形 + issue #23 クレーム登録 + issue #24 テレメトリ/コマンド）

`multisite-sensorpack-mvp` のESP32側ファームウェア。PlatformIOプロジェクトとして構成する。

## スコープ（重要）

### issue #4（ひな形・実装済み）

- Wi-Fi接続（STAモード。認証情報の出所は下記issue #23の変更を参照）
- DHT22（温湿度）読み取りと妥当性チェック（`requirements.md` F2.4 の値域 −40〜85℃ / 0〜100% を参照）
- LED・ファン（リレー/MOSFET駆動）のGPIO制御（issue #24でboot self-testと実コマンド駆動の両方に配線）

### issue #23（デバイス登録・クレームコード方式、実装済み）

`requirements.md` 1.6 F1 `claim_device` 手順3-6に対応。

- 初回起動時（NVSにデバイストークン未保存の場合）、ESP32はAPモードで自身のWi-Fiアクセスポイントを立ち上げ、キャプティブポータル（`src/wifi_provisioning`）を表示する。
- 車輪の再発明を避けるため（`.claude/rules/architecture.md`）、AP立ち上げ・キャプティブポータルのWebサーバー・DNSリダイレクトは実績のあるOSSライブラリ [`tzapu/WiFiManager`](https://github.com/tzapu/WiFiManager) を採用し、自前実装しない。本モジュールが独自に持つのはクレームコード用のカスタム入力欄と、契約（issue #5 `src/shared/contracts/openapi.yaml` `POST /devices/claim`）へのHTTPリクエスト・レスポンス処理・NVS永続化のみ。
- インストーラーがスマホ等からAPに接続し、フォームで拠点Wi-FiのSSID/パスワードと8桁のクレームコードを入力する。
- ESP32はまずSTAとして指定Wi-Fiへの接続を試み、成功したら `POST {API_BASE_URL}/devices/claim` にクレームコードを送信する。
- 照合成立（HTTP 201）でデバイストークンを受信し、Wi-Fi認証情報とともにNVS（`Preferences`, namespace `sensorpack`）へ保存し、端末を再起動する。以後の起動はAPモードを経由せず、NVSから読み込んだ認証情報でSTA接続する。
- 照合失敗（401/429やトランスポートエラー）時はポータルを再表示し、同一コードでの再試行を `PROVISIONING_MAX_CLAIM_ATTEMPTS`（既定5回、`requirements.md` F1.5のサーバー側ロックアウトに追随するクライアント側の目安であり、正のセキュリティ境界はサーバー側）まで許容する。上限に達すると新しいクレームコードの入力を要求する。

### issue #24（テレメトリ送信・コマンド受信・ACK・アクチュエータ駆動、実装済み）

`requirements.md` 1.6 F2 `ingest_telemetry` / F5 `dispatch_command` に対応。`loop()` が `TELEMETRY_INTERVAL_MS`（既定60秒・`config.h`で変更可）ごとに1サイクルを実行する。

- `src/telemetry/telemetry_protocol.h/.cpp`（ハードウェア非依存・ホストでテスト可能）：`POST /telemetry` のリクエストJSON整形（`seq`/`temperatureC`/`humidityPct`/`deviceReportedAt`(常にnull)/`commandAcks`）と、レスポンスJSON（`accepted`/`duplicate`/`serverTime`/`commands`）のパースを、issue #5 `src/shared/contracts/openapi.yaml` の `TelemetryIngestRequest`/`TelemetryIngestResponse` に厳密に一致させて実装。ステータスコード非200・パース失敗時は`parsed_ok=false`とし、コマンド実行やACKドレインを一切行わない（fail closed）。
- `src/telemetry/ack_queue.h/.cpp`（ハードウェア非依存・ホストでテスト可能）：実行済み・未ACKコマンドの冪等IDキュー管理（`enqueue_pending_ack`で重複排除して追加、`remove_acked`でサーバー確認済み分のみ削除）。
- `src/telemetry/telemetry_client.h/.cpp`（ハードウェア依存・Wi-Fi/HTTPClient必須）：Wi-Fi未接続時は送信を試みずスキップ（オフライン時の基本動作）。接続時はトランスポート失敗（タイムアウト・DNS・接続拒否・TLSハンドシェイク失敗）に対して `TELEMETRY_HTTP_MAX_ATTEMPTS`（既定3回）までリトライし、`TELEMETRY_HTTP_RETRY_DELAY_MS`（既定2秒）待機する。サーバーが実際に応答したHTTPエラー（401等）はリトライしない。`Authorization: Bearer <device_token>`（`deviceBearerToken`セキュリティスキーム）を使用し、HTTPS時のルートCA未設定はissue #23と同様fail closed。
- `src/actuators/actuator_state.h/.cpp`（ハードウェア非依存・ホストでテスト可能）：ピギーバックされたコマンド配列（最大5件・issued_at昇順）を、`lib/firmware_logic/command_mapper.h`（issue #4）で1件ずつ解決し、同一アクチュエータへの複数コマンドは配列内で最後のものを採用する。認識できないcommandTypeは実行・ACKいずれも行わない（フォールバック実行の禁止。ACKされないコマンドはサーバー側TTLで`expired`になりUIに「届きませんでした」と表示される・F5.4）。
- `src/actuators/actuator_driver.h/.cpp`（ハードウェア依存・Arduino GPIO必須）：`actuator_state`が解決した状態をLED_PIN/FAN_RELAY_PINへ`digitalWrite`で反映する。バッチが言及しなかったアクチュエータは現状維持（暗黙のリセットをしない）。
- `main.cpp`の`loop()`はDHT22読み取り→値域チェック→`telemetry::send_telemetry`→（成功時のみ）`remove_acked`でACKキューをドレイン→`resolve_commands`→`actuators::apply_desired_state`→新規実行分を`enqueue_pending_ack`、の順で1サイクルを構成する。通信失敗・オフライン時はこのサイクルを丸ごとスキップし、次回`TELEMETRY_INTERVAL_MS`で再試行する（未送信分の温湿度データを蓄積して後送りするストア&フォワードはMVPスコープ外）。

実機への書き込み（フラッシュ）・実機での動作確認は **このリポジトリ／このセッションのスコープ外** です（`.claude/rules/deploy.md`）。書き込み以降はClaude Desktop側で行います。

## ディレクトリ構成

```
src/firmware/
├── platformio.ini              # env:esp32dev（実機ビルド）/ env:native（ホスト側ユニットテスト）
├── include/
│   ├── config.example.h        # 設定テンプレート（コミット対象）
│   └── config.h                # 実際の設定（gitignore対象。config.example.hをコピーして作成）
├── lib/
│   └── firmware_logic/         # ハードウェア非依存の純粋ロジック（ホストでテスト可能）
│       ├── telemetry_format.h/.cpp   # 値域チェック（issue #24でも再利用）・issue #4時点のJSON整形（現在未使用の旧プレースホルダー）
│       └── command_mapper.h/.cpp     # コマンド文字列→アクチュエータ制御へのマッピング（issue #24の実コマンド解決でも再利用）
├── src/
│   ├── main.cpp                          # Arduinoスケッチ本体（クレーム分岐＋テレメトリ/コマンドサイクル）
│   ├── claim/                             # issue #23: ハードウェア非依存・ホストでテスト可能
│   │   ├── claim_code.h/.cpp              #   クレームコード書式検証・リクエスト/レスポンスの組み立て・解析
│   ├── wifi_provisioning/                 # issue #23: ハードウェア依存（Arduino/ESP32/WiFiManager必須）
│   │   └── ap_provisioning.h/.cpp         #   APモード・NVS永続化・クレームHTTP呼び出しのオーケストレーション
│   ├── telemetry/                         # issue #24
│   │   ├── telemetry_protocol.h/.cpp      #   ハードウェア非依存・ホストでテスト可能: リクエストJSON整形・レスポンスJSON解析
│   │   ├── ack_queue.h/.cpp               #   ハードウェア非依存・ホストでテスト可能: 未ACKコマンドの冪等IDキュー管理
│   │   └── telemetry_client.h/.cpp        #   ハードウェア依存（Wi-Fi/HTTPClient必須）: POST /telemetry の送受信・リトライ
│   └── actuators/                         # issue #24
│       ├── actuator_state.h/.cpp          #   ハードウェア非依存・ホストでテスト可能: コマンド配列→最終アクチュエータ状態の解決
│       └── actuator_driver.h/.cpp         #   ハードウェア依存（Arduino GPIO必須）: LED/ファンへの実際のdigitalWrite
└── test/
    ├── test_logic/
    │   └── test_main.cpp        # lib/firmware_logic に対するUnityユニットテスト（ホスト実行）
    ├── test_claim/
    │   └── test_main.cpp        # src/claim に対するUnityユニットテスト（ホスト実行、issue #23）
    ├── test_telemetry/
    │   └── test_main.cpp        # src/telemetry の telemetry_protocol/ack_queue に対するUnityユニットテスト（ホスト実行、issue #24）
    └── test_actuators/
        └── test_main.cpp        # src/actuators の actuator_state に対するUnityユニットテスト（ホスト実行、issue #24）
```

ピン定義・Wi-Fi認証情報（クレームAPモードのAP名/パスワード等の設定値）・APIエンドポイントは `include/config.h` に分離しており、`src/` 配下のソースにハードコードしていない。拠点Wi-Fi認証情報とデバイストークンそのものは、issue #23以降は実行時にNVSへ保存される値であり、`config.h` には静的なプレースホルダーとして置いていない（詳細は `include/config.example.h` のコメントを参照）。

## セットアップ

1. PlatformIO CLIをインストールする（例：`pip install platformio`、またはVSCode拡張機能「PlatformIO IDE」）。
2. 設定ファイルを作成する。

   ```bash
   cp include/config.example.h include/config.h
   ```

   `config.h` を開き、AP名プレフィックス・タイムアウト・ピン番号等、必要に応じて実機に合わせて編集する。`config.h` は `.gitignore` 対象のためコミットされない。

## ビルド確認（実機書き込みは行わない）

以下のコマンドでコンパイルが通ることを確認する。**`pio run` はビルドのみ行い、実機への書き込みは行わない**（`pio run -t upload` は使用しない。書き込みはこのリポジトリのスコープ外）。

```bash
cd src/firmware
python3 -m platformio run -e esp32dev
```

初回実行時、PlatformIOがESP32用ツールチェーン・ライブラリ（DHT sensor library、ArduinoJson、WiFiManager等）をダウンロードするためネットワーク接続が必要。成功すると `SUCCESS` で終了する。

## ユニットテスト（ホスト実行・可能な範囲）

`lib/firmware_logic/`・`src/claim/`・`src/telemetry/`（`telemetry_protocol.cpp`/`ack_queue.cpp`のみ）・`src/actuators/`（`actuator_state.cpp`のみ）は Arduino/ESP32 に依存しない純粋なC++ロジック（値域チェック・JSON整形・コマンドマッピング・クレームコード検証/リクエスト構築/レスポンス解析・テレメトリリクエスト/レスポンス整形・ACKキュー管理・コマンド配列→アクチュエータ状態解決）として分離しており、ホスト上（native環境）でテスト可能。`platformio.ini` の `env:native` は `test_build_src` を有効化した上で `build_src_filter` により `src/claim/`・`src/telemetry/`・`src/actuators/` を取り込みつつ、`src/main.cpp`・`src/wifi_provisioning/`・`src/telemetry/telemetry_client.cpp`・`src/actuators/actuator_driver.cpp`（いずれもArduino/ESP32専用）を明示的に除外している。

```bash
cd src/firmware
python3 -m platformio test -e native
```

このリポジトリでの実行結果（2026-07-29時点）：

```
native         test_telemetry   PASSED    (14 test cases)
native         test_logic       PASSED    (7 test cases)
native         test_actuators   PASSED    (6 test cases)
native         test_claim       PASSED    (10 test cases)
37 test cases: 37 succeeded
```

`env:esp32dev`（実機書き込みなしのビルド確認のみ）も成功する（後述）。

### テストできない範囲（ハードウェア依存・明記）

以下は実機がないと検証できないため、自動テストの対象外である（フォールバックやモックによる「テストが通ったことにする」誤魔化しは行わない）。

- DHT22からの実際のセンサー値取得（配線・タイミング依存の1-wireプロトコル）
- Wi-Fiへの実接続（アクセスポイントとの実通信、APモードでのキャプティブポータル表示・スマホからの実操作）
- LED・ファン（リレー/MOSFET）の実際の物理的な動作確認（`src/actuators/actuator_driver.cpp`）
- `src/wifi_provisioning/ap_provisioning.cpp` のクレームHTTP呼び出し・NVS(`Preferences`)への実書き込み・再起動後の読み出し
- `src/telemetry/telemetry_client.cpp` の実際のHTTP送受信・リトライ挙動・実際のオフライン検知（Wi-Fi切断の実環境での再現）（`env:esp32dev` でのビルド確認までがこのリポジトリのスコープ）

これらは実機書き込み後、Claude Desktop側での確認作業に委ねる。

## セキュリティ上の注意

- APモードのセットアップパスワード（`PROVISIONING_AP_PASSWORD`）は拠点Wi-Fiの秘密情報ではなくESP32自身の初期セットアップ用パスワードであり、実運用ではロット・機種ごとに変更を検討する。拠点Wi-Fi認証情報・APIエンドポイント・デバイストークンは `include/config.h`（gitignore対象）またはクレーム成立後にNVSへ書き込まれる値からのみ取得し、ソースコードへの直書きは禁止。
- クレームAPI呼び出し（issue #23）・テレメトリAPI呼び出し（issue #24）はともにHTTPS時にルートCA証明書（`CLAIM_API_ROOT_CA_PEM`。同一バックエンドの単一証明書のため両者で共有）が未設定の場合、フォールバックで検証をスキップせず送信自体を失敗させる（fail closed、OWASP A02対策）。本番バックエンドのドメイン・証明書確定後に設定する。
- テレメトリ送信はデバイストークンを `Authorization: Bearer <token>` ヘッダー（`deviceBearerToken`セキュリティスキーム、issue #5 OpenAPI仕様）でのみ送信し、リクエストボディやクエリ文字列には含めない。トークン自体はNVSに保存された値のみを使用し、ソースコードへの直書きは禁止（issue #23と同じ方針）。
- サーバーが認識しないcommandType（本来発生しない想定だが、フォールバックで実行しない・ACKしない：`src/actuators/actuator_state.cpp`）や、パースできない/非200のテレメトリレスポンス（`src/telemetry/telemetry_protocol.cpp`）は、いずれもfail closed（何もしない）で処理し、不正・破損データに基づくアクチュエータ誤動作を防ぐ。
- `include/config.h` を誤ってコミットしていないか、PR作成前に必ず `git status` で確認する。
