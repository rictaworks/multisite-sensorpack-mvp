# telemetry-simulator

実機ESP32の代わりに `POST /api/v1/telemetry` へ温湿度テレメトリを送信する開発・E2E用シミュレータです
(requirements.md 1.8「テストデータに関する注記」、Issue #9)。外部npm依存はありません(Node.js 18以降の
標準`fetch`のみを使用)。

## 使い方

1. Railsサーバーを起動する(`src/api`で`bin/rails server`)。
2. デバイスをクレーム登録し、デバイストークンを取得する。

   ```bash
   curl -X POST http://localhost:3000/api/v1/devices/claim \
     -H "Content-Type: application/json" \
     -d '{"code": "<ダッシュボードで発行したクレームコード>"}'
   ```

3. `.env.example` を `.env` にコピーし、`TELEMETRY_DEVICE_TOKEN` に取得したトークンを設定する。
4. シミュレータを起動する。

   ```bash
   cd src/tools/telemetry-simulator
   node simulate.js
   ```

   60秒間隔(既定)で温湿度テレメトリを送信し続けます。`Ctrl+C`で停止できます。

## 環境変数

`.env.example` を参照してください。`TELEMETRY_DEVICE_TOKEN` 以外はすべて任意です。
