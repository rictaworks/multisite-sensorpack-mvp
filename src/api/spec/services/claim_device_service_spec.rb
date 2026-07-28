require "rails_helper"

# requirements.md 1.9 Dカテゴリ(デバイス登録)のうち、ESP32からのクレーム照合(claimDevice)に
# 関するケースをここで検証する。issueClaimCode(コード発行)側のケースは
# spec/requests/api/claim_codes_spec.rb を参照。
RSpec.describe ClaimDeviceService, type: :model do
  let(:user) { User.create!(google_sub: "claim-service-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:ip) { "203.0.113.10" }

  after { ClaimDeviceService::RateLimiter.reset_all! }

  def issue_code(expires_at: 15.minutes.from_now, fail_count: 0, used_at: nil)
    ClaimCode.create!(
      user: user,
      site: site,
      code: "CODE#{rand(1000..9999)}",
      expires_at: expires_at,
      fail_count: fail_count,
      used_at: used_at
    )
  end

  describe "正常系" do
    it "未使用・期限内のコードでdeviceを作成し、長寿命トークンを発行してコードを使用済みにする" do
      claim_code = issue_code

      result = described_class.new(code: claim_code.code, ip: ip).call

      expect(result.device).to be_persisted
      expect(result.device.site).to eq(site)
      expect(result.device.device_status.code).to eq("provisioning")
      expect(result.raw_token).to be_present
      expect(claim_code.reload.used_at).to be_present
    end
  end

  describe "存在しないコード" do
    it "claim_code_not_foundで401相当のエラーになる" do
      expect { described_class.new(code: "NOTREAL1", ip: ip).call }
        .to raise_error(ClaimDeviceService::InvalidCodeError) { |e| expect(e.error_code).to eq("claim_code_not_found") }
    end
  end

  describe "期限切れ(D: 期限切れ)" do
    it "claim_code_expiredで失敗し、fail_countが加算される" do
      claim_code = issue_code(expires_at: 1.minute.ago)

      expect { described_class.new(code: claim_code.code, ip: ip).call }
        .to raise_error(ClaimDeviceService::InvalidCodeError) { |e| expect(e.error_code).to eq("claim_code_expired") }

      expect(claim_code.reload.fail_count).to eq(1)
    end
  end

  describe "使用済み再利用(D: 使用済み再利用)" do
    it "claim_code_usedで失敗し、新しいdeviceは作られない" do
      claim_code = issue_code(used_at: 1.minute.ago)

      expect {
        expect { described_class.new(code: claim_code.code, ip: ip).call }
          .to raise_error(ClaimDeviceService::InvalidCodeError) { |e| expect(e.error_code).to eq("claim_code_used") }
      }.not_to change(Device, :count)
    end
  end

  describe "誤コード5回失効(D: 誤コード5回失効・総当たり対策)" do
    it "同一コードへの失敗が累計5回に達すると、以後はclaim_code_lockedとして即時失効する" do
      claim_code = issue_code(expires_at: 1.minute.ago)

      5.times do
        expect { described_class.new(code: claim_code.code, ip: ip).call }
          .to raise_error(ClaimDeviceService::InvalidCodeError) { |e| expect(e.error_code).to eq("claim_code_expired") }
      end
      expect(claim_code.reload.fail_count).to eq(5)
      expect(claim_code.exhausted?).to be true

      expect { described_class.new(code: claim_code.code, ip: ip).call }
        .to raise_error(ClaimDeviceService::InvalidCodeError) { |e| expect(e.error_code).to eq("claim_code_locked") }
      # ロック後はfail_countをこれ以上加算しない
      expect(claim_code.reload.fail_count).to eq(5)
    end
  end

  describe "同時クレーム(D: 同時クレーム)" do
    it "同じコードに対する二重成立を許さず、1台のみdeviceが作成される" do
      claim_code = issue_code

      expect {
        described_class.new(code: claim_code.code, ip: ip).call
        expect { described_class.new(code: claim_code.code, ip: "203.0.113.11").call }
          .to raise_error(ClaimDeviceService::InvalidCodeError) { |e| expect(e.error_code).to eq("claim_code_used") }
      }.to change(Device, :count).by(1)
    end
  end

  describe "削除後再登録(D: 削除後再登録)" do
    it "論理削除済みデバイスがあっても、新しいクレームコードで新デバイスとして登録される" do
      old_claim_code = issue_code
      old_result = described_class.new(code: old_claim_code.code, ip: ip).call
      old_result.device.update!(deleted: true)

      new_claim_code = issue_code
      new_result = described_class.new(code: new_claim_code.code, ip: ip).call

      expect(new_result.device.id).not_to eq(old_result.device.id)
      expect(old_result.device.reload.deleted).to be true
      expect(new_result.device.deleted).to be false
    end
  end

  describe "IP単位のレート制限" do
    it "同一IPからの試行が上限を超えるとrate_limitedで拒否する" do
      limit = ClaimDeviceService::IP_LIMIT

      limit.times { described_class.new(code: "NOTREAL1", ip: ip).call rescue nil }

      expect { described_class.new(code: "NOTREAL1", ip: ip).call }
        .to raise_error(ClaimDeviceService::RateLimitedError)
    end
  end
end
