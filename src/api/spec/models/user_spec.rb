require "rails_helper"

RSpec.describe User, type: :model do
  describe "associations" do
    it { expect(described_class.reflect_on_association(:sites).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:claim_codes).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:ai_summaries).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:ai_quota_usages).macro).to eq(:has_many) }
  end

  describe "validations" do
    it "requires google_sub" do
      user = described_class.new(google_sub: nil)

      expect(user).not_to be_valid
      expect(user.errors[:google_sub]).to be_present
    end

    it "requires google_sub to be unique" do
      described_class.create!(google_sub: "user-spec-sub-1")
      duplicate = described_class.new(google_sub: "user-spec-sub-1")

      expect(duplicate).not_to be_valid
    end
  end

  describe "個人情報の非保持(requirements.md 1.4)" do
    it "google_subのみ保持し、メールアドレス等のカラムを持たない" do
      expect(described_class.column_names).not_to include("email")
      expect(described_class.column_names).to match_array(%w[id google_sub created_at updated_at])
    end
  end
end
