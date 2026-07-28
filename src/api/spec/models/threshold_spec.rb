require "rails_helper"

RSpec.describe Threshold, type: :model do
  let(:user) { User.create!(google_sub: "threshold-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "threshold-digest") }
  let(:sensor_type) { SensorType.find_by!(code: "temperature") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:device).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:sensor_type).macro).to eq(:belongs_to) }
  end

  describe "validations(requirements.md F3)" do
    it "accepts only upper/lower directions" do
      threshold = described_class.new(device: device, sensor_type: sensor_type, direction: "diagonal", trigger_value: 30)

      expect(threshold).not_to be_valid
    end

    it "defaults breach_state to NORMAL" do
      threshold = described_class.create!(device: device, sensor_type: sensor_type, direction: "upper", trigger_value: 30)

      expect(threshold.breach_state).to eq("NORMAL")
    end

    it "rejects a duplicate device/sensor_type/direction combination" do
      described_class.create!(device: device, sensor_type: sensor_type, direction: "upper", trigger_value: 30)
      duplicate = described_class.new(device: device, sensor_type: sensor_type, direction: "upper", trigger_value: 35)

      expect(duplicate).not_to be_valid
    end
  end
end
