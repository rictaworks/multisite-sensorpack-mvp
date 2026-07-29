require "rails_helper"

# requirements.md 1.3節: ログイン導線・クレームコード発行導線にreCAPTCHAを適用する。
#
# 検証の実体はGoogle reCAPTCHA siteverify APIであり、本サービスはその呼び出しと
# 環境ごとの分岐のみを担う。「設定漏れ(ConfigurationError)」と「検証失敗(false)」を
# 明確に区別することが本サービスの主眼である(.claude/rules/coding-style.md:
# フォールバックで握りつぶさない)。
RSpec.describe RecaptchaVerifier do
  describe ".verify(トークンが不正な場合)" do
    it "トークンが空なら検証失敗として扱う" do
      expect(described_class.verify(nil)).to be false
      expect(described_class.verify("")).to be false
      expect(described_class.verify("   ")).to be false
    end
  end

  describe ".verify(development/test環境)" do
    it "テスト用トークンと一致すれば通過する(ネットワークへ到達しない)" do
      expect(Net::HTTP).not_to receive(:start)

      expect(described_class.verify(described_class::TEST_SUCCESS_TOKEN)).to be true
    end

    it "テスト用トークン以外は通過しない" do
      expect(described_class.verify("some-other-token")).to be false
    end
  end

  describe ".verify(production環境)" do
    before { allow(Rails.env).to receive(:production?).and_return(true) }

    # 本番でテスト用トークンが通ってしまうと、reCAPTCHAを完全に迂回できてしまう。
    it "テスト用トークンは本番では一切通用せず、Googleへの検証に回される" do
      stub_siteverify(success: false)

      expect(described_class.verify(described_class::TEST_SUCCESS_TOKEN)).to be false
    end

    it "siteverifyがsuccess=trueを返せば通過する" do
      stub_siteverify(success: true)

      expect(described_class.verify("user-supplied-token")).to be true
    end

    it "siteverifyがsuccess=falseを返せば通過しない" do
      stub_siteverify(success: false)

      expect(described_class.verify("user-supplied-token")).to be false
    end

    it "RECAPTCHA_SECRET_KEYが未設定なら、検証失敗ではなくConfigurationErrorを送出する" do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("RECAPTCHA_SECRET_KEY").and_return(nil)

      expect { described_class.verify("user-supplied-token") }
        .to raise_error(described_class::ConfigurationError, /RECAPTCHA_SECRET_KEY/)
    end

    it "ネットワーク障害時はfail closedで通過させない(例外は握りつぶすがログに残す)" do
      stub_secret_key
      allow(Net::HTTP).to receive(:start).and_raise(Errno::ECONNREFUSED)
      expect(Rails.logger).to receive(:error).with(/reCAPTCHA/)

      expect(described_class.verify("user-supplied-token")).to be false
    end

    it "応答が壊れている(JSONとして解釈できない)場合もfail closedで通過させない" do
      stub_secret_key
      allow(Net::HTTP).to receive(:start).and_return(instance_double(Net::HTTPResponse, body: "<html>502</html>"))
      expect(Rails.logger).to receive(:error).with(/reCAPTCHA/)

      expect(described_class.verify("user-supplied-token")).to be false
    end

    it "Googleが応答しない場合に備えてタイムアウトを設定する(Pumaスレッドの長時間占有を防ぐ)" do
      stub_secret_key
      expect(Net::HTTP).to receive(:start).with(
        "www.google.com", 443,
        hash_including(use_ssl: true, open_timeout: kind_of(Integer), read_timeout: kind_of(Integer))
      ).and_return(instance_double(Net::HTTPResponse, body: { success: true }.to_json))

      expect(described_class.verify("user-supplied-token")).to be true
    end
  end

  def stub_secret_key
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("RECAPTCHA_SECRET_KEY").and_return("test-secret-key")
  end

  def stub_siteverify(success:)
    stub_secret_key
    allow(Net::HTTP).to receive(:start).and_return(
      instance_double(Net::HTTPResponse, body: { success: success }.to_json)
    )
  end
end
