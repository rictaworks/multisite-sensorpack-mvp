require "rails_helper"

RSpec.describe AutomationRule, type: :model do
  let(:user) { User.create!(google_sub: "automation-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "automation-digest") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:device).macro).to eq(:belongs_to) }
  end

  describe "validations(requirements.md ER図: DEVICES ||--o| AUTOMATION_RULES)" do
    it "allows at most one automation_rule per device" do
      described_class.create!(device: device)
      duplicate = described_class.new(device: device)

      expect(duplicate).not_to be_valid
    end

    it "defaults booleans to false" do
      rule = described_class.create!(device: device)

      expect(rule.fan_on_temp_alert).to be(false)
      expect(rule.led_on_alert).to be(false)
    end
  end

  # requirements.md F5 受け入れ条件: 手動コマンド発行後30分間は同一アクチュエータへの
  # 自動ルール発行を抑止する(手動優先のオーバーライドウィンドウ)。
  describe "#manual_override_active?(Issue #11)" do
    let(:rule) { described_class.create!(device: device) }
    let(:fan_on) { CommandType.find_by!(code: "FAN_ON") }
    let(:led_on) { CommandType.find_by!(code: "LED_ON") }

    def create_manual_command!(command_type:, issued_at:)
      Command.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "pending", issued_at: issued_at, expires_at: issued_at + 10.minutes
      )
    end

    it "is true within 30 minutes of a manual command for the same actuator" do
      create_manual_command!(command_type: fan_on, issued_at: 5.minutes.ago)

      expect(rule.manual_override_active?("fan")).to be(true)
    end

    it "is false once 30 minutes have elapsed since the manual command" do
      create_manual_command!(command_type: fan_on, issued_at: 31.minutes.ago)

      expect(rule.manual_override_active?("fan")).to be(false)
    end

    it "does not suppress a different actuator(same-actuator scoping)" do
      create_manual_command!(command_type: fan_on, issued_at: 5.minutes.ago)

      expect(rule.manual_override_active?("led")).to be(false)
    end

    it "ignores auto-origin commands(only manual dispatch starts the override window)" do
      Command.create!(
        device: device, command_type: led_on, idempotency_key: SecureRandom.uuid,
        origin: "auto", status: "pending", issued_at: 5.minutes.ago, expires_at: 5.minutes.from_now
      )

      expect(rule.manual_override_active?("led")).to be(false)
    end
  end

  describe "#register_manual_override!(Issue #11)" do
    it "sets manual_override_until 30 minutes from now" do
      rule = described_class.create!(device: device)

      rule.register_manual_override!

      expect(rule.reload.manual_override_until).to be_within(2.seconds).of(30.minutes.from_now)
    end
  end
end
