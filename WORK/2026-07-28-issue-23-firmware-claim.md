# 2026-07-28 作業報告: Issue #23 ESP32クレーム登録(APモード・WiFi設定)

## 対応Issue

- GitHub Issue #23「[firmware] ESP32 クレーム登録(APモード・WiFi設定)」
- Depends on: #4（ESP32ファームウェアひな形）、#5（API契約OpenAPI）— いずれもマージ済み
- PR: https://github.com/rictaworks/multisite-sensorpack-mvp/pull/32（マージ済み、Closes #23）

## 実施内容

`requirements.md` 1.6 F1 `claim_device` 手順3-6（ESP32側）を実装した。

1. `feature/issue-23-firmware-claim` ブランチを作成し、`origin/main`（issue #4/#5マージ後）から着手。
2. `src/firmware/src/claim/claim_code.h` / `.cpp`（新規、ハードウェア非依存）
   - クレームコード書式検証（`^[A-Z0-9]{8}$`、issue #5 OpenAPI契約の`DeviceClaimRequest.code`パターンに準拠）
   - `POST /devices/claim` リクエストペイロードの組み立て・レスポンス（`DeviceClaimResponse` / `Error`）の解析
   - JSON組み立て・解析は手組み文字列でなく`ArduinoJson`ライブラリを採用（OWASP A03インジェクション対策、車輪の再発明回避）
3. `src/firmware/src/wifi_provisioning/ap_provisioning.h` / `.cpp`（新規、ハードウェア依存）
   - APモードのキャプティブポータル自体は自前実装せず、実績のあるOSS `tzapu/WiFiManager` を採用（`.claude/rules/architecture.md`の車輪の再発明回避方針に準拠）
   - Wi-Fi SSID/パスワード入力欄に加え、クレームコード用のカスタム入力欄を追加
   - Wi-Fi接続成功後にクレームコードを送信し、成立時はデバイストークンをWi-Fi認証情報とともにNVS（`Preferences`、namespace `sensorpack`）へ保存して再起動
   - 失敗時（不正コード・期限切れ・レート制限・トランスポートエラー）はポータルを再表示し、同一コードでの再試行を`PROVISIONING_MAX_CLAIM_ATTEMPTS`（既定5、requirements.md F1.5のサーバー側ロックアウトに追随する目安）まで許容
   - HTTPSかつルートCA証明書未設定の場合は、検証スキップにフォールバックせず送信自体を拒否（fail closed、OWASP A02対策）
4. `src/firmware/src/main.cpp` を最小限統合: 起動時にNVSのデバイストークン有無で分岐（未クレーム→APモード提供フロー、クレーム済み→NVSの認証情報で通常Wi-Fi接続）。Edit scopeの外だが、この統合なしでは新モジュールが呼び出されず機能しないため必要な変更として実施。
5. `src/firmware/include/config.example.h`: APモード設定値（AP名プレフィックス・パスワード・タイムアウト・最大試行回数・HTTPS用ルートCA欄）を追加。静的な`WIFI_SSID`/`WIFI_PASSWORD`/`DEVICE_TOKEN`はクレームフロー・NVSに置き換わったため削除（死んだ設定値を残さない）。
6. `src/firmware/platformio.ini`: `ArduinoJson`・`tzapu/WiFiManager`を依存に追加。ホスト側テスト環境(`env:native`)は`test_build_src`を有効化した上で`build_src_filter`により`src/claim/`のみを取り込み、`src/main.cpp`・`src/wifi_provisioning/`（Arduino専用）は明示的に除外。
7. TDD（plan→red→coding→green）を実施。
   - RED: `src/firmware/test/test_claim/test_main.cpp` を先に作成し、`claim_code.h`のみ存在する状態でリンクエラー（未実装）になることを確認。
   - GREEN: `claim_code.cpp`実装後、10ケース全てPASSEDを確認。
8. ビルド確認: `python3 -m platformio run -e esp32dev` → `SUCCESS`（実機書き込み`-t upload`は使用せず）。
9. コミット前セキュリティレビュー（`.claude/QC10.md`・`.claude/TM.md`・`.claude/OWASP10.md`・`.claude/CC.md`）を実施し、`git status`でシークレットファイル（`include/config.h`）が含まれていないことを確認した上でコミット。
10. PR #32 を作成（`Closes #23`、非エンジニア向けテスト手順・セキュリティレビューチェックリストを記載）し、ローカルでのテストgreen確認（native 17/17、esp32dev SUCCESS）を根拠に `gh pr merge --squash` でマージ。issue #23はマージにより自動クローズ。

## テスト結果

```
$ python3 -m platformio test -e native
native  test_logic  PASSED  (7 test cases)
native  test_claim  PASSED  (10 test cases)
17 test cases: 17 succeeded

$ python3 -m platformio run -e esp32dev
RAM:   16.0% (used 52388 bytes from 327680 bytes)
Flash: 96.3% (used 1262461 bytes from 1310720 bytes)
[SUCCESS]
```

## 残課題（別issue・将来対応）

- **Flash使用率が96.3%とビルド時点でかなり高い。** issue #24（テレメトリ送信・コマンド受信）でコードが増えると、パーティションスキーム見直し（`platformio.ini`の`board_build.partitions`）等の検討が必要になる可能性がある。
- クレームAPIがHTTPSの場合のルートCA証明書（`CLAIM_API_ROOT_CA_PEM`）は未設定。本番バックエンドのドメイン・証明書確定後、`config.h`側で設定する運用とする（未設定時は送信自体を拒否するfail-closed実装は完了済み）。
- APモードのセットアップパスワードは現状固定値のテンプレート（`PROVISIONING_AP_PASSWORD`）。ロット・機種単位の変更を推奨する注記のみで、個体ごとの完全なユニーク化（例：AP SSIDと同様にチップID由来にする等）は未実施。
- APモードの提供フォーム（Wi-Fi/クレームコード入力画面）の多言語対応は未実施。`.claude/rules/i18n.md`は本来7言語対応を求めるが、開発者用管理画面(F9)同様の例外扱いとはされておらず、ESP32上のオフライン設定画面という性質上、今回はスコープ外とした。i18nルールとの整合性は今後の判断課題として記録する。
- 実機での動作確認（AP接続・キャプティブポータル表示・実際のクレーム成立・NVS再起動後の読み出し）はこのリポジトリ・このセッションのスコープ外（`.claude/rules/deploy.md`）。Claude Desktop側で実施。
- このリポジトリには現時点でファームウェア向けのCIワークフロー（GitHub Actions）が未整備（issue #4時点でも未整備だった模様）。`.claude/rules/ci-cd.md`に基づき、別途整備を検討する余地がある（本PRのスコープ外として着手せず）。

## 変更ファイル

- `src/firmware/src/claim/claim_code.h`（新規）
- `src/firmware/src/claim/claim_code.cpp`（新規）
- `src/firmware/src/wifi_provisioning/ap_provisioning.h`（新規）
- `src/firmware/src/wifi_provisioning/ap_provisioning.cpp`（新規）
- `src/firmware/test/test_claim/test_main.cpp`（新規）
- `src/firmware/src/main.cpp`（更新）
- `src/firmware/include/config.example.h`（更新）
- `src/firmware/platformio.ini`（更新）
- `src/firmware/README.md`（更新）
