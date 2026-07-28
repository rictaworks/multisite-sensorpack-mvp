require "rails_helper"

RSpec.describe CommandType, type: :model do
  describe "associations" do
    it { expect(described_class.reflect_on_association(:actuator_type).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:commands).macro).to eq(:has_many) }
  end

  describe "マスタデータ(requirements.md 1.7: 4件)" do
    it "seeds exactly LED_ON/LED_OFF/FAN_ON/FAN_OFF" do
      expect(described_class.pluck(:code)).to contain_exactly("LED_ON", "LED_OFF", "FAN_ON", "FAN_OFF")
    end

    it "links LED commands to the led actuator_type" do
      expect(described_class.find_by!(code: "LED_ON").actuator_type.code).to eq("led")
    end

    it "links FAN commands to the fan actuator_type" do
      expect(described_class.find_by!(code: "FAN_ON").actuator_type.code).to eq("fan")
    end
  end
end
