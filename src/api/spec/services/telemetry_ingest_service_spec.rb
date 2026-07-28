require "rails_helper"

# requirements.md 1.6 F2 ingest_telemetry / 1.9 Eカテゴリ(テレメトリ検証8ケース)。
# デバイストークン検証(401/410)はコントローラ側(DeviceAuthenticatable)の責務のため、
# 本specはService自体(認証済みDeviceを受け取った後の処理)を対象とする。
# コントローラ経由のHTTP境界は spec/requests/api/telemetry_spec.rb を参照。
RSpec.describe TelemetryIngestService do
  let(:user) { User.create!(google_sub: "telemetry-ingest-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "telemetry-ingest-digest") }

  def call(seq:, temperature_c:, humidity_pct:, device_reported_at: nil, command_acks: [])
    described_class.new(
      device: device, seq: seq, temperature_c: temperature_c, humidity_pct: humidity_pct,
      device_reported_at: device_reported_at, command_acks: command_acks
    ).call
  end

  describe "正常系(E: 正常)" do
    it "値域内のテレメトリを保存し、accepted=trueを返す" do
      result = call(seq: 1, temperature_c: 25.5, humidity_pct: 60.0)

      expect(result.accepted).to be(true)
      expect(result.duplicate).to be(false)
      expect(device.telemetry_readings.count).to eq(1)
    end

    it "サーバー受信時刻をrecorded_atとして採用し、端末申告時刻は参考値として保持のみする(E: 未来時刻申告)" do
      future_claim = 10.years.from_now
      result = call(seq: 1, temperature_c: 25, humidity_pct: 50, device_reported_at: future_claim.iso8601)

      reading = result.reading
      expect(reading.recorded_at).to be_within(2.seconds).of(Time.current)
      expect(reading.recorded_at).not_to be_within(1.day).of(future_claim)
      expect(reading.device_reported_at).to be_within(1.second).of(future_claim)
    end

    it "保存後にdeviceのlast_seen_atを更新し、online状態にする" do
      device.update_column(:status_code, Device::STATUS_PROVISIONING)

      call(seq: 1, temperature_c: 25, humidity_pct: 50)

      expect(device.reload.status_code).to eq(Device::STATUS_ONLINE)
      expect(device.last_seen_at).to be_within(2.seconds).of(Time.current)
    end

    it "オフライン中のデバイスがテレメトリを送るとonlineへ復帰し、オフラインアラートを自動closeする" do
      device.update_column(:status_code, Device::STATUS_ONLINE)
      device.mark_offline!
      offline_alert = device.alerts.open.find_by!(alert_type_code: "offline")

      call(seq: 1, temperature_c: 25, humidity_pct: 50)

      expect(device.reload.status_code).to eq(Device::STATUS_ONLINE)
      expect(offline_alert.reload.status).to eq("closed")
    end

    it "保存後にF3(閾値判定)を同期実行する" do
      Threshold.create!(device: device, sensor_type: SensorType.find_by!(code: "temperature"),
                         direction: "upper", trigger_value: 30, deadband: 1.0)

      3.times { |i| call(seq: i + 1, temperature_c: 31, humidity_pct: 50) }

      expect(device.alerts.open.where(alert_type_code: "threshold_upper_breach").count).to eq(1)
    end
  end

  describe "値域外(E: 値域外)" do
    it "温度が範囲外なら破棄し、accepted=falseかつ破棄件数を記録する(last_seenは更新しない)" do
      result = call(seq: 1, temperature_c: 90, humidity_pct: 50)

      expect(result.accepted).to be(false)
      expect(result.duplicate).to be(false)
      expect(device.telemetry_readings.count).to eq(0)
      expect(device.reload.discarded_readings_count).to eq(1)
      expect(device.last_seen_at).to be_nil
    end

    it "湿度が範囲外なら破棄する" do
      result = call(seq: 1, temperature_c: 20, humidity_pct: 101)

      expect(result.accepted).to be(false)
      expect(device.telemetry_readings.count).to eq(0)
    end
  end

  describe "重複seq(E: 重複seq)" do
    it "同一device_id+seqの再送は保存をスキップし、duplicate=trueを返す" do
      call(seq: 1, temperature_c: 25, humidity_pct: 50)

      result = call(seq: 1, temperature_c: 26, humidity_pct: 55)

      expect(result.accepted).to be(false)
      expect(result.duplicate).to be(true)
      expect(device.telemetry_readings.count).to eq(1)
      expect(device.telemetry_readings.first.temperature_c.to_f).to eq(25.0)
    end
  end

  describe "欠損フィールド(E: 欠損フィールド)" do
    it "seqが欠損していればValidationErrorを送出する" do
      expect { call(seq: nil, temperature_c: 25, humidity_pct: 50) }
        .to raise_error(TelemetryIngestService::ValidationError)
    end

    it "temperatureCが欠損していればValidationErrorを送出する" do
      expect { call(seq: 1, temperature_c: nil, humidity_pct: 50) }
        .to raise_error(TelemetryIngestService::ValidationError)
    end

    it "非数値のtemperatureCはValidationErrorを送出する(不正入力の安全な拒否)" do
      expect { call(seq: 1, temperature_c: "not-a-number", humidity_pct: 50) }
        .to raise_error(TelemetryIngestService::ValidationError)
    end
  end

  # requirements.md 1.6 F5 dispatch_command(ピギーバック配信・ACK処理)。Issue #11。
  # 個々の配信/ACK/TTL失効/自動ルール発火ロジックの網羅はspec/services/command_dispatch_service_spec.rbを参照。
  # ここではTelemetryIngestServiceがCommandDispatchServiceへ正しく配線されていることのみを検証する。
  describe "コマンドピギーバック配信・ACK処理(F5, Issue #11)" do
    it "デバイス宛のpendingコマンドをResult#commandsとしてピギーバック同梱し、deliveredにする" do
      command_type = CommandType.find_by!(code: "FAN_ON")
      command = Command.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "pending", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      result = call(seq: 1, temperature_c: 25, humidity_pct: 50)

      expect(result.commands.map(&:id)).to eq([ command.id ])
      expect(command.reload.status).to eq("delivered")
    end

    it "リクエストのcommand_acksに含まれる冪等IDのコマンドをdoneにする" do
      command_type = CommandType.find_by!(code: "FAN_ON")
      command = Command.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "delivered", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      call(seq: 1, temperature_c: 25, humidity_pct: 50, command_acks: [ command.idempotency_key ])

      expect(command.reload.status).to eq("done")
    end

    it "保存対象外(重複seq)の場合もコマンドのピギーバック配信は行う" do
      command_type = CommandType.find_by!(code: "FAN_ON")
      call(seq: 1, temperature_c: 25, humidity_pct: 50)
      command = Command.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "pending", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      result = call(seq: 1, temperature_c: 26, humidity_pct: 55)

      expect(result.duplicate).to be(true)
      expect(result.commands.map(&:id)).to eq([ command.id ])
    end

    it "保留中コマンドがなければResult#commandsは空配列になる" do
      result = call(seq: 1, temperature_c: 25, humidity_pct: 50)

      expect(result.commands).to eq([])
    end
  end
end
