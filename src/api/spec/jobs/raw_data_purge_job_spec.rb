require "rails_helper"

# requirements.md 1.6 F6.5: 生データは14日で削除する(無料枠のストレージ節約)。
RSpec.describe RawDataPurgeJob, type: :job do
  include ActiveSupport::Testing::TimeHelpers

  let(:user) { User.create!(google_sub: "purge-job-user-#{SecureRandom.hex(4)}") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: SecureRandom.hex(20)) }

  after { travel_back }

  it "14日を超えた生データを削除し、14日以内のデータは残す" do
    now = Time.zone.local(2026, 7, 28, 12, 0, 0)
    travel_to(now) do
      old_reading = TelemetryReading.create!(device: device, seq: 1, temperature_c: 18.0, humidity_pct: 40.0, recorded_at: now - 15.days)
      recent_reading = TelemetryReading.create!(device: device, seq: 2, temperature_c: 20.0, humidity_pct: 45.0, recorded_at: now - 13.days)

      described_class.new.perform

      expect(TelemetryReading.exists?(old_reading.id)).to be false
      expect(TelemetryReading.exists?(recent_reading.id)).to be true
    end
  end

  it "境界ちょうど(14日)は削除しない" do
    now = Time.zone.local(2026, 7, 28, 12, 0, 0)
    travel_to(now) do
      boundary_reading = TelemetryReading.create!(device: device, seq: 1, temperature_c: 18.0, humidity_pct: 40.0, recorded_at: now - 14.days)

      described_class.new.perform

      expect(TelemetryReading.exists?(boundary_reading.id)).to be true
    end
  end
end
