require "rails_helper"

RSpec.describe DeviceStatus, type: :model do
  describe "associations" do
    it { expect(described_class.reflect_on_association(:devices).macro).to eq(:has_many) }
  end

  describe "マスタデータ(requirements.md 1.7: 3件)" do
    it "seeds exactly provisioning/online/offline" do
      expect(described_class.pluck(:code)).to contain_exactly("provisioning", "online", "offline")
    end
  end
end
