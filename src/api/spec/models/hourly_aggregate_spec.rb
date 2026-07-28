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
end
