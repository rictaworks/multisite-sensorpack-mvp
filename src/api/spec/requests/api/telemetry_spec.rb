require "rails_helper"

# requirements.md 1.6 F2 ingest_telemetry(src/shared/contracts/openapi.yaml POST /telemetry)。
# デバイストークン認証(401/410)・HTTP境界(ステータスコード・レスポンス形状)を検証する。
# 個々の判定ロジック(値域外・重複seq・閾値ヒステリシス等)の網羅は
# spec/services/telemetry_ingest_service_spec.rb・spec/services/threshold_evaluation_service_spec.rb を参照。
RSpec.describe "Api::Telemetry", type: :request do
  let(:user) { User.create!(google_sub: "telemetry-request-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }

  def provision_device
    Device.provision_for_site!(site)
  end

  def post_telemetry(token:, body: {}, headers: {})
    post "/api/v1/telemetry",
         params: body.to_json,
         headers: { "Authorization" => "Bearer #{token}", "Content-Type" => "application/json" }.merge(headers)
  end

  describe "正常系(E: 正常)" do
    it "200でaccepted=true・serverTime・commands(空配列)を返す" do
      _device, token = provision_device

      post_telemetry(token: token, body: { seq: 1, temperatureC: 25.5, humidityPct: 60.0 })

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["accepted"]).to be(true)
      expect(body["duplicate"]).to be(false)
      expect(body["serverTime"]).to be_present
      expect(body["commands"]).to eq([])
    end

    it "端末申告時刻(deviceReportedAt)を付与しても200を返す" do
      _device, token = provision_device

      post_telemetry(token: token, body: { seq: 1, temperatureC: 25, humidityPct: 50, deviceReportedAt: 10.years.from_now.iso8601 })

      expect(response).to have_http_status(:ok)
    end
  end

  describe "無効トークン(E: 無効トークン)" do
    it "存在しないトークンは401 invalid_device_tokenを返す" do
      post_telemetry(token: "nonexistent-token", body: { seq: 1, temperatureC: 25, humidityPct: 50 })

      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body.dig("error", "code")).to eq("invalid_device_token")
    end

    it "Authorizationヘッダーがなければ401を返す" do
      post "/api/v1/telemetry", params: { seq: 1, temperatureC: 25, humidityPct: 50 }.to_json,
                                 headers: { "Content-Type" => "application/json" }

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "削除済みデバイス(E: 削除済みデバイス)" do
    it "論理削除済みデバイスのトークンは410 device_deletedを返す" do
      device, token = provision_device
      device.update!(deleted: true)

      post_telemetry(token: token, body: { seq: 1, temperatureC: 25, humidityPct: 50 })

      expect(response).to have_http_status(:gone)
      expect(response.parsed_body.dig("error", "code")).to eq("device_deleted")
    end
  end

  describe "値域外(E: 値域外)" do
    it "200のままaccepted=falseで値域外を通知する" do
      _device, token = provision_device

      post_telemetry(token: token, body: { seq: 1, temperatureC: 999, humidityPct: 50 })

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["accepted"]).to be(false)
    end
  end

  describe "重複seq(E: 重複seq)" do
    it "同一seqの再送はduplicate=trueを返す" do
      _device, token = provision_device
      post_telemetry(token: token, body: { seq: 1, temperatureC: 25, humidityPct: 50 })

      post_telemetry(token: token, body: { seq: 1, temperatureC: 26, humidityPct: 55 })

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["duplicate"]).to be(true)
    end
  end

  describe "欠損フィールド(E: 欠損フィールド)" do
    it "seqが欠損していれば400 validation_errorを返す" do
      _device, token = provision_device

      post_telemetry(token: token, body: { temperatureC: 25, humidityPct: 50 })

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body.dig("error", "code")).to eq("validation_error")
    end
  end

  describe "巨大ペイロード(E: 巨大ペイロード)" do
    it "MAX_BODY_BYTESを超えるリクエストは400で早期拒否する" do
      _device, token = provision_device
      oversized_note = "x" * (Api::TelemetryController::MAX_BODY_BYTES + 1)

      post_telemetry(token: token, body: { seq: 1, temperatureC: 25, humidityPct: 50, note: oversized_note })

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body.dig("error", "code")).to eq("validation_error")
    end
  end
end
