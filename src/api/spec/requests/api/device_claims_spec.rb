require "rails_helper"

# ESP32からのクレーム照合(POST /devices/claim)のHTTP境界(ステータスコード・レスポンス形状)を検証する。
# 個々の判定ロジック(期限切れ・使用済み・5回失効・同時クレーム等)の網羅は
# spec/services/claim_device_service_spec.rb を参照(requirements.md 1.9 Dカテゴリ)。
RSpec.describe "Api::DeviceClaimsController", type: :request do
  let(:user) { User.create!(google_sub: "device-claims-request-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }

  after { ClaimDeviceService::RateLimiter.reset_all! }

  def claim(code:, ip: "203.0.113.50")
    post "/api/v1/devices/claim", params: { code: code }, headers: { "REMOTE_ADDR" => ip }, as: :json
  end

  describe "正常系(D: 正常)" do
    it "201でdeviceIdとdeviceTokenを返し、コードを使用済みにする" do
      claim_code = ClaimCode.issue!(user: user, site: site)

      claim(code: claim_code.code)

      expect(response).to have_http_status(:created)
      body = response.parsed_body
      expect(body["deviceId"]).to be_present
      expect(body["deviceToken"]).to be_present
      expect(claim_code.reload.used_at).to be_present
      expect(Device.find(body["deviceId"]).device_status.code).to eq("provisioning")
    end
  end

  describe "存在しない・不正なコード" do
    it "401 claim_code_not_foundを返す" do
      claim(code: "ZZZZZZZZ")

      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body.dig("error", "code")).to eq("claim_code_not_found")
    end
  end

  describe "使用済み再利用(D: 使用済み再利用)" do
    it "401 claim_code_usedを返す" do
      claim_code = ClaimCode.issue!(user: user, site: site)
      claim(code: claim_code.code)
      expect(response).to have_http_status(:created)

      claim(code: claim_code.code)

      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body.dig("error", "code")).to eq("claim_code_used")
    end
  end

  describe "IP単位のレート制限" do
    it "同一IPからの試行が上限を超えると429を返す" do
      limit = ClaimDeviceService::IP_LIMIT
      ip = "203.0.113.77"

      limit.times { claim(code: "NOMATCH1", ip: ip) }
      claim(code: "NOMATCH1", ip: ip)

      expect(response).to have_http_status(:too_many_requests)
      expect(response.parsed_body.dig("error", "code")).to eq("rate_limited")
    end
  end
end
