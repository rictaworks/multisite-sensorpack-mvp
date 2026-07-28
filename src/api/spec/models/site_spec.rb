require "rails_helper"

RSpec.describe Site, type: :model do
  let(:user) { User.create!(google_sub: "site-spec-user") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:user).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:devices).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:claim_codes).macro).to eq(:has_many) }
  end

  describe "validations" do
    it "requires a user" do
      site = described_class.new(name: "倉庫A")

      expect(site).not_to be_valid
      expect(site.errors[:user]).to be_present
    end

    it "requires a name" do
      site = described_class.new(user: user, name: "")

      expect(site).not_to be_valid
    end
  end

  describe "拠点名は自由入力ラベル(requirements.md 1.4)" do
    it "住所カラムを持たず、自由入力の名前のみで有効になる" do
      site = described_class.new(user: user, name: "倉庫A")

      expect(site).to be_valid
      expect(described_class.column_names).not_to include("address")
    end
  end
end
