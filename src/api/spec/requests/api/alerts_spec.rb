require "rails_helper"

# F8 アラート管理API(一覧・ack・未対応件数)のリクエストスペック。
#
# 認証はIssue #7のGoogleログインセッション(Authenticatable)を使う。
# src/shared/contracts/openapi.yaml の listAlerts/acknowledgeAlert はいずれも
# `security: [googleSessionCookie]` を要求しており、development/test限定の
# デバッグヘッダー(X-Debug-User-Id)によるプレースホルダー認証は廃止済みである。
# 本スペックはそのヘッダーがどの環境でも一切機能しないことも検証する。
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

  # 他のリクエストスペック(spec/requests/api/summaries_spec.rb 等)と同じく、
  # GoogleのIDトークン検証のみをスタブし、以降はRailsが発行する本物の
  # セッションcookieでリクエストを継続する。
  def login_as(target_user)
    allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return(target_user.google_sub)
    post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }
  end

  # src/shared/contracts/openapi.yaml components.schemas.Error: {error: {code, message}}
  def expect_contract_error(code)
    body = JSON.parse(response.body)
    expect(body.dig("error", "code")).to eq(code)
    expect(body.dig("error", "message")).to be_present
  end

  describe "GET /api/v1/alerts" do
    it "未認証であれば401を返す" do
      get "/api/v1/alerts"

      expect(response).to have_http_status(:unauthorized)
      expect_contract_error("unauthorized")
    end

    it "既定ではopen/acknowledgedのみを返し、closedとテナント外は含めない" do
      open_alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")
      ack_alert = create_alert(device: owner_device, alert_type: offline_type, severity: critical, status: "acknowledged")
      create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "closed")
      create_alert(device: other_device, alert_type: upper_breach, severity: warning, status: "open")
      login_as(owner)

      get "/api/v1/alerts"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      returned_ids = body["alerts"].map { |a| a["id"] }
      expect(returned_ids).to contain_exactly(open_alert.id, ack_alert.id)
    end

    it "statusクエリで明示的に絞り込める(例:closed)" do
      closed_alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "closed")
      create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")
      login_as(owner)

      get "/api/v1/alerts", params: { status: "closed" }

      body = JSON.parse(response.body)
      expect(body["alerts"].map { |a| a["id"] }).to contain_exactly(closed_alert.id)
    end

    it "deviceIdクエリでデバイス単位に絞り込める" do
      target = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")
      second_device = Device.create!(site: owner_site, device_token_digest: "alerts-spec-owner-device-2")
      create_alert(device: second_device, alert_type: upper_breach, severity: warning, status: "open")
      login_as(owner)

      get "/api/v1/alerts", params: { deviceId: owner_device.id }

      body = JSON.parse(response.body)
      expect(body["alerts"].map { |a| a["id"] }).to contain_exactly(target.id)
    end

    it "テナント分離: 他ユーザーのdeviceIdを指定しても空配列を返す(越境参照不可)" do
      create_alert(device: other_device, alert_type: upper_breach, severity: warning, status: "open")
      login_as(owner)

      get "/api/v1/alerts", params: { deviceId: other_device.id }

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["alerts"]).to be_empty
    end

    it "アラートをOpenAPI契約のcamelCase形状(id/deviceId/alertType/severity/status/openedAt)で返す" do
      alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")
      login_as(owner)

      get "/api/v1/alerts"

      body = JSON.parse(response.body)["alerts"].first
      expect(body).to include(
        "id" => alert.id,
        "deviceId" => owner_device.id,
        # DBのマスタコードは "threshold_upper_breach" だが、契約(openapi.yaml AlertTypeCode)は
        # "upper_breach"。そのまま返すと契約違反になり、契約の値で表示文言を引くNext.js側で
        # アラート種別を表示できない。
        "alertType" => "upper_breach",
        "severity" => "warning",
        "status" => "open"
      )
      expect(body["openedAt"]).not_to be_nil
      expect(body["acknowledgedAt"]).to be_nil
      expect(body["closedAt"]).to be_nil
    end

    # 種別ごとに変換されることを保証する(1件だけ通っても他の種別が漏れていれば同じ不具合が起きる)。
    it "アラート種別コードを契約のAlertTypeCodeへ変換して返す(下限逸脱・オフラインを含む)" do
      lower_breach = AlertType.find_by!(code: Alert::THRESHOLD_LOWER_BREACH_ALERT_TYPE_CODE)
      offline = AlertType.find_by!(code: Device::OFFLINE_ALERT_TYPE_CODE)
      create_alert(device: owner_device, alert_type: lower_breach, severity: warning, status: "open")
      create_alert(device: owner_device, alert_type: offline, severity: warning, status: "open")
      login_as(owner)

      get "/api/v1/alerts"

      returned_types = JSON.parse(response.body)["alerts"].map { |alert| alert["alertType"] }
      expect(returned_types).to contain_exactly("lower_breach", "offline")
    end

    it "不正なstatus値を指定すると契約形状の400を返す" do
      login_as(owner)

      get "/api/v1/alerts", params: { status: "bogus" }

      expect(response).to have_http_status(:bad_request)
      expect_contract_error("validation_error")
      expect(JSON.parse(response.body).dig("error", "details", "invalidStatuses")).to eq([ "bogus" ])
    end
  end

  describe "GET /api/v1/alerts/unread-count" do
    it "未認証であれば401を返す" do
      get "/api/v1/alerts/unread-count"

      expect(response).to have_http_status(:unauthorized)
      expect_contract_error("unauthorized")
    end

    it "自分のopen状態アラート件数のみをバッジ用件数として返す(closed/acknowledged/他テナントは含めない)" do
      create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")
      create_alert(device: owner_device, alert_type: offline_type, severity: critical, status: "open")
      create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "acknowledged")
      create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "closed")
      create_alert(device: other_device, alert_type: upper_breach, severity: warning, status: "open")
      login_as(owner)

      get "/api/v1/alerts/unread-count"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["unreadCount"]).to eq(2)
    end
  end

  describe "POST /api/v1/alerts/:alertId/ack" do
    it "open状態の自分のアラートをacknowledgedに遷移させる" do
      alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")
      login_as(owner)

      post "/api/v1/alerts/#{alert.id}/ack"

      expect(response).to have_http_status(:ok)
      alert.reload
      expect(alert.status).to eq("acknowledged")
      expect(alert.acknowledged_at).not_to be_nil
      expect(JSON.parse(response.body)["status"]).to eq("acknowledged")
    end

    it "既にacknowledged済みのアラートへのackは冪等に200を返す(二重ack)" do
      alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "acknowledged")
      login_as(owner)

      post "/api/v1/alerts/#{alert.id}/ack"

      expect(response).to have_http_status(:ok)
      expect(alert.reload.status).to eq("acknowledged")
    end

    it "closed状態のアラートへのackは契約形状の409を返し、状態を変更しない(手動close不可)" do
      alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "closed")
      login_as(owner)

      post "/api/v1/alerts/#{alert.id}/ack"

      expect(response).to have_http_status(:conflict)
      expect_contract_error("alert_already_closed")
      expect(alert.reload.status).to eq("closed")
    end

    it "存在しないアラートIDには契約形状の404を返す" do
      login_as(owner)

      post "/api/v1/alerts/999999999/ack"

      expect(response).to have_http_status(:not_found)
      expect_contract_error("not_found")
    end

    it "テナント分離: 他ユーザーのデバイスに属するアラートは403で拒否し、状態を変更しない" do
      other_alert = create_alert(device: other_device, alert_type: upper_breach, severity: warning, status: "open")
      login_as(owner)

      post "/api/v1/alerts/#{other_alert.id}/ack"

      expect(response).to have_http_status(:forbidden)
      expect_contract_error("forbidden")
      expect(other_alert.reload.status).to eq("open")
    end

    it "未認証であれば401を返し、状態を変更しない" do
      alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")

      post "/api/v1/alerts/#{alert.id}/ack"

      expect(response).to have_http_status(:unauthorized)
      expect_contract_error("unauthorized")
      expect(alert.reload.status).to eq("open")
    end
  end

  # 旧実装(Issue #15時点)はcurrent_userをX-Debug-User-Idヘッダーから解決していた。
  # 本番ではfail closedで無効だったものの、development/testでは任意ユーザーへの
  # なりすましが可能でテナント分離が成立していなかったため、ヘッダー自体を廃止した。
  describe "廃止されたデバッグ認証ヘッダー(X-Debug-User-Id)" do
    it "test環境でも一切機能せず401を返す(なりすまし不可)" do
      create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")

      get "/api/v1/alerts", headers: { "X-Debug-User-Id" => owner.id.to_s }

      expect(response).to have_http_status(:unauthorized)
      expect_contract_error("unauthorized")
    end

    it "セッション確立済みの別ユーザーがヘッダーで所有者になりすますことはできない" do
      owner_alert = create_alert(device: owner_device, alert_type: upper_breach, severity: warning, status: "open")
      login_as(other_user)

      post "/api/v1/alerts/#{owner_alert.id}/ack", headers: { "X-Debug-User-Id" => owner.id.to_s }

      expect(response).to have_http_status(:forbidden)
      expect(owner_alert.reload.status).to eq("open")
    end
  end
end
