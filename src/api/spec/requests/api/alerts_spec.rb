require "rails_helper"

# F8 アラート管理API(一覧・ack・未対応件数)のリクエストスペック。
#
# 認証(Google OAuth本番実装)はIssue #7の担当範囲であり未着手のため、本スペックでは
# development/test環境限定のデバッグヘッダー(X-Debug-User-Id)でcurrent_userを切り替える。
# production環境ではこのヘッダーが絶対に機能しないこと(fail closed)も検証する
# (.claude/rules/environment.md)。
RSpec.describe "Api::Alerts", type: :request do
  let(:owner) { User.create!(google_sub: "alerts-spec-owner") }
  let(:other_user) { User.create!(google_sub: "alerts-spec-other-user") }

  let(:owner_site) { Site.create!(user: owner, name: "倉庫A") }
  let(:other_site) { Site.create!(user: other_user, name: "倉庫B") }

  let(:owner_device) { Device.create!(site: owner_site, device_token_digest: "alerts-spec-owner-device") }
  let(:other_device) { Device.create!(site: other_site, device_token_digest: "alerts-spec-other-device") }

  let(:upper_breach) { AlertType.find_by!(code: "threshold_upper_breach") }
  let(:offline_type) { AlertType.find_by!(code: "offline") }
  let(:warning) { AlertSeverity.find_by!(code: "warning") }
  let(:critical) { AlertSeverity.find_by!(code: "critical") }

  def create_alert(device:, alert_type:, severity:, status: "open")
    Alert.create!(
      device: device, alert_type: alert_type, alert_severity: severity,
      status: status, opened_at: Time.current,
      acknowledged_at: (status == "acknowledged" ? Time.current : nil),
      closed_at: (status == "closed" ? Time.current : nil)
    )
  end

  def auth_headers(user)
    { "X-Debug-User-Id" => user.id.to_s }
  end

  describe "GET /api/alerts" do
    it "認証ヘッダーがなければ401を返す" do
      get "/api/alerts"

      expect(response).to have_http_status(:unauthorized)
    end

    it "既定ではopen/acknowledgedのみを返し、closedとテナント外は含めない" do
      open_alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")
      ack_alert = create_alert(device: owner_device, alert_type: offline_type, severity: critical, status: "acknowledged")
      create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "closed")
      create_alert(device: other_device, alert_type: upper_breach, severity: warning, status: "open")

      get "/api/alerts", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      returned_ids = body["alerts"].map { |a| a["id"] }
      expect(returned_ids).to contain_exactly(open_alert.id, ack_alert.id)
    end

    it "statusクエリで明示的に絞り込める(例:closed)" do
      closed_alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "closed")
      create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")

      get "/api/alerts", params: { status: "closed" }, headers: auth_headers(owner)

      body = JSON.parse(response.body)
      expect(body["alerts"].map { |a| a["id"] }).to contain_exactly(closed_alert.id)
    end

    it "deviceIdクエリでデバイス単位に絞り込める" do
      target = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")
      second_device = Device.create!(site: owner_site, device_token_digest: "alerts-spec-owner-device-2")
      create_alert(device: second_device, alert_type: upper_breach, severity: warning, status: "open")

      get "/api/alerts", params: { deviceId: owner_device.id }, headers: auth_headers(owner)

      body = JSON.parse(response.body)
      expect(body["alerts"].map { |a| a["id"] }).to contain_exactly(target.id)
    end

    it "アラートをOpenAPI契約のcamelCase形状(id/deviceId/alertType/severity/status/openedAt)で返す" do
      alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")

      get "/api/alerts", headers: auth_headers(owner)

      body = JSON.parse(response.body)["alerts"].first
      expect(body).to include(
        "id" => alert.id,
        "deviceId" => owner_device.id,
        "alertType" => "threshold_upper_breach",
        "severity" => "warning",
        "status" => "open"
      )
      expect(body["openedAt"]).not_to be_nil
      expect(body["acknowledgedAt"]).to be_nil
      expect(body["closedAt"]).to be_nil
    end

    it "不正なstatus値を指定すると400を返す" do
      get "/api/alerts", params: { status: "bogus" }, headers: auth_headers(owner)

      expect(response).to have_http_status(:bad_request)
    end
  end

  describe "GET /api/alerts/unread_count" do
    it "認証ヘッダーがなければ401を返す" do
      get "/api/alerts/unread_count"

      expect(response).to have_http_status(:unauthorized)
    end

    it "自分のopen状態アラート件数のみをバッジ用件数として返す(closed/acknowledged/他テナントは含めない)" do
      create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")
      create_alert(device: owner_device, alert_type: offline_type, severity: critical, status: "open")
      create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "acknowledged")
      create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "closed")
      create_alert(device: other_device, alert_type: upper_breach, severity: warning, status: "open")

      get "/api/alerts/unread_count", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["unreadCount"]).to eq(2)
    end
  end

  describe "POST /api/alerts/:alertId/ack" do
    it "open状態の自分のアラートをacknowledgedに遷移させる" do
      alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")

      post "/api/alerts/#{alert.id}/ack", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      alert.reload
      expect(alert.status).to eq("acknowledged")
      expect(alert.acknowledged_at).not_to be_nil
      expect(JSON.parse(response.body)["status"]).to eq("acknowledged")
    end

    it "既にacknowledged済みのアラートへのackは冪等に200を返す(二重ack)" do
      alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "acknowledged")

      post "/api/alerts/#{alert.id}/ack", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(alert.reload.status).to eq("acknowledged")
    end

    it "closed状態のアラートへのackは409を返し、状態を変更しない(手動close不可)" do
      alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "closed")

      post "/api/alerts/#{alert.id}/ack", headers: auth_headers(owner)

      expect(response).to have_http_status(:conflict)
      expect(alert.reload.status).to eq("closed")
    end

    it "存在しないアラートIDには404を返す" do
      post "/api/alerts/999999999/ack", headers: auth_headers(owner)

      expect(response).to have_http_status(:not_found)
    end

    it "テナント分離: 他ユーザーのデバイスに属するアラートは403で拒否し、状態を変更しない" do
      other_alert = create_alert(device: other_device, alert_type: upper_breach, severity: warning, status: "open")

      post "/api/alerts/#{other_alert.id}/ack", headers: auth_headers(owner)

      expect(response).to have_http_status(:forbidden)
      expect(other_alert.reload.status).to eq("open")
    end

    it "認証ヘッダーがなければ401を返す" do
      alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")

      post "/api/alerts/#{alert.id}/ack"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "環境フェイルクローズ(.claude/rules/environment.md)" do
    it "development/test以外の環境ではX-Debug-User-Idヘッダーが機能せず401になる" do
      allow(Rails.env).to receive(:development?).and_return(false)
      allow(Rails.env).to receive(:test?).and_return(false)

      get "/api/alerts", headers: auth_headers(owner)

      expect(response).to have_http_status(:unauthorized)
    end
  end
end
