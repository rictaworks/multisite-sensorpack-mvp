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
end
