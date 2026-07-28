require "rails_helper"

# requirements.md 1.6 F3 evaluate_thresholds / 1.9 A(閾値判定24ケース)・B(ヒステリシス遷移8ケース)。
# Threshold#register_reading!自体の状態機械は spec/models/threshold_spec.rb で検証済みのため、
# ここでは「デバイスに紐づく複数閾値をまとめて評価し、Alertのopen/自動closeまで正しく連動するか」
# (ThresholdEvaluationServiceの責務)に焦点を当てる。
RSpec.describe ThresholdEvaluationService, type: :model do
  let(:user) { User.create!(google_sub: "threshold-eval-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "threshold-eval-digest") }
  let(:temperature) { SensorType.find_by!(code: "temperature") }
  let(:humidity) { SensorType.find_by!(code: "humidity") }

  def next_seq
    @next_seq ||= 0
    @next_seq += 1
  end

  def create_reading(temperature_c:, humidity_pct:, seq: next_seq)
    device.telemetry_readings.create!(
      seq: seq, temperature_c: temperature_c, humidity_pct: humidity_pct, recorded_at: Time.current
    )
  end

  def evaluate!(reading)
    described_class.new(device: device, reading: reading).call
  end

  describe "上限閾値の発報(NORMAL -> BREACHED)" do
    it "連続3回超過でopenアラートを1件だけ生成する(単発では発報しない)" do
      threshold = Threshold.create!(device: device, sensor_type: temperature, direction: "upper",
                                     trigger_value: 30, deadband: 1.0)

      evaluate!(create_reading(temperature_c: 31, humidity_pct: 50))
      expect(threshold.reload.breach_state).to eq("NORMAL")
      expect(device.alerts.open).to be_empty

      evaluate!(create_reading(temperature_c: 31, humidity_pct: 50))
      expect(threshold.reload.breach_state).to eq("NORMAL")
      expect(device.alerts.open).to be_empty

      evaluate!(create_reading(temperature_c: 31, humidity_pct: 50))
      expect(threshold.reload.breach_state).to eq("BREACHED")
      expect(device.alerts.open.where(alert_type_code: "threshold_upper_breach").count).to eq(1)
    end

    it "境界値ちょうどは正常のため何回続いても発報しない" do
      threshold = Threshold.create!(device: device, sensor_type: temperature, direction: "upper",
                                     trigger_value: 30, deadband: 1.0)

      5.times { evaluate!(create_reading(temperature_c: 30, humidity_pct: 50)) }

      expect(threshold.reload.breach_state).to eq("NORMAL")
      expect(device.alerts.open).to be_empty
    end
  end

  describe "下限閾値の発報(NORMAL -> BREACHED)" do
    it "連続3回下回るとopenアラートを生成する" do
      threshold = Threshold.create!(device: device, sensor_type: humidity, direction: "lower",
                                     trigger_value: 20, deadband: 3.0)

      3.times { evaluate!(create_reading(temperature_c: 25, humidity_pct: 19)) }

      expect(threshold.reload.breach_state).to eq("BREACHED")
      expect(device.alerts.open.where(alert_type_code: "threshold_lower_breach").count).to eq(1)
    end
  end

  describe "解除(BREACHED -> NORMAL)" do
    it "連続3回解除条件成立でアラートを自動closeする" do
      threshold = Threshold.create!(device: device, sensor_type: temperature, direction: "upper",
                                     trigger_value: 30, deadband: 1.0, breach_state: "BREACHED")
      alert = device.alerts.create!(alert_type_code: "threshold_upper_breach", severity_code: "warning",
                                     status: "open", opened_at: Time.current)

      3.times { evaluate!(create_reading(temperature_c: 29.0, humidity_pct: 50)) }

      expect(threshold.reload.breach_state).to eq("NORMAL")
      expect(alert.reload.status).to eq("closed")
    end

    it "デッドバンド内往復(まだ解除帯に届かない)では連続回数がリセットされclose しない" do
      threshold = Threshold.create!(device: device, sensor_type: temperature, direction: "upper",
                                     trigger_value: 30, deadband: 1.0, breach_state: "BREACHED")
      alert = device.alerts.create!(alert_type_code: "threshold_upper_breach", severity_code: "warning",
                                     status: "open", opened_at: Time.current)

      2.times { evaluate!(create_reading(temperature_c: 29.0, humidity_pct: 50)) }
      evaluate!(create_reading(temperature_c: 29.5, humidity_pct: 50)) # デッドバンド内、解除帯ではない
      2.times { evaluate!(create_reading(temperature_c: 29.0, humidity_pct: 50)) }

      # リセットされているため、まだ2回分しか積み上がっておらずcloseしていない
      expect(threshold.reload.breach_state).to eq("BREACHED")
      expect(alert.reload.status).to eq("open")
    end

    it "BREACHED中は重複してアラートを生成しない(既存open流用)" do
      threshold = Threshold.create!(device: device, sensor_type: temperature, direction: "upper",
                                     trigger_value: 30, deadband: 1.0, breach_state: "BREACHED", consecutive_count: 2)
      existing = device.alerts.create!(alert_type_code: "threshold_upper_breach", severity_code: "warning",
                                        status: "open", opened_at: Time.current)

      # BREACHED状態でさらに超過が続いても、open_alert!が呼ばれることはない(release方向の評価のみ)ため
      # open件数は変化しない。
      evaluate!(create_reading(temperature_c: 31, humidity_pct: 50))

      expect(device.alerts.open.where(alert_type_code: "threshold_upper_breach")).to contain_exactly(existing)
    end
  end

  describe "閾値未設定メトリクスのスキップ(requirements.md F3 手順6)" do
    it "Thresholdレコードが存在しないメトリクスは判定されず、例外も発生しない" do
      # このdeviceにはThresholdを1件も作成していない(閾値未設定)。
      reading = create_reading(temperature_c: 80, humidity_pct: 95) # 極端だが値域内の値

      expect { evaluate!(reading) }.not_to raise_error
      expect(device.alerts.open).to be_empty
    end
  end

  describe "複数閾値の同時評価" do
    it "温度と湿度、双方向の閾値を独立して評価する" do
      upper_temp = Threshold.create!(device: device, sensor_type: temperature, direction: "upper",
                                      trigger_value: 30, deadband: 1.0)
      lower_humidity = Threshold.create!(device: device, sensor_type: humidity, direction: "lower",
                                          trigger_value: 20, deadband: 3.0)

      3.times { evaluate!(create_reading(temperature_c: 31, humidity_pct: 19)) }

      expect(upper_temp.reload.breach_state).to eq("BREACHED")
      expect(lower_humidity.reload.breach_state).to eq("BREACHED")
      expect(device.alerts.open.where(alert_type_code: "threshold_upper_breach").count).to eq(1)
      expect(device.alerts.open.where(alert_type_code: "threshold_lower_breach").count).to eq(1)
    end
  end
end
