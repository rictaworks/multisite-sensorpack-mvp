require "rails_helper"

RSpec.describe Alert, type: :model do
  let(:user) { User.create!(google_sub: "alert-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "alert-digest") }
  let(:alert_type) { AlertType.find_by!(code: "threshold_upper_breach") }
  let(:alert_severity) { AlertSeverity.find_by!(code: "warning") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:device).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:alert_type).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:alert_severity).macro).to eq(:belongs_to) }
  end

  describe "validations(requirements.md F8)" do
    it "defaults status to open" do
      alert = described_class.create!(
        device: device, alert_type: alert_type, alert_severity: alert_severity, opened_at: Time.current
      )

      expect(alert.status).to eq("open")
    end

    it "rejects an unknown status" do
      alert = described_class.new(
        device: device, alert_type: alert_type, alert_severity: alert_severity,
        opened_at: Time.current, status: "unknown"
      )

      expect(alert).not_to be_valid
    end
  end

  # requirements.md F4/クラス図 Alert#autoClose(): オフライン復帰・閾値解除による自動クローズ。
  describe "#auto_close!" do
    it "closes an open alert and stamps closed_at" do
      alert = described_class.create!(
        device: device, alert_type: alert_type, alert_severity: alert_severity, opened_at: Time.current
      )

      alert.auto_close!

      expect(alert.status).to eq("closed")
      expect(alert.closed_at).not_to be_nil
    end

    it "is idempotent when called on an already-closed alert" do
      alert = described_class.create!(
        device: device, alert_type: alert_type, alert_severity: alert_severity, opened_at: Time.current
      )
      alert.auto_close!
      first_closed_at = alert.closed_at

      alert.auto_close!

      expect(alert.reload.closed_at).to eq(first_closed_at)
    end
  end

  describe ".open scope" do
    it "returns only alerts with status open" do
      open_alert = described_class.create!(
        device: device, alert_type: alert_type, alert_severity: alert_severity, opened_at: Time.current
      )
      closed_alert = described_class.create!(
        device: device, alert_type: alert_type, alert_severity: alert_severity, opened_at: Time.current
      )
      closed_alert.update!(status: "closed", closed_at: Time.current)

      expect(described_class.open).to contain_exactly(open_alert)
    end
  end
end
