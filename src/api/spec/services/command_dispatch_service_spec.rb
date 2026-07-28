require "rails_helper"

# requirements.md 1.6 F5 dispatch_command / 1.9 Fカテゴリ(発行/配信/ACK/TTL失効/重複ACK/
# 手動vs自動競合/自動ルール発火/オフライン中発行/複数pending順序/権限外デバイス、10ケース)。
#
# 権限外デバイス(他ユーザーのデバイスへの手動発行)はコントローラ側のテナント分離(TenantScoped)の
# 責務であり、spec/requests/api/commands_spec.rbで検証する。本specは認可済みのDeviceを
# 受け取った後のサービス自体の振る舞いを対象とする。
RSpec.describe CommandDispatchService do
  let(:user) { User.create!(google_sub: "command-dispatch-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "command-dispatch-digest") }
  let(:fan_on) { CommandType.find_by!(code: "FAN_ON") }
  let(:fan_off) { CommandType.find_by!(code: "FAN_OFF") }
  let(:led_on) { CommandType.find_by!(code: "LED_ON") }
  let(:led_off) { CommandType.find_by!(code: "LED_OFF") }

  def open_temperature_upper_alert!(device)
    device.alerts.create!(
      alert_type_code: Alert::THRESHOLD_UPPER_BREACH_ALERT_TYPE_CODE,
      severity_code: Alert::THRESHOLD_BREACH_ALERT_SEVERITY_CODE,
      status: "open", opened_at: Time.current
    )
  end

  # F: 発行
  describe "#enqueue_manual!(F: 発行)" do
    it "enqueues an idempotent-keyed pending manual command with a 10 minute TTL" do
      command = described_class.new(device: device).enqueue_manual!(command_type_code: "FAN_ON")

      expect(command).to be_persisted
      expect(command.origin).to eq("manual")
      expect(command.status).to eq("pending")
      expect(command.idempotency_key).to be_present
      expect(command.expires_at).to be_within(2.seconds).of(command.issued_at + 10.minutes)
    end

    it "starts the 30 minute manual override window for the same actuator" do
      described_class.new(device: device).enqueue_manual!(command_type_code: "FAN_ON")

      expect(device.reload.automation_rule.manual_override_until).to be_within(2.seconds).of(30.minutes.from_now)
    end

    it "raises for an unknown commandType(fail fast, no fallback)" do
      expect { described_class.new(device: device).enqueue_manual!(command_type_code: "NOT_A_COMMAND") }
        .to raise_error(CommandDispatchService::InvalidCommandTypeError)
    end

    # F: オフライン中発行
    it "オフライン中発行: allows enqueueing against an offline device" do
      device.update!(status_code: Device::STATUS_OFFLINE)

      command = described_class.new(device: device).enqueue_manual!(command_type_code: "FAN_ON")

      expect(command.status).to eq("pending")
    end
  end

  # F: 配信 / 複数pending順序
  describe "#piggyback!(F: 配信・複数pending順序)" do
    it "delivers only pending, non-expired commands, oldest issued_at first, capped at 5" do
      service = described_class.new(device: device)
      base = Time.current
      commands = (1..7).map do |i|
        Command.create!(
          device: device, command_type: fan_on, idempotency_key: SecureRandom.uuid,
          origin: "manual", status: "pending", issued_at: base + i.seconds, expires_at: 10.minutes.from_now
        )
      end

      delivered = service.piggyback!

      expect(delivered.map(&:id)).to eq(commands.first(5).map(&:id))
      expect(delivered).to all(have_attributes(status: "delivered"))
      expect(commands.first(5).map { |c| c.reload.status }).to all(eq("delivered"))
      expect(commands.drop(5).map { |c| c.reload.status }).to all(eq("pending"))
    end

    it "does not redeliver a command that is already delivered" do
      command = Command.create!(
        device: device, command_type: fan_on, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "delivered", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      delivered = described_class.new(device: device).piggyback!

      expect(delivered).not_to include(command)
    end
  end

  # F: ACK / 重複ACK
  describe "#piggyback!(F: ACK・重複ACK)" do
    it "marks an ACKed command done and does not re-deliver it" do
      command = Command.create!(
        device: device, command_type: fan_on, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "delivered", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      described_class.new(device: device).piggyback!(command_acks: [ command.idempotency_key ])

      expect(command.reload.status).to eq("done")
    end

    it "重複ACK: ignores a duplicate ACK for an already-done command without raising" do
      command = Command.create!(
        device: device, command_type: fan_on, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "done", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      expect {
        described_class.new(device: device).piggyback!(command_acks: [ command.idempotency_key ])
      }.not_to raise_error
      expect(command.reload.status).to eq("done")
    end

    it "silently ignores an ACK for an unknown idempotency key(no cross-device effect)" do
      other_device = Device.create!(site: site, device_token_digest: "other-device-digest")
      foreign_command = Command.create!(
        device: other_device, command_type: fan_on, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "delivered", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      expect {
        described_class.new(device: device).piggyback!(command_acks: [ foreign_command.idempotency_key ])
      }.not_to raise_error
      expect(foreign_command.reload.status).to eq("delivered")
    end
  end

  # F: TTL失効
  describe "#piggyback!(F: TTL失効)" do
    it "expires pending/delivered commands past their TTL and excludes them from delivery" do
      overdue = Command.create!(
        device: device, command_type: fan_on, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "pending", issued_at: 20.minutes.ago, expires_at: 1.minute.ago
      )
      overdue_delivered = Command.create!(
        device: device, command_type: fan_on, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "delivered", issued_at: 20.minutes.ago, expires_at: 1.minute.ago
      )

      delivered = described_class.new(device: device).piggyback!

      expect(overdue.reload.status).to eq("expired")
      expect(overdue_delivered.reload.status).to eq("expired")
      expect(delivered).to be_empty
    end
  end

  # F: 自動ルール発火
  describe "#piggyback!(F: 自動ルール発火)" do
    it "dispatches FAN_ON when the temperature upper alert opens and fan_on_temp_alert is enabled" do
      device.create_automation_rule!(fan_on_temp_alert: true, led_on_alert: false)
      open_temperature_upper_alert!(device)

      delivered = described_class.new(device: device).piggyback!

      fan_commands = delivered.select { |c| c.command_type_code == "FAN_ON" }
      expect(fan_commands.size).to eq(1)
      expect(fan_commands.first.origin).to eq("auto")
    end

    it "does not re-dispatch FAN_ON repeatedly while the alert stays open" do
      device.create_automation_rule!(fan_on_temp_alert: true, led_on_alert: false)
      open_temperature_upper_alert!(device)
      service = described_class.new(device: device)
      service.piggyback!

      delivered_again = service.piggyback!

      expect(delivered_again.select { |c| c.command_type_code == "FAN_ON" }).to be_empty
    end

    it "dispatches FAN_OFF once the temperature upper alert closes" do
      device.create_automation_rule!(fan_on_temp_alert: true, led_on_alert: false)
      alert = open_temperature_upper_alert!(device)
      described_class.new(device: device).piggyback!
      alert.auto_close!

      delivered = described_class.new(device: device).piggyback!

      fan_off_commands = delivered.select { |c| c.command_type_code == "FAN_OFF" }
      expect(fan_off_commands.size).to eq(1)
      expect(fan_off_commands.first.origin).to eq("auto")
    end

    it "does not dispatch FAN_OFF automatically when no automatic FAN_ON was ever issued" do
      device.create_automation_rule!(fan_on_temp_alert: true, led_on_alert: false)

      delivered = described_class.new(device: device).piggyback!

      expect(delivered.select { |c| c.command_type_code == "FAN_OFF" }).to be_empty
    end

    it "LED reacts to any open alert(not limited to temperature upper breach), as a local indicator light" do
      device.create_automation_rule!(fan_on_temp_alert: false, led_on_alert: true)
      device.alerts.create!(
        alert_type_code: "offline", severity_code: "warning", status: "open", opened_at: Time.current
      )

      delivered = described_class.new(device: device).piggyback!

      expect(delivered.map(&:command_type_code)).to include("LED_ON")
    end

    it "does not dispatch when the automation flag is disabled" do
      device.create_automation_rule!(fan_on_temp_alert: false, led_on_alert: false)
      open_temperature_upper_alert!(device)

      delivered = described_class.new(device: device).piggyback!

      expect(delivered).to be_empty
    end

    it "does nothing when the device has no automation_rule configured" do
      open_temperature_upper_alert!(device)

      expect { described_class.new(device: device).piggyback! }.not_to raise_error
    end
  end

  # F: 手動vs自動競合
  describe "#piggyback!(F: 手動vs自動競合)" do
    it "suppresses automatic FAN_ON dispatch within 30 minutes of a manual command on the same actuator" do
      device.create_automation_rule!(fan_on_temp_alert: true, led_on_alert: false)
      described_class.new(device: device).enqueue_manual!(command_type_code: "FAN_OFF")
      open_temperature_upper_alert!(device)

      delivered = described_class.new(device: device).piggyback!

      expect(delivered.map(&:command_type_code)).not_to include("FAN_ON")
    end

    it "does not suppress a different actuator's automation" do
      device.create_automation_rule!(fan_on_temp_alert: true, led_on_alert: true)
      described_class.new(device: device).enqueue_manual!(command_type_code: "LED_ON")
      open_temperature_upper_alert!(device)

      delivered = described_class.new(device: device).piggyback!

      expect(delivered.map(&:command_type_code)).to include("FAN_ON")
    end

    it "resumes automatic dispatch once the 30 minute override window elapses" do
      device.create_automation_rule!(fan_on_temp_alert: true, led_on_alert: false)
      manual = described_class.new(device: device).enqueue_manual!(command_type_code: "FAN_OFF")
      manual.update!(issued_at: 31.minutes.ago)
      open_temperature_upper_alert!(device)

      delivered = described_class.new(device: device).piggyback!

      expect(delivered.map(&:command_type_code)).to include("FAN_ON")
    end
  end
end
