require "rails_helper"

RSpec.describe AlertSeverity, type: :model do
  describe "associations" do
    it { expect(described_class.reflect_on_association(:alerts).macro).to eq(:has_many) }
  end

  describe "マスタデータ(requirements.md 1.7: 3件)" do
    it "seeds exactly info/warning/critical" do
      expect(described_class.pluck(:code)).to contain_exactly("info", "warning", "critical")
    end
  end
end
