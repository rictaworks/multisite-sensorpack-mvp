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

    # Transfer-Encoding: chunked ではContent-Lengthが送られないため、宣言値だけを見る
    # 判定では巨大ペイロードが素通りする。rack-testのpostはボディからContent-Lengthを
    # 必ず算出してしまうため、chunkedリクエストはRackのenvを直接組み立てて再現する。
    def post_telemetry_chunked(token:, body:)
      env = Rack::MockRequest.env_for(
        "/api/v1/telemetry", method: "POST", input: body.to_json,
        "CONTENT_TYPE" => "application/json",
        "HTTP_AUTHORIZATION" => "Bearer #{token}",
        "HTTP_TRANSFER_ENCODING" => "chunked"
      )
      env.delete("CONTENT_LENGTH")
      status, _headers, rack_body = Rails.application.call(env)
      [ status, JSON.parse(rack_body.each.to_a.join) ]
    end

    it "Content-Lengthが送られない(chunked)場合も実ボディサイズで400拒否する" do
      _device, token = provision_device
      oversized_note = "x" * (Api::TelemetryController::MAX_BODY_BYTES + 1)

      status, parsed = post_telemetry_chunked(
        token: token, body: { seq: 1, temperatureC: 25, humidityPct: 50, note: oversized_note }
      )

      expect(status).to eq(400)
      expect(parsed.dig("error", "code")).to eq("validation_error")
    end

    it "Content-Lengthが送られない場合でも上限以内のリクエストは正常に受理する" do
      _device, token = provision_device

      status, parsed = post_telemetry_chunked(token: token, body: { seq: 1, temperatureC: 25, humidityPct: 50 })

      expect(status).to eq(200)
      expect(parsed["accepted"]).to be(true)
    end
  end

  # requirements.md 1.6 F5 dispatch_command(ピギーバック配信・ACK処理)。Issue #11。
  # HTTP境界(commandAcksの受け取り・commandsレスポンス形状)のみを検証する。
  # 個々の配信/ACK/TTL失効/自動ルール発火ロジックの網羅は spec/services/command_dispatch_service_spec.rb を参照。
  describe "コマンドピギーバック配信・ACK処理(F5, Issue #11)" do
    it "保留中コマンドをcommands(CommandDelivery形状)としてピギーバック同梱する" do
      device, token = provision_device
      command_type = CommandType.find_by!(code: "FAN_ON")
      command = Command.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "pending", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      post_telemetry(token: token, body: { seq: 1, temperatureC: 25, humidityPct: 50 })

      expect(response).to have_http_status(:ok)
      commands = response.parsed_body["commands"]
      expect(commands.size).to eq(1)
      expect(commands.first["idempotencyKey"]).to eq(command.idempotency_key)
      expect(commands.first["commandType"]).to eq("FAN_ON")
      expect(commands.first["issuedAt"]).to be_present
      expect(command.reload.status).to eq("delivered")
    end

    it "リクエストのcommandAcksで指定した冪等IDのコマンドをdoneにする" do
      device, token = provision_device
      command_type = CommandType.find_by!(code: "FAN_ON")
      command = Command.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "delivered", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      post_telemetry(
        token: token,
        body: { seq: 1, temperatureC: 25, humidityPct: 50, commandAcks: [ { idempotencyKey: command.idempotency_key } ] }
      )

      expect(response).to have_http_status(:ok)
      expect(command.reload.status).to eq("done")
    end
  end
end
