# 作業報告：issue #4 ESP32ファームウェアひな形構築

- 日付：2026-07-28（JST）
- 対象issue：[#4](../../issues/4) [基盤][firmware] ESP32ファームウェアひな形構築
- ブランチ：`feature/issue-4-esp32-firmware-scaffold`
- Edit scope：`src/firmware/**`（new）

## 実装内容

`src/firmware/` にPlatformIOプロジェクトのひな形を作成した。

```
src/firmware/
├── platformio.ini              # env:esp32dev（実機ビルド）/ env:native（ホスト側ユニットテスト）
├── .gitignore                  # include/config.h・.pio/ を除外
├── include/
│   ├── config.example.h        # Wi-Fi・APIエンドポイント・ピン番号のテンプレート（コミット対象）
│   └── config.h                # 実設定（gitignore対象。ローカルでのみ生成）
├── lib/firmware_logic/         # ハードウェア非依存の純粋ロジック
│   ├── telemetry_format.h/.cpp # 値域チェック（requirements.md F2.4準拠）・テレメトリJSON整形
│   └── command_mapper.h/.cpp   # コマンド文字列(LED_ON等)→アクチュエータ制御のマッピング
├── src/main.cpp                 # Wi-Fi接続・DHT22読み取り・LED/ファン制御スタブ（Arduino本体）
├── test/test_logic/test_main.cpp # lib/firmware_logic のUnityユニットテスト
└── README.md                    # セットアップ・ビルド確認・テスト範囲の説明
```

### 受け入れ条件との対応

- [x] PlatformIOプロジェクト構成が `src/firmware/` に作成されている
- [x] DHT22・LED・ファン(リレー/MOSFET)のピン定義を `include/config.example.h`（テンプレート、コミット対象）／`include/config.h`（実設定、gitignore対象）に分離し、`src/main.cpp` にハードコードしていない
- [x] ビルドが通ることを確認する手順を `src/firmware/README.md` に記載（実機書き込みはスコープ外と明記）

### スコープ外として明記した項目

- デバイスクレーム登録（APモード・issue #23）
- テレメトリのHTTP送信・コマンド受信・ACK（issue #24。API契約はissue #5）
- 実機への書き込み・実機動作確認（`.claude/rules/deploy.md` によりClaude Desktop側の担当）

## テスト

### ホスト側ユニットテスト（native環境）

`lib/firmware_logic/`（値域チェック・JSON整形・コマンドマッピング）はArduino/ESP32に依存しない純粋なC++として分離し、PlatformIOのnative環境でUnityによるテストを実行した。

```
cd src/firmware
python3 -m platformio test -e native
```

結果：**7 test cases: 7 succeeded**（このセッション内で実行・確認済み）

### 実機ビルド確認（env:esp32dev）

```
cd src/firmware
python3 -m platformio run -e esp32dev
```

ESP32用ツールチェーン・ライブラリ（DHT sensor library / Adafruit Unified Sensor）をダウンロードした上でコンパイルが通ることを確認した（実機への書き込み `pio run -t upload` は実行していない。実行もスコープ外）。

### テスト不能な範囲（明記）

以下は実機がないと検証できないため、フォールバックやモックによる誤魔化しをせず、README.mdに「ハードウェア依存でありこのリポジトリでは検証不能」と明記した。

- DHT22の実センサー値取得
- Wi-Fiへの実接続
- LED・ファン(リレー/MOSFET)の実際の物理動作

## セキュリティレビュー

- `.claude/QC10.md` / `.claude/OWASP10.md` / `.claude/CC.md` を確認した。
  - QC09（ライブラリの鮮度）：DHT sensor library / Adafruit Unified Sensor を比較的新しいバージョン指定（`^1.4.6` / `^1.1.14`）で導入。
  - QC10（エラーハンドリング）：Wi-Fi接続タイムアウト・DHT22読み取り失敗（NaN）・値域逸脱・未知コマンドをそれぞれログ出力の上で安全側に倒す実装とし、フォールバック値の送信や不明コマンドへの暗黙実行は行わない。
  - OWASP A05（セキュリティ設定ミス）・A07（認証欠陥）：Wi-Fi認証情報・デバイストークン・APIエンドポイントは `include/config.h`（gitignore対象）からのみ読み込み、ソースに直書きしていない。`WIFI_SSID` が空の場合はフォールバックせず起動を停止する（fail closed）。
- `git status` でシークレットファイルが含まれていないことを確認した（`include/config.h` は untracked/ignored のまま。テスト用にローカル生成した `config.h` の中身はダミー値 `test-network` / `test-password` のみで、コミット対象にはならない）。

## 残課題（後続issueへの申し送り）

- issue #23（クレーム登録・APモード）：`src/firmware/src/claim/**`, `wifi_provisioning/**` の実装
- issue #24（テレメトリ送信・コマンド受信・ACK・アクチュエータ駆動）：`src/firmware/src/telemetry/**`, `actuators/**` の実装。`lib/firmware_logic/telemetry_format.*` のJSONフィールド名はissue #5のOpenAPI契約と突き合わせて確定させる必要がある（現状はrequirements.md F2.1に基づく仮実装である旨をコード・READMEに明記済み）。
- 実機での書き込み・動作確認：Claude Desktop側で実施。
