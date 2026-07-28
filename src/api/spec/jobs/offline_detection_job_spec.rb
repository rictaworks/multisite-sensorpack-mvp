require "rails_helper"

# requirements.md 1.6 F4 detect_offline / 1.9 テスト計画 Cカテゴリ(オフライン検知・6ケース)
RSpec.describe OfflineDetectionJob, type: :job do
  include ActiveSupport::Testing::TimeHelpers

  let(:user) { User.create!(google_sub: "offline-job-user-#{SecureRandom.hex(4)}") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }

  after { travel_back }

  # last_seen_at・status_codeをバリデーションを経由せず直接設定する。
  # (オフライン検知ジョブが扱うのは既に存在するデバイスの経過時間であり、
  #  「登録直後はprovisioning」というデフォルト挙動そのものは device_spec.rb の責務)
  def create_device(status:, last_seen_at:, expected_interval_sec: 60)
    device = Device.create!(
      site: site,
      device_token_digest: "offline-job-#{SecureRandom.hex(8)}",
      expected_interval_sec: expected_interval_sec
    )
    device.update_column(:status_code, status)
    device.update_column(:last_seen_at, last_seen_at)
    device.reload
  end

  describe "requirements.md 1.9 Cカテゴリ: オフライン検知の境界値" do
    it "未達: 経過時間が閾値(間隔x3+猶予30秒)に届いていなければonlineのまま" do
      now = Time.zone.local(2026, 7, 28, 12, 0, 0)
      travel_to(now) do
        # 閾値 = 60*3+30 = 210秒。200秒しか経過していないので未達。
        device = create_device(status: Device::STATUS_ONLINE, last_seen_at: now - 200.seconds, expected_interval_sec: 60)

        described_class.new.perform

        expect(device.reload.status_code).to eq(Device::STATUS_ONLINE)
        expect(device.alerts.where(alert_type_code: "offline")).to be_empty
      end
    end

    it "境界ちょうど: 経過時間が閾値とちょうど一致する場合は正常(オフラインにしない)" do
      now = Time.zone.local(2026, 7, 28, 12, 0, 0)
      travel_to(now) do
        device = create_device(status: Device::STATUS_ONLINE, last_seen_at: now - 210.seconds, expected_interval_sec: 60)

        described_class.new.perform

        expect(device.reload.status_code).to eq(Device::STATUS_ONLINE)
        expect(device.alerts.where(alert_type_code: "offline")).to be_empty
      end
    end

    it "超過: 閾値を1秒でも超えたらオフライン判定し、オフラインアラートをopenする" do
      now = Time.zone.local(2026, 7, 28, 12, 0, 0)
      travel_to(now) do
        device = create_device(status: Device::STATUS_ONLINE, last_seen_at: now - 211.seconds, expected_interval_sec: 60)

        described_class.new.perform

        device.reload
        expect(device.status_code).to eq(Device::STATUS_OFFLINE)
        offline_alerts = device.alerts.where(alert_type_code: "offline", status: "open")
        expect(offline_alerts.count).to eq(1)
      end
    end

    it "超過を複数回検知しても重複したオフラインアラートを生成しない" do
      now = Time.zone.local(2026, 7, 28, 12, 0, 0)
      travel_to(now) do
        device = create_device(status: Device::STATUS_ONLINE, last_seen_at: now - 300.seconds, expected_interval_sec: 60)

        described_class.new.perform
        described_class.new.perform

        expect(device.alerts.where(alert_type_code: "offline", status: "open").count).to eq(1)
      end
    end

    it "復帰: mark_online!でonlineへ戻り、オフラインアラートが自動closeされる" do
      now = Time.zone.local(2026, 7, 28, 12, 0, 0)
      travel_to(now) do
        device = create_device(status: Device::STATUS_ONLINE, last_seen_at: now - 300.seconds, expected_interval_sec: 60)
        described_class.new.perform
        expect(device.reload.status_code).to eq(Device::STATUS_OFFLINE)

        device.mark_online!

        device.reload
        expect(device.status_code).to eq(Device::STATUS_ONLINE)
        expect(device.alerts.where(alert_type_code: "offline", status: "open")).to be_empty
        expect(device.alerts.where(alert_type_code: "offline", status: "closed").count).to eq(1)
      end
    end

    it "テレメトリ同時到達: 走査後・判定直前にテレメトリが到着した場合は誤発報しない" do
      now = Time.zone.local(2026, 7, 28, 12, 0, 0)
      travel_to(now) do
        device = create_device(status: Device::STATUS_ONLINE, last_seen_at: now - 300.seconds, expected_interval_sec: 60)

        # ジョブが対象デバイスを走査した後・per-deviceの再読込直前にテレメトリが到着し
        # last_seen_atが更新される状況を模擬する(requirements.md F4 手順3)。
        original_lock = Device.method(:lock)
        allow(Device).to receive(:lock) do
          Device.where(id: device.id).update_all(last_seen_at: Time.current)
          original_lock.call
        end

        described_class.new.perform

        expect(device.reload.status_code).to eq(Device::STATUS_ONLINE)
        expect(device.alerts.where(alert_type_code: "offline")).to be_empty
      end
    end

    it "登録直後(provisioning・テレメトリ未受信)のデバイスは判定対象外" do
      device = Device.create!(
        site: site,
        device_token_digest: "offline-job-provisioning-#{SecureRandom.hex(8)}"
      )
      expect(device.status_code).to eq(Device::STATUS_PROVISIONING)
      expect(device.last_seen_at).to be_nil

      expect { described_class.new.perform }.not_to raise_error

      expect(device.reload.status_code).to eq(Device::STATUS_PROVISIONING)
      expect(device.alerts.where(alert_type_code: "offline")).to be_empty
    end
  end
end
