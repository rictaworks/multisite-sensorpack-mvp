require "rails_helper"

RSpec.describe Threshold, type: :model do
  let(:user) { User.create!(google_sub: "threshold-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "threshold-digest") }
  let(:sensor_type) { SensorType.find_by!(code: "temperature") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:device).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:sensor_type).macro).to eq(:belongs_to) }
  end

  describe "validations(requirements.md F3)" do
    it "accepts only upper/lower directions" do
      threshold = described_class.new(device: device, sensor_type: sensor_type, direction: "diagonal", trigger_value: 30)

      expect(threshold).not_to be_valid
    end

    it "defaults breach_state to NORMAL" do
      threshold = described_class.create!(device: device, sensor_type: sensor_type, direction: "upper", trigger_value: 30)

      expect(threshold.breach_state).to eq("NORMAL")
    end

    it "rejects a duplicate device/sensor_type/direction combination" do
      described_class.create!(device: device, sensor_type: sensor_type, direction: "upper", trigger_value: 30)
      duplicate = described_class.new(device: device, sensor_type: sensor_type, direction: "upper", trigger_value: 35)

      expect(duplicate).not_to be_valid
    end
  end

  # requirements.md F3 手順3: 上限は value > 閾値、下限は value < 閾値。境界値ちょうどは正常(breachではない)。
  describe "#breach_condition?(requirements.md 1.9 Aカテゴリ: 値位置)" do
    it "upper: exceeds strictly above the trigger" do
      threshold = described_class.new(direction: "upper", trigger_value: 30)

      expect(threshold.breach_condition?(30.1)).to be(true)
    end

    it "upper: exactly at the boundary is normal(not breach)" do
      threshold = described_class.new(direction: "upper", trigger_value: 30)

      expect(threshold.breach_condition?(30)).to be(false)
    end

    it "upper: below the trigger is normal" do
      threshold = described_class.new(direction: "upper", trigger_value: 30)

      expect(threshold.breach_condition?(29.9)).to be(false)
    end

    it "lower: exceeds strictly below the trigger" do
      threshold = described_class.new(direction: "lower", trigger_value: 10)

      expect(threshold.breach_condition?(9.9)).to be(true)
    end

    it "lower: exactly at the boundary is normal(not breach)" do
      threshold = described_class.new(direction: "lower", trigger_value: 10)

      expect(threshold.breach_condition?(10)).to be(false)
    end
  end

  # requirements.md F3 手順4: 上限は「発報閾値-デッドバンド」以下、下限は「発報閾値+デッドバンド」以上で解除。
  describe "#release_condition?" do
    it "upper: at or below trigger-deadband releases" do
      threshold = described_class.new(direction: "upper", trigger_value: 30, deadband: 1.0)

      expect(threshold.release_condition?(29.0)).to be(true)
      expect(threshold.release_condition?(29.1)).to be(false)
    end

    it "lower: at or above trigger+deadband releases" do
      threshold = described_class.new(direction: "lower", trigger_value: 10, deadband: 3.0)

      expect(threshold.release_condition?(13.0)).to be(true)
      expect(threshold.release_condition?(12.9)).to be(false)
    end
  end

  # requirements.md F3 手順3-4 / 1.9 A・Bカテゴリ: 連続3回のヒステリシス遷移。
  describe "#register_reading!(ヒステリシス状態機械)" do
    def build_threshold(direction: "upper", trigger_value: 30, deadband: 1.0)
      described_class.create!(device: device, sensor_type: sensor_type, direction: direction,
                               trigger_value: trigger_value, deadband: deadband)
    end

    it "does not breach on a single spike(1回目)" do
      threshold = build_threshold

      result = threshold.register_reading!(31)

      expect(result).to be_nil
      expect(threshold.reload.breach_state).to eq("NORMAL")
      expect(threshold.consecutive_count).to eq(1)
    end

    it "does not breach after two consecutive breaches(2回目)" do
      threshold = build_threshold
      threshold.register_reading!(31)

      result = threshold.register_reading!(31)

      expect(result).to be_nil
      expect(threshold.reload.breach_state).to eq("NORMAL")
      expect(threshold.consecutive_count).to eq(2)
    end

    it "breaches and opens on the third consecutive breach(3回目)" do
      threshold = build_threshold
      threshold.register_reading!(31)
      threshold.register_reading!(31)

      result = threshold.register_reading!(31)

      expect(result).to eq(:breached)
      expect(threshold.reload.breach_state).to eq("BREACHED")
      expect(threshold.consecutive_count).to eq(0)
    end

    it "resets the consecutive counter on a non-breaching reading(単発スパイク)" do
      threshold = build_threshold
      threshold.register_reading!(31)
      threshold.register_reading!(31)

      result = threshold.register_reading!(25)

      expect(result).to be_nil
      expect(threshold.reload.breach_state).to eq("NORMAL")
      expect(threshold.consecutive_count).to eq(0)
    end

    it "does not clear on a value inside the deadband(往復,解除帯未満)" do
      threshold = build_threshold
      threshold.update!(breach_state: "BREACHED")

      result = threshold.register_reading!(29.5)

      expect(result).to be_nil
      expect(threshold.reload.breach_state).to eq("BREACHED")
      expect(threshold.consecutive_count).to eq(0)
    end

    it "releases and auto-closes on the third consecutive release reading" do
      threshold = build_threshold
      threshold.update!(breach_state: "BREACHED")
      threshold.register_reading!(29.0)
      threshold.register_reading!(29.0)

      result = threshold.register_reading!(29.0)

      expect(result).to eq(:released)
      expect(threshold.reload.breach_state).to eq("NORMAL")
      expect(threshold.consecutive_count).to eq(0)
    end

    it "resets the release counter when a reading returns to the deadband(デッドバンド内往復)" do
      threshold = build_threshold
      threshold.update!(breach_state: "BREACHED")
      threshold.register_reading!(29.0)
      threshold.register_reading!(29.0)

      result = threshold.register_reading!(29.5)

      expect(result).to be_nil
      expect(threshold.reload.breach_state).to eq("BREACHED")
      expect(threshold.consecutive_count).to eq(0)
    end

    it "supports the lower direction symmetrically" do
      threshold = build_threshold(direction: "lower", trigger_value: 10, deadband: 3.0)
      threshold.register_reading!(9)
      threshold.register_reading!(9)

      result = threshold.register_reading!(9)

      expect(result).to eq(:breached)
      expect(threshold.reload.breach_state).to eq("BREACHED")
    end
  end
end
