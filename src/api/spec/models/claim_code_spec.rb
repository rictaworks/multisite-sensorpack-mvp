require "rails_helper"

RSpec.describe ClaimCode, type: :model do
  let(:user) { User.create!(google_sub: "claim-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:user).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:site).macro).to eq(:belongs_to) }
  end

  describe "validations" do
    it "requires a unique code" do
      described_class.create!(user: user, site: site, code: "ABCD1234", expires_at: 15.minutes.from_now)
      duplicate = described_class.new(user: user, site: site, code: "ABCD1234", expires_at: 15.minutes.from_now)

      expect(duplicate).not_to be_valid
    end

    it "defaults fail_count to 0(requirements.md F1: 5回で失効)" do
      claim_code = described_class.create!(user: user, site: site, code: "EFGH5678", expires_at: 15.minutes.from_now)

      expect(claim_code.fail_count).to eq(0)
    end

    it "requires expires_at(requirements.md F1: 発行+15分)" do
      claim_code = described_class.new(user: user, site: site, code: "IJKL9012")

      expect(claim_code).not_to be_valid
    end
  end
end
