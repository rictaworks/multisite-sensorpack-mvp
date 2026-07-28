require "rails_helper"

# requirements.md 1.6 F7 `generate_daily_summary` / 1.9 Hカテゴリ(AIクォータ、6ケース)を検証する。
#
# JST03:00リセット(=JST現在時刻-3hの日付をクォータ日とする)・過去24h統計のFastAPI(internal-ai)
# 連携・データ不足時のクォータ不消費・複数ユーザー独立を、Issue #13のFastAPIをモックした
# フェイクのInternalAiClientで検証する(実ネットワーク呼び出しは行わない)。
RSpec.describe DailySummaryService do
  let(:user) { User.create!(google_sub: "daily-summary-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "daily-summary-spec-device", status_code: "online") }

  let(:fake_ai_client) { instance_double(DailySummaryService::InternalAiClient) }

  def create_reading(seq:, temperature_c:, humidity_pct:, recorded_at:)
    TelemetryReading.create!(
      device: device, seq: seq, temperature_c: temperature_c, humidity_pct: humidity_pct,
      recorded_at: recorded_at
    )
  end

  before do
    allow(fake_ai_client).to receive(:generate_summary).and_return("本日は気温・湿度ともに安定していました。")
  end

  def build_service(now:)
    described_class.new(user, ai_client: fake_ai_client, now: now)
  end

  describe ".quota_date_for(JST03:00リセット境界)" do
    it "JST 02:59:59はクォータ日が前日になる" do
      # UTC 2026-07-27 17:59:59 = JST 2026-07-28 02:59:59
      now = Time.utc(2026, 7, 27, 17, 59, 59)

      expect(described_class.quota_date_for(now)).to eq(Date.new(2026, 7, 27))
    end

    it "JST 03:00:00ちょうどはクォータ日が当日になる(リセット成立)" do
      # UTC 2026-07-27 18:00:00 = JST 2026-07-28 03:00:00
      now = Time.utc(2026, 7, 27, 18, 0, 0)

      expect(described_class.quota_date_for(now)).to eq(Date.new(2026, 7, 28))
    end
  end

  describe "H1: 初回成功" do
    it "統計・アラートを集計しFastAPI経由でサマリーを生成・保存し、クォータを消費する" do
      now = Time.utc(2026, 7, 28, 3, 0, 0) # JST 12:00
      create_reading(seq: 1, temperature_c: 20.0, humidity_pct: 50.0, recorded_at: now - 1.hour)
      create_reading(seq: 2, temperature_c: 30.0, humidity_pct: 60.0, recorded_at: now - 2.hours)

      summary = build_service(now: now).call

      expect(summary).to be_a(AiSummary)
      expect(summary.summary_text).to eq("本日は気温・湿度ともに安定していました。")
      expect(summary.data_sufficient?).to be(true)
      expect(fake_ai_client).to have_received(:generate_summary) do |stats:, alerts:|
        expect(stats[:temperature][:min]).to eq(20.0)
        expect(stats[:temperature][:max]).to eq(30.0)
        expect(alerts).to eq([])
      end
      expect(AiQuotaUsage.consumed?(user: user, quota_date: described_class.quota_date_for(now))).to be(true)
    end
  end

  describe "H2: 同日2回目は429相当(QuotaExceededError)" do
    it "同一クォータ日の2回目呼び出しは既存サマリーを添えて例外を送出し、FastAPIを再度呼ばない" do
      now = Time.utc(2026, 7, 28, 3, 0, 0)
      create_reading(seq: 1, temperature_c: 20.0, humidity_pct: 50.0, recorded_at: now - 1.hour)
      first_summary = build_service(now: now).call

      expect(fake_ai_client).to receive(:generate_summary).never

      expect do
        build_service(now: now + 1.hour).call
      end.to raise_error(DailySummaryService::QuotaExceededError) do |error|
        expect(error.existing_summary.id).to eq(first_summary.id)
      end
    end
  end

  describe "H3: JST03:00跨ぎは新しいクォータ日として許可される" do
    it "前日消費後、翌JST03:00以降は再度生成できる" do
      day1_now = Time.utc(2026, 7, 28, 3, 0, 0) # JST 2026-07-28 12:00
      create_reading(seq: 1, temperature_c: 20.0, humidity_pct: 50.0, recorded_at: day1_now - 1.hour)
      build_service(now: day1_now).call

      # UTC 2026-07-28 18:00:00 = JST 2026-07-29 03:00:00(翌日のリセット直後)
      day2_now = Time.utc(2026, 7, 28, 18, 0, 0)
      create_reading(seq: 2, temperature_c: 22.0, humidity_pct: 55.0, recorded_at: day2_now - 1.hour)

      expect { build_service(now: day2_now).call }.not_to raise_error
      expect(AiQuotaUsage.where(user_id: user.id).count).to eq(2)
    end
  end

  describe "H4: 管理者リセット" do
    it "AiQuotaUsage.reset_for!でクォータをリセットすると同一クォータ日でも再度生成できる" do
      now = Time.utc(2026, 7, 28, 3, 0, 0)
      create_reading(seq: 1, temperature_c: 20.0, humidity_pct: 50.0, recorded_at: now - 1.hour)
      build_service(now: now).call

      quota_date = described_class.quota_date_for(now)
      AiQuotaUsage.reset_for!(user: user, quota_date: quota_date)

      expect { build_service(now: now + 1.hour).call }.not_to raise_error
      expect(AiQuotaUsage.consumed?(user: user, quota_date: quota_date)).to be(true)
    end
  end

  describe "H5: データなし日はクォータを消費しない" do
    it "過去24hにテレメトリが無い場合、FastAPIを呼ばず定型文を返しクォータを消費しない" do
      now = Time.utc(2026, 7, 28, 3, 0, 0)

      summary = build_service(now: now).call

      expect(fake_ai_client).not_to have_received(:generate_summary)
      expect(summary.data_sufficient?).to be(false)
      expect(summary.summary_text).to eq(DailySummaryService::INSUFFICIENT_DATA_SUMMARY_TEXT)
      expect(AiQuotaUsage.consumed?(user: user, quota_date: described_class.quota_date_for(now))).to be(false)
    end

    it "データなし日の翌呼び出し(同日)はクォータ未消費のため再度データ収集を試みられる" do
      now = Time.utc(2026, 7, 28, 3, 0, 0)
      build_service(now: now).call

      create_reading(seq: 1, temperature_c: 25.0, humidity_pct: 45.0, recorded_at: now)
      summary = build_service(now: now + 1.hour).call

      expect(summary.data_sufficient?).to be(true)
      expect(summary.summary_text).to eq("本日は気温・湿度ともに安定していました。")
    end
  end

  describe "H6: 複数ユーザーは独立してクォータを消費する" do
    it "あるユーザーの消費が他ユーザーのクォータに影響しない" do
      other_user = User.create!(google_sub: "daily-summary-spec-other-user")
      other_site = Site.create!(user: other_user, name: "倉庫B")
      other_device = Device.create!(
        site: other_site, device_token_digest: "daily-summary-spec-other-device", status_code: "online"
      )
      now = Time.utc(2026, 7, 28, 3, 0, 0)
      create_reading(seq: 1, temperature_c: 20.0, humidity_pct: 50.0, recorded_at: now - 1.hour)
      TelemetryReading.create!(
        device: other_device, seq: 1, temperature_c: 21.0, humidity_pct: 51.0, recorded_at: now - 1.hour
      )

      build_service(now: now).call

      expect do
        described_class.new(other_user, ai_client: fake_ai_client, now: now).call
      end.not_to raise_error
      expect(AiQuotaUsage.consumed?(user: user, quota_date: described_class.quota_date_for(now))).to be(true)
      expect(AiQuotaUsage.consumed?(user: other_user, quota_date: described_class.quota_date_for(now))).to be(true)
    end
  end

  describe "テナント分離: 他ユーザーのテレメトリ・アラートを集計に含めない" do
    it "他ユーザー配下のデバイスのテレメトリは統計に混入しない" do
      other_user = User.create!(google_sub: "daily-summary-spec-tenant-other-user")
      other_site = Site.create!(user: other_user, name: "倉庫C")
      other_device = Device.create!(
        site: other_site, device_token_digest: "daily-summary-spec-tenant-other-device", status_code: "online"
      )
      now = Time.utc(2026, 7, 28, 3, 0, 0)
      TelemetryReading.create!(
        device: other_device, seq: 1, temperature_c: 40.0, humidity_pct: 90.0, recorded_at: now - 1.hour
      )

      summary = build_service(now: now).call

      expect(summary.data_sufficient?).to be(false)
      expect(fake_ai_client).not_to have_received(:generate_summary)
    end
  end
end
