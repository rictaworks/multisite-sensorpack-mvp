require "rails_helper"

# requirements.md 1.6 F5 dispatch_command 手順1(手動発行) / openapi.yaml POST
# /devices/{deviceId}/commands(operationId createCommand)。
#
# 認証・テナント分離はIssue #7で整備された Authenticatable/TenantScoped concern を利用する。
# ログインは実際のセッション確立エンドポイント(POST /auth/session)を通す
# (spec/requests/api/claim_codes_spec.rbと同様のパターン)。
RSpec.describe "Api::CommandsController", type: :request do
  let(:user) { User.create!(google_sub: "commands-request-user") }
  let(:other_user) { User.create!(google_sub: "commands-other-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "commands-request-digest") }

  def login_as(logging_in_user)
    allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return(logging_in_user.google_sub)
    post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: "recaptcha-token" }, as: :json
  end

  def create_command(device_id:, command_type: "FAN_ON")
    post "/api/v1/devices/#{device_id}/commands", params: { commandType: command_type }, as: :json
  end

  describe "正常系(F: 発行)" do
    it "201でCommand(pending・TTL10分・冪等ID)を返す" do
      login_as(user)

      create_command(device_id: device.id)

      expect(response).to have_http_status(:created)
      body = response.parsed_body
      expect(body["deviceId"]).to eq(device.id)
      expect(body["commandType"]).to eq("FAN_ON")
      expect(body["origin"]).to eq("manual")
      expect(body["status"]).to eq("pending")
      expect(body["idempotencyKey"]).to be_present
      expect(Time.zone.parse(body["expiresAt"])).to be_within(5.seconds).of(Time.zone.parse(body["issuedAt"]) + 10.minutes)
    end

    # F: オフライン中発行
    it "オフライン中発行: オフラインのデバイスへの発行も許可される" do
      login_as(user)
      device.update!(status_code: Device::STATUS_OFFLINE)

      create_command(device_id: device.id)

      expect(response).to have_http_status(:created)
    end
  end

  describe "未認証" do
    it "ログインしていなければ401を返す" do
      create_command(device_id: device.id)

      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body.dig("error", "code")).to eq("unauthorized")
    end
  end

  # F: 権限外デバイス
  describe "権限外デバイス(F: 権限外デバイス)" do
    it "他ユーザーのデバイスへの発行は403で拒否され、コマンドは作成されない" do
      login_as(other_user)

      create_command(device_id: device.id)

      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body.dig("error", "code")).to eq("forbidden")
      expect(device.commands).to be_empty
    end

    it "存在しないデバイスへの発行は404を返す" do
      login_as(user)

      create_command(device_id: Device.maximum(:id).to_i + 1000)

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "不正なcommandType" do
    it "未知のcommandTypeは400 validation_errorを返す" do
      login_as(user)

      create_command(device_id: device.id, command_type: "NOT_A_COMMAND")

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body.dig("error", "code")).to eq("validation_error")
    end

    it "commandTypeが欠損していれば400を返す" do
      login_as(user)

      post "/api/v1/devices/#{device.id}/commands", params: {}, as: :json

      expect(response).to have_http_status(:bad_request)
    end
  end
end
