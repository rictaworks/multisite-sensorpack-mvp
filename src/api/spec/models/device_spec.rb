require "rails_helper"

RSpec.describe Device, type: :model do
  let(:user) { User.create!(google_sub: "device-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:site).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:device_status).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:telemetry_readings).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:hourly_aggregates).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:thresholds).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:alerts).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:commands).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:automation_rule).macro).to eq(:has_one) }
  end

  describe "validations" do
    it "defaults to the provisioning status(requirements.md 6.1状態遷移図)" do
      device = described_class.create!(site: site, device_token_digest: "digest-1")

      expect(device.device_status.code).to eq("provisioning")
    end

    it "requires a unique device_token_digest" do
      described_class.create!(site: site, device_token_digest: "digest-2")
      duplicate = described_class.new(site: site, device_token_digest: "digest-2")

      expect(duplicate).not_to be_valid
    end

    it "requires expected_interval_sec to be a positive integer" do
      device = described_class.new(site: site, device_token_digest: "digest-3", expected_interval_sec: 0)

      expect(device).not_to be_valid
    end

    it "defaults expected_interval_sec to 60 seconds" do
      device = described_class.create!(site: site, device_token_digest: "digest-4")

      expect(device.expected_interval_sec).to eq(60)
    end
  end
end
