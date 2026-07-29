require "rails_helper"

# Issue #53 A-5: ClaimDeviceService::RateLimiter のメモリ回収の検証。
#
# このレートリミッタはプロセス内メモリに試行履歴を保持する。ウィンドウを過ぎた履歴が
# 一度も回収されないと、攻撃者はIP(識別子)を変えながら未認証エンドポイント
# (POST /api/v1/devices/claim)を叩くだけでメモリを単調増加させられる(DoS経路)。
#
# レート制限そのものの振る舞い(何回で弾かれるか)は spec/services/claim_device_service_spec.rb
# および spec/requests/api/claim_codes_spec.rb が担保するため、ここでは
# 「保持しているエントリ数」という内部状態の増減を対象にする。
RSpec.describe ClaimDeviceService::RateLimiter do
  include ActiveSupport::Testing::TimeHelpers

  subject(:limiter) { described_class.new(scope: "spec", limit: 3, period: period) }

  let(:period) { 10.minutes }

  before { described_class.reset_all! }
  after { described_class.reset_all! }

  describe "レート制限の判定" do
    it "上限を超えるまではfalse、超えたらtrueを返す" do
      results = 5.times.map { limiter.exceeded?("203.0.113.1") }

      expect(results).to eq([ false, false, false, true, true ])
    end

    it "識別子(IP)ごとに独立してカウントする" do
      3.times { limiter.exceeded?("203.0.113.1") }

      expect(limiter.exceeded?("203.0.113.2")).to be(false)
    end

    it "scopeが異なれば同じ識別子でもカウントを共有しない" do
      3.times { limiter.exceeded?("203.0.113.1") }
      other_scope = described_class.new(scope: "spec-other", limit: 3, period: period)

      expect(other_scope.exceeded?("203.0.113.1")).to be(false)
    end

    it "ウィンドウを過ぎた試行は数に含めない" do
      4.times { limiter.exceeded?("203.0.113.1") }
      expect(limiter.exceeded?("203.0.113.1")).to be(true)

      travel_to(period.from_now + 1.second) do
        expect(limiter.exceeded?("203.0.113.1")).to be(false)
      end
    end
  end

  describe "メモリの回収" do
    # 「IPを変えながら叩き続けるとメモリが増え続ける」という当の攻撃を再現する。
    it "ウィンドウを過ぎたエントリを回収し、識別子を変え続けてもエントリ数が単調増加しない" do
      100.times { |i| limiter.exceeded?("203.0.113.#{i}") }
      expect(described_class.tracked_entry_count).to eq(100)

      # 十分に時間を進めれば、次のアクセスを機に古いエントリが回収される。
      travel_to(period.from_now + described_class::SWEEP_INTERVAL + 1.second) do
        limiter.exceeded?("198.51.100.1")

        expect(described_class.tracked_entry_count).to eq(1)
      end
    end

    it "まだ有効なウィンドウ内のエントリは回収しない(制限のすり抜けを起こさない)" do
      4.times { limiter.exceeded?("203.0.113.1") }

      # スイープが走る程度に時間を進めるが、ウィンドウ自体はまだ切れていない。
      travel_to(described_class::SWEEP_INTERVAL.from_now + 1.second) do
        expect(limiter.exceeded?("198.51.100.1")).to be(false)
        expect(limiter.exceeded?("203.0.113.1")).to be(true)
      end
    end

    it "スイープ間隔より短い間隔の連続アクセスでは全走査を行わない(ホットパスの負荷を増やさない)" do
      limiter.exceeded?("203.0.113.1")

      expect { 50.times { |i| limiter.exceeded?("203.0.113.#{i}") } }
        .to change { described_class.sweep_count }.by(0)
    end
  end
end
