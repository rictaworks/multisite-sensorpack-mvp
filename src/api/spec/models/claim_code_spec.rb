require "rails_helper"

RSpec.describe ClaimCode, type: :model do
  let(:user) { User.create!(google_sub: "claim-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:user).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:site).macro).to eq(:belongs_to) }
  end

  describe "validations" do
    it "requires a unique code" do
      described_class.create!(user: user, site: site, code: "ABCD1234", expires_at: 15.minutes.from_now)
      duplicate = described_class.new(user: user, site: site, code: "ABCD1234", expires_at: 15.minutes.from_now)

      expect(duplicate).not_to be_valid
    end

    it "defaults fail_count to 0(requirements.md F1: 5回で失効)" do
      claim_code = described_class.create!(user: user, site: site, code: "EFGH5678", expires_at: 15.minutes.from_now)

      expect(claim_code.fail_count).to eq(0)
    end

    it "requires expires_at(requirements.md F1: 発行+15分)" do
      claim_code = described_class.new(user: user, site: site, code: "IJKL9012")

      expect(claim_code).not_to be_valid
    end

    it "8桁の英数字以外のコードは無効" do
      claim_code = described_class.new(user: user, site: site, code: "short", expires_at: 15.minutes.from_now)

      expect(claim_code).not_to be_valid
    end
  end

  describe ".issue!(requirements.md F1手順2)" do
    it "8桁英数字のコードを有効期限15分で発行する" do
      claim_code = described_class.issue!(user: user, site: site)

      expect(claim_code.code).to match(/\A[A-Z0-9]{8}\z/)
      expect(claim_code.expires_at).to be_within(1.second).of(15.minutes.from_now)
      expect(claim_code.fail_count).to eq(0)
    end

    it "既存コードと重複しない一意なコードを発行する" do
      first = described_class.issue!(user: user, site: site)
      second = described_class.issue!(user: user, site: site)

      expect(first.code).not_to eq(second.code)
    end
  end

  # クレームコードは15分間有効な秘密情報であり、これを推測できると他人のデバイスとして
  # クレームを成立させられる(requirements.md F1手順3-6)。デバイストークン(Device.provision_for_site!)
  # と同様、生成には必ずCSPRNGを使う(.claude/OWASP10.md A02: 暗号化の失敗)。
  describe ".generate_unique_code の乱数源" do
    it "暗号学的に安全な乱数(SecureRandom)から生成する" do
      expect(SecureRandom).to receive(:random_number).at_least(:once).and_call_original

      described_class.generate_unique_code
    end

    it "Kernel#srandで再現できない(予測可能な既定RNGを使っていない)" do
      srand(20260729)
      first = described_class.generate_unique_code
      srand(20260729)
      second = described_class.generate_unique_code

      expect(first).not_to eq(second)
    end
  end

  describe "#usable?/#expired?/#used?/#exhausted?" do
    it "未使用・期限内・失敗5回未満はusable" do
      claim_code = described_class.issue!(user: user, site: site)

      expect(claim_code.usable?).to be true
    end

    it "期限切れはusableでない" do
      claim_code = described_class.create!(user: user, site: site, code: "EXPR0001", expires_at: 1.minute.ago)

      expect(claim_code.expired?).to be true
      expect(claim_code.usable?).to be false
    end

    it "使用済みはusableでない" do
      claim_code = described_class.create!(user: user, site: site, code: "USED0001", expires_at: 15.minutes.from_now, used_at: Time.current)

      expect(claim_code.used?).to be true
      expect(claim_code.usable?).to be false
    end

    it "fail_countが5(MAX_FAIL_COUNT)に達するとexhausted(総当たり対策)" do
      claim_code = described_class.create!(user: user, site: site, code: "FAIL0001", expires_at: 15.minutes.from_now, fail_count: 5)

      expect(claim_code.exhausted?).to be true
      expect(claim_code.usable?).to be false
    end
  end

  describe "#register_failure!/#mark_used!" do
    it "register_failure!はfail_countを1加算する" do
      claim_code = described_class.issue!(user: user, site: site)

      expect { claim_code.register_failure! }.to change { claim_code.reload.fail_count }.by(1)
    end

    it "mark_used!はused_atを現在時刻にする" do
      claim_code = described_class.issue!(user: user, site: site)

      claim_code.mark_used!

      expect(claim_code.reload.used_at).to be_present
    end
  end
end
