require "rails_helper"

# requirements.md 1.6 F6 render_dashboard 手順3(デバイス詳細) / 1.9 Iカテゴリ(時系列粒度切替・
# 生データ削除後の集約参照) / Gカテゴリ(テナント分離)を検証する。
RSpec.describe "Devices dashboard reference endpoints", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let!(:owner) { User.create!(google_sub: "devices-owner-#{SecureRandom.hex(4)}") }
  let!(:other_user) { User.create!(google_sub: "devices-other-#{SecureRandom.hex(4)}") }
  let!(:site) { Site.create!(user: owner, name: "倉庫A") }
  let!(:other_site) { Site.create!(user: other_user, name: "他人の拠点") }

  def login_as(user)
    allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return(user.google_sub)
    post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }
  end

  after { travel_back }

  describe "GET /api/v1/devices" do
    let!(:device) { Device.create!(site: site, device_token_digest: SecureRandom.hex(20)) }
    let!(:other_device) { Device.create!(site: other_site, device_token_digest: SecureRandom.hex(20)) }

    it "未認証の場合401を返す" do
      get "/api/v1/devices"

      expect(response).to have_http_status(:unauthorized)
    end

    it "自分の拠点配下のデバイスのみを返す(他ユーザーのデバイスは構造的に現れない)" do
      login_as(owner)

      get "/api/v1/devices"

      expect(response).to have_http_status(:ok)
      ids = JSON.parse(response.body)["devices"].map { |d| d["id"] }
      expect(ids).to contain_exactly(device.id)
      expect(ids).not_to include(other_device.id)
    end

    it "他ユーザーの拠点IDをsiteIdに指定しても空配列を返す(越境参照不可)" do
      login_as(owner)

      get "/api/v1/devices", params: { siteId: other_site.id }

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["devices"]).to eq([])
    end
  end

  describe "GET /api/v1/devices/:deviceId" do
    let!(:device) { Device.create!(site: site, device_token_digest: SecureRandom.hex(20)) }
    let!(:other_device) { Device.create!(site: other_site, device_token_digest: SecureRandom.hex(20)) }

    before do
      device.thresholds.create!(sensor_type_code: "temperature", direction: "upper", trigger_value: 28, deadband: 1.0)
    end

    it "所有者本人はデバイス詳細(閾値つき)を取得できる" do
      login_as(owner)

      get "/api/v1/devices/#{device.id}"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["id"]).to eq(device.id)
      expect(body["thresholds"].size).to eq(1)
      expect(body["thresholds"].first["sensorType"]).to eq("temperature")
      expect(body["automationRule"]).to be_nil
    end

    it "他ユーザーのデバイスへは403(Forbidden)を返す" do
      login_as(other_user)

      get "/api/v1/devices/#{device.id}"

      expect(response).to have_http_status(:forbidden)
    end

    it "存在しないデバイスIDは404を返す" do
      login_as(owner)

      get "/api/v1/devices/999999999"

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "GET /api/v1/devices/:deviceId/telemetry-series" do
    let!(:device) { Device.create!(site: site, device_token_digest: SecureRandom.hex(20)) }

    it "range=24hは生データをisAggregated=falseで新しい順ではなく時系列昇順に返す" do
      now = Time.zone.local(2026, 7, 28, 12, 0, 0)
      travel_to(now) do
        TelemetryReading.create!(device: device, seq: 1, temperature_c: 20.0, humidity_pct: 40.0, recorded_at: now - 2.hours)
        TelemetryReading.create!(device: device, seq: 2, temperature_c: 21.0, humidity_pct: 41.0, recorded_at: now - 1.hour)
        # 24h範囲外の古いデータは含まれない
        TelemetryReading.create!(device: device, seq: 3, temperature_c: 33.0, humidity_pct: 33.0, recorded_at: now - 25.hours)

        login_as(owner)
        get "/api/v1/devices/#{device.id}/telemetry-series", params: { range: "24h", sensorType: "temperature" }

        expect(response).to have_http_status(:ok)
        body = JSON.parse(response.body)
        expect(body["points"].size).to eq(2)
        expect(body["points"].map { |p| p["temperatureC"] }).to eq([ 20.0, 21.0 ])
        expect(body["points"].all? { |p| p["isAggregated"] == false }).to be true
        expect(body["points"].all? { |p| p["humidityPct"].nil? }).to be true
      end
    end

    it "range=7dは1時間粒度の集約データをisAggregated=trueで返す" do
      now = Time.zone.local(2026, 7, 28, 12, 0, 0)
      travel_to(now) do
        HourlyAggregate.create!(
          device: device, sensor_type_code: "humidity", hour_bucket: (now - 3.hours).beginning_of_hour,
          min_value: 40.0, max_value: 60.0, avg_value: 50.0
        )

        login_as(owner)
        get "/api/v1/devices/#{device.id}/telemetry-series", params: { range: "7d", sensorType: "humidity" }

        expect(response).to have_http_status(:ok)
        body = JSON.parse(response.body)
        expect(body["points"].size).to eq(1)
        expect(body["points"].first["humidityPct"]).to eq(50.0)
        expect(body["points"].first["isAggregated"]).to be true
      end
    end

    it "生データが削除された後でも7d範囲は集約データから参照できる(1.9 Iカテゴリ)" do
      now = Time.zone.local(2026, 7, 28, 12, 0, 0)
      travel_to(now) do
        HourlyAggregate.create!(
          device: device, sensor_type_code: "temperature", hour_bucket: (now - 3.days).beginning_of_hour,
          min_value: 18.0, max_value: 22.0, avg_value: 20.0
        )
        # 生データは既に14日超で削除済み(生データなし)という状況を模擬
        expect(device.telemetry_readings.count).to eq(0)

        login_as(owner)
        get "/api/v1/devices/#{device.id}/telemetry-series", params: { range: "7d", sensorType: "temperature" }

        expect(response).to have_http_status(:ok)
        body = JSON.parse(response.body)
        expect(body["points"].first["temperatureC"]).to eq(20.0)
      end
    end

    it "不正なrangeパラメータは400を返す" do
      login_as(owner)

      get "/api/v1/devices/#{device.id}/telemetry-series", params: { range: "30d", sensorType: "temperature" }

      expect(response).to have_http_status(:bad_request)
    end

    it "他ユーザーのデバイスの時系列へは403を返す" do
      other_device = Device.create!(site: other_site, device_token_digest: SecureRandom.hex(20))
      login_as(owner)

      get "/api/v1/devices/#{other_device.id}/telemetry-series", params: { range: "24h", sensorType: "temperature" }

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /api/v1/devices/:deviceId/commands" do
    let!(:device) { Device.create!(site: site, device_token_digest: SecureRandom.hex(20)) }

    it "コマンド履歴を発行日時の新しい順で返す" do
      old_command = device.commands.create!(
        command_type_code: "FAN_ON", idempotency_key: SecureRandom.uuid, origin: "manual",
        issued_at: 1.hour.ago, expires_at: 50.minutes.ago
      )
      new_command = device.commands.create!(
        command_type_code: "LED_ON", idempotency_key: SecureRandom.uuid, origin: "auto",
        issued_at: 5.minutes.ago, expires_at: 5.minutes.from_now
      )

      login_as(owner)
      get "/api/v1/devices/#{device.id}/commands"

      expect(response).to have_http_status(:ok)
      ids = JSON.parse(response.body)["commands"].map { |c| c["id"] }
      expect(ids).to eq([ new_command.id, old_command.id ])
    end

    it "他ユーザーのデバイスのコマンド履歴へは403を返す" do
      other_device = Device.create!(site: other_site, device_token_digest: SecureRandom.hex(20))
      login_as(owner)

      get "/api/v1/devices/#{other_device.id}/commands"

      expect(response).to have_http_status(:forbidden)
    end
  end
end
