require "rails_helper"

RSpec.describe AlertType, type: :model do
  describe "associations" do
    it { expect(described_class.reflect_on_association(:alerts).macro).to eq(:has_many) }
  end

  describe "マスタデータ(requirements.md 1.7: 3件)" do
    it "seeds exactly the three alert types" do
      expect(described_class.pluck(:code)).to contain_exactly(
        "threshold_upper_breach", "threshold_lower_breach", "offline"
      )
    end
  end
end
