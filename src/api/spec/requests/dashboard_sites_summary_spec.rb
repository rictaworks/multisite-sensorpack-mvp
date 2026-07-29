require "rails_helper"

# requirements.md 1.6 F6 render_dashboard 手順1-2 / 1.9 Iカテゴリ(拠点集計・openアラート数)
# / Gカテゴリ(テナント分離)を検証する。
RSpec.describe "GET /api/v1/dashboard/sites-summary", type: :request do
  let!(:owner) { User.create!(google_sub: "dashboard-owner-#{SecureRandom.hex(4)}") }
  let!(:other_user) { User.create!(google_sub: "dashboard-other-#{SecureRandom.hex(4)}") }

  def login_as(user)
    allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return(user.google_sub)
    post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }
  end

  def create_device(site:, status: "online")
    device = Device.create!(site: site, device_token_digest: SecureRandom.hex(20))
    device.update_column(:status_code, status)
    device
  end

  def record_reading(device:, seq:, temperature_c:, humidity_pct:, recorded_at:)
    TelemetryReading.create!(
      device: device, seq: seq, temperature_c: temperature_c, humidity_pct: humidity_pct, recorded_at: recorded_at
    )
  end

  context "未認証の場合" do
    it "401を返す" do
      get "/api/v1/dashboard/sites-summary"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  context "認証済みユーザーの場合" do
    let!(:site_a) { Site.create!(user: owner, name: "倉庫A") }
    let!(:site_b) { Site.create!(user: owner, name: "実家") }
    let!(:other_site) { Site.create!(user: other_user, name: "他人の拠点") }

    it "自分の拠点のみを、拠点ごとのデバイス数・オンライン数・openアラート数・最新温湿度つきで返す" do
      device1 = create_device(site: site_a, status: "online")
      create_device(site: site_a, status: "offline")
      record_reading(device: device1, seq: 1, temperature_c: 20.0, humidity_pct: 50.0, recorded_at: 2.hours.ago)
      record_reading(device: device1, seq: 2, temperature_c: 23.5, humidity_pct: 55.0, recorded_at: 10.minutes.ago)
      device1.alerts.create!(alert_type_code: "offline", severity_code: "warning", status: "open", opened_at: Time.current)
      device1.alerts.create!(alert_type_code: "threshold_upper_breach", severity_code: "warning", status: "closed", opened_at: 1.day.ago, closed_at: 1.day.ago)

      # 他ユーザーの拠点にもデータを積んでおき、混入しないことを確認する
      other_device = create_device(site: other_site, status: "online")
      record_reading(device: other_device, seq: 1, temperature_c: 33.0, humidity_pct: 99.0, recorded_at: Time.current)

      login_as(owner)

      get "/api/v1/dashboard/sites-summary"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      site_ids = body["sites"].map { |s| s["id"] }
      expect(site_ids).to contain_exactly(site_a.id, site_b.id)

      summary_a = body["sites"].find { |s| s["id"] == site_a.id }
      expect(summary_a["name"]).to eq("倉庫A")
      expect(summary_a["deviceCount"]).to eq(2)
      expect(summary_a["onlineDeviceCount"]).to eq(1)
      expect(summary_a["openAlertCount"]).to eq(1)
      expect(summary_a["latestTemperatureC"]).to eq(23.5)
      expect(summary_a["latestHumidityPct"]).to eq(55.0)

      summary_b = body["sites"].find { |s| s["id"] == site_b.id }
      expect(summary_b["deviceCount"]).to eq(0)
      expect(summary_b["onlineDeviceCount"]).to eq(0)
      expect(summary_b["openAlertCount"]).to eq(0)
      expect(summary_b["latestTemperatureC"]).to be_nil
      expect(summary_b["latestHumidityPct"]).to be_nil
    end

    it "他ユーザーの拠点は一覧に構造的に現れない(テナント分離)" do
      login_as(other_user)

      get "/api/v1/dashboard/sites-summary"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      site_ids = body["sites"].map { |s| s["id"] }
      expect(site_ids).to contain_exactly(other_site.id)
      expect(site_ids).not_to include(site_a.id, site_b.id)
    end
  end
end
