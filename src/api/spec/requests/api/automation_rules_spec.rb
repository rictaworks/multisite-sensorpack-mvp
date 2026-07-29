require "rails_helper"

# openapi.yaml getAutomationRule / updateAutomationRule（F5・UC9）。
#
# 契約に定義がありながらRails側にルーティングが存在せず、運用ツール画面(Issue #21)の
# 自動制御ルールのトグルが実APIへ結線できない状態だった。
RSpec.describe "/api/v1/devices/:deviceId/automation-rule", type: :request do
  let!(:owner) { User.create!(google_sub: "automation-owner-#{SecureRandom.hex(4)}") }
  let!(:other_user) { User.create!(google_sub: "automation-other-#{SecureRandom.hex(4)}") }
  let!(:site) { Site.create!(user: owner, name: "倉庫A") }
  let!(:device) { Device.provision_for_site!(site).first }

  def login_as(user)
    allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return(user.google_sub)
    post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }
  end

  describe "GET" do
    it "未認証の場合は401を返す" do
      get "/api/v1/devices/#{device.id}/automation-rule"

      expect(response).to have_http_status(:unauthorized)
    end

    it "設定済みのルールを契約どおりの形状で返す" do
      AutomationRule.create!(device: device, fan_on_temp_alert: true, led_on_alert: false)
      login_as(owner)

      get "/api/v1/devices/#{device.id}/automation-rule"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to include(
        "fanOnTempAlert" => true,
        "ledOnAlert" => false,
        "manualOverrideUntil" => nil
      )
    end

    # ルール未作成のデバイスで404を返すと、画面は「デバイスが無い」のか
    # 「まだ設定していない」のか区別できない。既定値(いずれも無効)を返す。
    it "ルール未作成のデバイスには既定値(いずれも無効)を返す" do
      login_as(owner)

      get "/api/v1/devices/#{device.id}/automation-rule"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to include("fanOnTempAlert" => false, "ledOnAlert" => false)
    end

    it "テナント分離: 他ユーザーのデバイスは403で拒否する" do
      login_as(other_user)

      get "/api/v1/devices/#{device.id}/automation-rule"

      expect(response).to have_http_status(:forbidden)
    end

    it "存在しないデバイスは404を返す" do
      login_as(owner)

      get "/api/v1/devices/#{Device.maximum(:id).to_i + 1}/automation-rule"

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "PUT" do
    it "未認証の場合は401を返し、ルールを変更しない" do
      put "/api/v1/devices/#{device.id}/automation-rule", params: { fanOnTempAlert: true }

      expect(response).to have_http_status(:unauthorized)
      expect(AutomationRule.find_by(device: device)).to be_nil
    end

    it "ルール未作成のデバイスでは新規作成し、更新後の値を返す" do
      login_as(owner)

      expect {
        put "/api/v1/devices/#{device.id}/automation-rule", params: { fanOnTempAlert: true, ledOnAlert: true }
      }.to change(AutomationRule, :count).by(1)

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to include("fanOnTempAlert" => true, "ledOnAlert" => true)
    end

    it "既存のルールを更新する" do
      AutomationRule.create!(device: device, fan_on_temp_alert: true, led_on_alert: true)
      login_as(owner)

      put "/api/v1/devices/#{device.id}/automation-rule", params: { fanOnTempAlert: false, ledOnAlert: false }

      expect(response).to have_http_status(:ok)
      rule = AutomationRule.find_by!(device: device)
      expect(rule.fan_on_temp_alert).to be(false)
      expect(rule.led_on_alert).to be(false)
    end

    # 契約(AutomationRuleUpdateRequest)はどちらのフィールドも必須ではない。
    # 片方だけ送ったときにもう片方が既定値へ巻き戻ると、画面のトグルが勝手に戻る。
    it "指定しなかったフィールドは現在値を維持する" do
      AutomationRule.create!(device: device, fan_on_temp_alert: true, led_on_alert: true)
      login_as(owner)

      put "/api/v1/devices/#{device.id}/automation-rule", params: { fanOnTempAlert: false }

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to include("fanOnTempAlert" => false, "ledOnAlert" => true)
    end

    it "真偽値として解釈できない値は契約形状の400で拒否する" do
      login_as(owner)

      put "/api/v1/devices/#{device.id}/automation-rule", params: { fanOnTempAlert: "maybe" }

      expect(response).to have_http_status(:bad_request)
      expect(JSON.parse(response.body).dig("error", "code")).to eq("validation_error")
    end

    it "テナント分離: 他ユーザーのデバイスは403で拒否し、ルールを作らない" do
      login_as(other_user)

      expect {
        put "/api/v1/devices/#{device.id}/automation-rule", params: { fanOnTempAlert: true }
      }.not_to change(AutomationRule, :count)

      expect(response).to have_http_status(:forbidden)
    end

    it "存在しないデバイスは404を返す" do
      login_as(owner)

      put "/api/v1/devices/#{Device.maximum(:id).to_i + 1}/automation-rule", params: { fanOnTempAlert: true }

      expect(response).to have_http_status(:not_found)
    end
  end
end
