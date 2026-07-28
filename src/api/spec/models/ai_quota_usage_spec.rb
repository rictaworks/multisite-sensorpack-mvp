require "rails_helper"

RSpec.describe AiQuotaUsage, type: :model do
  let(:user) { User.create!(google_sub: "quota-spec-user") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:user).macro).to eq(:belongs_to) }
  end

  describe "validations(requirements.md F7: quota_dateはuser_idと複合UK)" do
    it "rejects a duplicate quota_date for the same user" do
      described_class.create!(user: user, quota_date: Date.current, consumed_at: Time.current)
      duplicate = described_class.new(user: user, quota_date: Date.current, consumed_at: Time.current)

      expect(duplicate).not_to be_valid
    end
  end
end
