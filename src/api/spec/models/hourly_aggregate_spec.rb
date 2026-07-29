require "rails_helper"

RSpec.describe HourlyAggregate, type: :model do
  let(:user) { User.create!(google_sub: "aggregate-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "aggregate-digest") }
  let(:sensor_type) { SensorType.find_by!(code: "temperature") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:device).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:sensor_type).macro).to eq(:belongs_to) }
  end

  describe "validations" do
    it "is valid with device/sensor_type/min/max/avg" do
      aggregate = described_class.new(
        device: device,
        sensor_type: sensor_type,
        hour_bucket: Time.current.beginning_of_hour,
        min_value: 20.0,
        max_value: 25.0,
        avg_value: 22.5
      )

      expect(aggregate).to be_valid
    end

    it "rejects a duplicate device/sensor_type/hour_bucket combination" do
      hour = Time.current.beginning_of_hour
      described_class.create!(
        device: device, sensor_type: sensor_type, hour_bucket: hour,
        min_value: 1, max_value: 2, avg_value: 1.5
      )
      duplicate = described_class.new(
        device: device, sensor_type: sensor_type, hour_bucket: hour,
        min_value: 1, max_value: 2, avg_value: 1.5
      )

      expect(duplicate).not_to be_valid
    end
  end

  # requirements.md 1.6 F6.5: 7日超の生データを日次で1時間粒度に集約する(min/max/avg)。
  describe ".aggregate_pending_hours!" do
    include ActiveSupport::Testing::TimeHelpers

    after { travel_back }

    it "指定時刻より前の完了済み時間バケットのみを集約し、作成件数を返す" do
      now = Time.zone.local(2026, 7, 28, 12, 30, 0)
      travel_to(now) do
        hour = (now - 8.days).beginning_of_hour
        TelemetryReading.create!(device: device, seq: 1, temperature_c: 18.0, humidity_pct: 40.0, recorded_at: hour + 5.minutes)
        TelemetryReading.create!(device: device, seq: 2, temperature_c: 22.0, humidity_pct: 50.0, recorded_at: hour + 40.minutes)
        # 未完了(現在時刻を含む)バケットは対象外
        TelemetryReading.create!(device: device, seq: 3, temperature_c: 30.0, humidity_pct: 90.0, recorded_at: now - 5.minutes)

        created = described_class.aggregate_pending_hours!(device: device, sensor_type_code: "temperature", before: now.beginning_of_hour)

        expect(created).to eq(1)
        agg = described_class.find_by!(device: device, sensor_type_code: "temperature", hour_bucket: hour)
        expect(agg.min_value.to_f).to eq(18.0)
        expect(agg.max_value.to_f).to eq(22.0)
        expect(agg.avg_value.to_f).to eq(20.0)
      end
    end

    it "未対応のsensor_type_codeを渡すとArgumentErrorを送出する(フォールバック禁止)" do
      expect do
        described_class.aggregate_pending_hours!(device: device, sensor_type_code: "co2", before: Time.current)
      end.to raise_error(ArgumentError)
    end
  end
end
