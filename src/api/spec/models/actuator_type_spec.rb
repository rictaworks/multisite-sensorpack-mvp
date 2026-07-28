require "rails_helper"

RSpec.describe ActuatorType, type: :model do
  describe "associations" do
    it { expect(described_class.reflect_on_association(:command_types).macro).to eq(:has_many) }
  end

  describe "マスタデータ(requirements.md 1.7: 2件)" do
    it "seeds exactly led and fan" do
      expect(described_class.pluck(:code)).to contain_exactly("led", "fan")
    end
  end
end
