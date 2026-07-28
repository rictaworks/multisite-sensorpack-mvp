require "rails_helper"

RSpec.describe TelemetryReading, type: :model do
  let(:user) { User.create!(google_sub: "telemetry-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "telemetry-digest") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:device).macro).to eq(:belongs_to) }
  end

  describe "validations(requirements.md F2: 値域チェック)" do
    it "rejects temperature outside -40..85" do
      reading = described_class.new(
        device: device, seq: 1, temperature_c: 90, humidity_pct: 50, recorded_at: Time.current
      )

      expect(reading).not_to be_valid
    end

    it "rejects humidity outside 0..100" do
      reading = described_class.new(
        device: device, seq: 1, temperature_c: 20, humidity_pct: 101, recorded_at: Time.current
      )

      expect(reading).not_to be_valid
    end

    it "rejects a duplicate seq for the same device(再送による二重計上防止)" do
      described_class.create!(device: device, seq: 1, temperature_c: 20, humidity_pct: 50, recorded_at: Time.current)
      duplicate = described_class.new(device: device, seq: 1, temperature_c: 21, humidity_pct: 51, recorded_at: Time.current)

      expect(duplicate).not_to be_valid
    end

    it "is valid within range" do
      reading = described_class.new(
        device: device, seq: 2, temperature_c: 25.5, humidity_pct: 60.2, recorded_at: Time.current
      )

      expect(reading).to be_valid
    end
  end
end
