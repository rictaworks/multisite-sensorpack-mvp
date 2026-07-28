require "rails_helper"

RSpec.describe "マスタデータ投入(requirements.md 1.7 / Issue #6 受け入れ条件)" do
  it "seeds exactly 17 master rows across the 6 master tables" do
    expected_counts = {
      SensorType => 2,
      ActuatorType => 2,
      CommandType => 4,
      AlertType => 3,
      AlertSeverity => 3,
      DeviceStatus => 3
    }

    expected_counts.each do |klass, expected_count|
      expect(klass.count).to eq(expected_count)
    end

    expect(expected_counts.values.sum).to eq(17)
  end
end
