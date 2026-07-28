# ESP32 センサーパック ファームウェア（issue #4 ひな形 + issue #23 クレーム登録）

`multisite-sensorpack-mvp` のESP32側ファームウェア。PlatformIOプロジェクトとして構成する。

## スコープ（重要）

### issue #4（ひな形・実装済み）

- Wi-Fi接続（STAモード。認証情報の出所は下記issue #23の変更を参照）
- DHT22（温湿度）読み取りと妥当性チェック（`requirements.md` F2.4 の値域 −40〜85℃ / 0〜100% を参照）
- LED・ファン（リレー/MOSFET駆動）のGPIO制御スタブ（起動時の一度きりの自己診断のみ）

### issue #23（デバイス登録・クレームコード方式、実装済み）

`requirements.md` 1.6 F1 `claim_device` 手順3-6に対応。

- 初回起動時（NVSにデバイストークン未保存の場合）、ESP32はAPモードで自身のWi-Fiアクセスポイントを立ち上げ、キャプティブポータル（`src/wifi_provisioning`）を表示する。
- 車輪の再発明を避けるため（`.claude/rules/architecture.md`）、AP立ち上げ・キャプティブポータルのWebサーバー・DNSリダイレクトは実績のあるOSSライブラリ [`tzapu/WiFiManager`](https://github.com/tzapu/WiFiManager) を採用し、自前実装しない。本モジュールが独自に持つのはクレームコード用のカスタム入力欄と、契約（issue #5 `src/shared/contracts/openapi.yaml` `POST /devices/claim`）へのHTTPリクエスト・レスポンス処理・NVS永続化のみ。
- インストーラーがスマホ等からAPに接続し、フォームで拠点Wi-FiのSSID/パスワードと8桁のクレームコードを入力する。
- ESP32はまずSTAとして指定Wi-Fiへの接続を試み、成功したら `POST {API_BASE_URL}/devices/claim` にクレームコードを送信する。
- 照合成立（HTTP 201）でデバイストークンを受信し、Wi-Fi認証情報とともにNVS（`Preferences`, namespace `sensorpack`）へ保存し、端末を再起動する。以後の起動はAPモードを経由せず、NVSから読み込んだ認証情報でSTA接続する。
- 照合失敗（401/429やトランスポートエラー）時はポータルを再表示し、同一コードでの再試行を `PROVISIONING_MAX_CLAIM_ATTEMPTS`（既定5回、`requirements.md` F1.5のサーバー側ロックアウトに追随するクライアント側の目安であり、正のセキュリティ境界はサーバー側）まで許容する。上限に達すると新しいクレームコードの入力を要求する。

**未実装（別issueで対応予定）:**

- テレメトリのHTTP送信・コマンド受信・ACK（issue #24。API契約の詳細はissue #5のOpenAPI仕様に従う）

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
│       ├── telemetry_format.h/.cpp   # 値域チェック・テレメトリJSON整形
│       └── command_mapper.h/.cpp     # コマンド文字列→アクチュエータ制御へのマッピング
├── src/
│   ├── main.cpp                          # Arduinoスケッチ本体（起動時にクレーム有無を判定して分岐）
│   ├── claim/                             # issue #23: ハードウェア非依存・ホストでテスト可能
│   │   ├── claim_code.h/.cpp              #   クレームコード書式検証・リクエスト/レスポンスの組み立て・解析
│   ├── wifi_provisioning/                 # issue #23: ハードウェア依存（Arduino/ESP32/WiFiManager必須）
│   │   └── ap_provisioning.h/.cpp         #   APモード・NVS永続化・クレームHTTP呼び出しのオーケストレーション
└── test/
    ├── test_logic/
    │   └── test_main.cpp        # lib/firmware_logic に対するUnityユニットテスト（ホスト実行）
    └── test_claim/
        └── test_main.cpp        # src/claim に対するUnityユニットテスト（ホスト実行、issue #23）
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

`lib/firmware_logic/` と `src/claim/` は Arduino/ESP32 に依存しない純粋なC++ロジック（値域チェック・JSON整形・コマンドマッピング・クレームコード検証/リクエスト構築/レスポンス解析）として分離しており、ホスト上（native環境）でテスト可能。`platformio.ini` の `env:native` は `test_build_src` を有効化した上で `build_src_filter` により `src/claim/` のみを取り込み、`src/main.cpp` と `src/wifi_provisioning/`（Arduino専用）は明示的に除外している。

```bash
cd src/firmware
python3 -m platformio test -e native
```

このリポジトリでの実行結果（2026-07-28時点）：

```
native         test_logic  PASSED    (7 test cases)
native         test_claim  PASSED    (10 test cases)
17 test cases: 17 succeeded
```

### テストできない範囲（ハードウェア依存・明記）

以下は実機がないと検証できないため、自動テストの対象外である（フォールバックやモックによる「テストが通ったことにする」誤魔化しは行わない）。

- DHT22からの実際のセンサー値取得（配線・タイミング依存の1-wireプロトコル）
- Wi-Fiへの実接続（アクセスポイントとの実通信、APモードでのキャプティブポータル表示・スマホからの実操作）
- LED・ファン（リレー/MOSFET）の実際の物理的な動作確認
- `src/wifi_provisioning/ap_provisioning.cpp` のクレームHTTP呼び出し・NVS(`Preferences`)への実書き込み・再起動後の読み出し（`env:esp32dev` でのビルド確認までがこのリポジトリのスコープ）

これらは実機書き込み後、Claude Desktop側での確認作業に委ねる。

## セキュリティ上の注意

- APモードのセットアップパスワード（`PROVISIONING_AP_PASSWORD`）は拠点Wi-Fiの秘密情報ではなくESP32自身の初期セットアップ用パスワードであり、実運用ではロット・機種ごとに変更を検討する。拠点Wi-Fi認証情報・APIエンドポイント・デバイストークンは `include/config.h`（gitignore対象）またはクレーム成立後にNVSへ書き込まれる値からのみ取得し、ソースコードへの直書きは禁止。
- クレームAPI呼び出しはHTTPS時にルートCA証明書（`CLAIM_API_ROOT_CA_PEM`）が未設定の場合、フォールバックで検証をスキップせず送信自体を失敗させる（fail closed、OWASP A02対策）。本番バックエンドのドメイン・証明書確定後に設定する。
- `include/config.h` を誤ってコミットしていないか、PR作成前に必ず `git status` で確認する。
