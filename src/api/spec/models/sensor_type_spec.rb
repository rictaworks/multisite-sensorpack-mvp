require "rails_helper"

RSpec.describe SensorType, type: :model do
  describe "associations" do
    it { expect(described_class.reflect_on_association(:thresholds).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:hourly_aggregates).macro).to eq(:has_many) }
  end

  describe "マスタデータ(requirements.md 1.7: 2件)" do
    it "seeds exactly temperature and humidity" do
      expect(described_class.pluck(:code)).to contain_exactly("temperature", "humidity")
    end
  end
end
