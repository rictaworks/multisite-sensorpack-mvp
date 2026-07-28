require "rails_helper"

RSpec.describe AiSummary, type: :model do
  let(:user) { User.create!(google_sub: "summary-spec-user") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:user).macro).to eq(:belongs_to) }
  end

  describe "validations(requirements.md F7)" do
    it "rejects a duplicate quota_date for the same user" do
      described_class.create!(user: user, quota_date: Date.current, summary_text: "サマリー")
      duplicate = described_class.new(user: user, quota_date: Date.current, summary_text: "別サマリー")

      expect(duplicate).not_to be_valid
    end

    it "requires summary_text" do
      summary = described_class.new(user: user, quota_date: Date.current, summary_text: "")

      expect(summary).not_to be_valid
    end
  end
end
