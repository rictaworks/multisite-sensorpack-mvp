# ESP32 センサーパック ファームウェア（ひな形 / issue #4）

`multisite-sensorpack-mvp` のESP32側ファームウェア。PlatformIOプロジェクトとして構成する。

## スコープ（重要）

このディレクトリ（issue #4）で実装済みなのは **ひな形のみ**:

- Wi-Fi接続（`config.h` の認証情報を使用。空の場合はフォールバックせず起動を停止しエラーをログ出力する）
- DHT22（温湿度）読み取りと妥当性チェック（`requirements.md` F2.4 の値域 −40〜85℃ / 0〜100% を参照）
- LED・ファン（リレー/MOSFET駆動）のGPIO制御スタブ（起動時の一度きりの自己診断のみ）

**未実装（別issueで対応予定）:**

- デバイス登録・クレームコード入力（APモード、issue #23）
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
│   └── main.cpp                 # Arduinoスケッチ本体（Wi-Fi/DHT22/LEDピン等、ハードウェア依存）
└── test/
    └── test_logic/
        └── test_main.cpp        # lib/firmware_logic に対するUnityユニットテスト（ホスト実行）
```

ピン定義・Wi-Fi認証情報・APIエンドポイントは `include/config.h` に分離しており、`src/main.cpp` にハードコードしていない。

## セットアップ

1. PlatformIO CLIをインストールする（例：`pip install platformio`、またはVSCode拡張機能「PlatformIO IDE」）。
2. 設定ファイルを作成する。

   ```bash
   cp include/config.example.h include/config.h
   ```

   `config.h` を開き、Wi-Fi SSID/パスワード・ピン番号（必要に応じて）を実機に合わせて編集する。`config.h` は `.gitignore` 対象のためコミットされない。

## ビルド確認（実機書き込みは行わない）

以下のコマンドでコンパイルが通ることを確認する。**`pio run` はビルドのみ行い、実機への書き込みは行わない**（`pio run -t upload` は使用しない。書き込みはこのリポジトリのスコープ外）。

```bash
cd src/firmware
python3 -m platformio run -e esp32dev
```

初回実行時、PlatformIOがESP32用ツールチェーン・ライブラリ（DHT sensor library等）をダウンロードするためネットワーク接続が必要。成功すると `SUCCESS` で終了する。

## ユニットテスト（ホスト実行・可能な範囲）

`lib/firmware_logic/` は Arduino/ESP32 に依存しない純粋なC++ロジック（値域チェック・JSON整形・コマンドマッピング）として分離しており、ホスト上（native環境）でテスト可能。

```bash
cd src/firmware
python3 -m platformio test -e native
```

このリポジトリでの実行結果（2026-07-28時点）：

```
7 test cases: 7 succeeded
```

### テストできない範囲（ハードウェア依存・明記）

以下は実機がないと検証できないため、自動テストの対象外である（フォールバックやモックによる「テストが通ったことにする」誤魔化しは行わない）。

- DHT22からの実際のセンサー値取得（配線・タイミング依存の1-wireプロトコル）
- Wi-Fiへの実接続（アクセスポイントとの実通信）
- LED・ファン（リレー/MOSFET）の実際の物理的な動作確認

これらは実機書き込み後、Claude Desktop側での確認作業に委ねる。

## セキュリティ上の注意

- Wi-Fi認証情報・APIエンドポイント・デバイストークンは `include/config.h`（gitignore対象）からのみ読み込む。ソースコードへの直書きは禁止。
- `include/config.h` を誤ってコミットしていないか、PR作成前に必ず `git status` で確認する。
