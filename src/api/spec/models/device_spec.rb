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

  # requirements.md F4 detect_offline: 現在時刻-last_seen_at > 期待送信間隔x3+猶予30秒
  describe "#offline_deadline_at / #offline_due?(requirements.md 1.9 Cカテゴリ境界値)" do
    it "returns nil deadline and false due? when telemetry has never been received" do
      device = described_class.create!(site: site, device_token_digest: "digest-5")

      expect(device.offline_deadline_at).to be_nil
      expect(device.offline_due?(Time.current)).to be(false)
    end

    it "computes the deadline as last_seen_at + interval*3 + 30s grace" do
      last_seen = Time.zone.local(2026, 7, 28, 12, 0, 0)
      device = described_class.create!(
        site: site, device_token_digest: "digest-6", expected_interval_sec: 60
      )
      device.update_column(:last_seen_at, last_seen)

      # 期待送信間隔60秒x3 + 猶予30秒 = 210秒
      expect(device.reload.offline_deadline_at).to eq(last_seen + 210.seconds)
    end

    it "is not due exactly at the boundary(境界ちょうどは正常)" do
      last_seen = Time.zone.local(2026, 7, 28, 12, 0, 0)
      device = described_class.create!(
        site: site, device_token_digest: "digest-7", expected_interval_sec: 60
      )
      device.update_column(:last_seen_at, last_seen)

      expect(device.reload.offline_due?(last_seen + 210.seconds)).to be(false)
    end

    it "is due one second past the boundary(超過)" do
      last_seen = Time.zone.local(2026, 7, 28, 12, 0, 0)
      device = described_class.create!(
        site: site, device_token_digest: "digest-8", expected_interval_sec: 60
      )
      device.update_column(:last_seen_at, last_seen)

      expect(device.reload.offline_due?(last_seen + 211.seconds)).to be(true)
    end
  end

  describe "#mark_offline! / #mark_online!(requirements.md F4 手順4-5)" do
    it "mark_offline! transitions to offline and opens exactly one offline alert" do
      device = described_class.create!(site: site, device_token_digest: "digest-9")
      device.update_column(:status_code, Device::STATUS_ONLINE)

      device.mark_offline!
      device.mark_offline!

      device.reload
      expect(device.status_code).to eq(Device::STATUS_OFFLINE)
      expect(device.alerts.where(alert_type_code: "offline", status: "open").count).to eq(1)
    end

    it "mark_online! transitions to online and auto-closes the open offline alert" do
      device = described_class.create!(site: site, device_token_digest: "digest-10")
      device.update_column(:status_code, Device::STATUS_ONLINE)
      device.mark_offline!

      device.mark_online!

      device.reload
      expect(device.status_code).to eq(Device::STATUS_ONLINE)
      expect(device.alerts.where(alert_type_code: "offline", status: "open")).to be_empty
      expect(device.alerts.where(alert_type_code: "offline", status: "closed").count).to eq(1)
    end
  end

  describe ".provision_for_site!(requirements.md F1手順4)" do
    it "provisioning状態のdeviceを作成し、生トークンとダイジェストが一致しないハッシュ値で保存する" do
      device, raw_token = described_class.provision_for_site!(site)

      expect(device).to be_persisted
      expect(device.site).to eq(site)
      expect(device.device_status.code).to eq("provisioning")
      expect(raw_token).to be_present
      expect(device.device_token_digest).to eq(described_class.digest_for_token(raw_token))
      expect(device.device_token_digest).not_to eq(raw_token)
    end

    it "呼び出すたびに異なるトークン・deviceを発行する(claim_code再発行での新規デバイス扱い)" do
      _device1, token1 = described_class.provision_for_site!(site)
      _device2, token2 = described_class.provision_for_site!(site)

      expect(token1).not_to eq(token2)
    end
  end
end
