require "rails_helper"

# requirements.md 1.6 F6.5: 7日超の生データを日次で1時間粒度に集約する。
RSpec.describe HourlyAggregationJob, type: :job do
  include ActiveSupport::Testing::TimeHelpers

  let(:user) { User.create!(google_sub: "aggregation-job-user-#{SecureRandom.hex(4)}") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: SecureRandom.hex(20)) }

  after { travel_back }

  it "完了済みの時間バケットごとに温度・湿度それぞれの min/max/avg を集約する" do
    now = Time.zone.local(2026, 7, 28, 12, 0, 0)
    travel_to(now) do
      hour = (now - 8.days).beginning_of_hour
      TelemetryReading.create!(device: device, seq: 1, temperature_c: 18.0, humidity_pct: 40.0, recorded_at: hour + 5.minutes)
      TelemetryReading.create!(device: device, seq: 2, temperature_c: 22.0, humidity_pct: 50.0, recorded_at: hour + 35.minutes)

      described_class.new.perform

      temp_agg = HourlyAggregate.find_by!(device: device, sensor_type_code: "temperature", hour_bucket: hour)
      expect(temp_agg.min_value.to_f).to eq(18.0)
      expect(temp_agg.max_value.to_f).to eq(22.0)
      expect(temp_agg.avg_value.to_f).to eq(20.0)

      humidity_agg = HourlyAggregate.find_by!(device: device, sensor_type_code: "humidity", hour_bucket: hour)
      expect(humidity_agg.min_value.to_f).to eq(40.0)
      expect(humidity_agg.max_value.to_f).to eq(50.0)
      expect(humidity_agg.avg_value.to_f).to eq(45.0)
    end
  end

  it "現在進行中(未完了)の時間バケットは集約しない" do
    now = Time.zone.local(2026, 7, 28, 12, 30, 0)
    travel_to(now) do
      TelemetryReading.create!(device: device, seq: 1, temperature_c: 25.0, humidity_pct: 60.0, recorded_at: now - 5.minutes)

      described_class.new.perform

      expect(HourlyAggregate.where(device: device, hour_bucket: now.beginning_of_hour)).to be_empty
    end
  end

  it "再実行しても既存の集約バケットを重複作成しない(冪等)" do
    now = Time.zone.local(2026, 7, 28, 12, 0, 0)
    travel_to(now) do
      hour = (now - 8.days).beginning_of_hour
      TelemetryReading.create!(device: device, seq: 1, temperature_c: 18.0, humidity_pct: 40.0, recorded_at: hour + 5.minutes)

      described_class.new.perform
      described_class.new.perform

      expect(HourlyAggregate.where(device: device, sensor_type_code: "temperature", hour_bucket: hour).count).to eq(1)
    end
  end
end
