require "rails_helper"

RSpec.describe GoogleIdTokenVerifier do
  describe ".verify_sub" do
    context "IDトークンが有効な場合" do
      it "Googleのopaqueなsub値を返す" do
        allow(Google::Auth::IDTokens).to receive(:verify_oidc).and_return({ "sub" => "google-sub-abc123" })

        expect(described_class.verify_sub("valid.jwt.token")).to eq("google-sub-abc123")
      end

      it "検証にはconfig.x.google_oauth_client_idをaudとして渡す" do
        allow(Rails.application.config.x).to receive(:google_oauth_client_id).and_return("configured-client-id")
        expect(Google::Auth::IDTokens).to receive(:verify_oidc)
          .with("valid.jwt.token", aud: "configured-client-id")
          .and_return({ "sub" => "google-sub-abc123" })

        described_class.verify_sub("valid.jwt.token")
      end
    end

    context "IDトークンが空の場合" do
      it "VerificationFailedを送出する" do
        expect { described_class.verify_sub("") }.to raise_error(GoogleIdTokenVerifier::VerificationFailed)
      end

      it "nilの場合もVerificationFailedを送出する" do
        expect { described_class.verify_sub(nil) }.to raise_error(GoogleIdTokenVerifier::VerificationFailed)
      end
    end

    context "Google側の検証が失敗する場合" do
      it "Google::Auth::IDTokens::VerificationErrorをVerificationFailedに変換する" do
        allow(Google::Auth::IDTokens).to receive(:verify_oidc)
          .and_raise(Google::Auth::IDTokens::VerificationError, "signature invalid")

        expect { described_class.verify_sub("tampered.jwt.token") }
          .to raise_error(GoogleIdTokenVerifier::VerificationFailed)
      end
    end

    context "sub claimが含まれないペイロードの場合" do
      it "VerificationFailedを送出する(想定外の状態をフォールバックせず明示的に例外化)" do
        allow(Google::Auth::IDTokens).to receive(:verify_oidc).and_return({ "email" => "user@example.com" })

        expect { described_class.verify_sub("valid.jwt.token") }
          .to raise_error(GoogleIdTokenVerifier::VerificationFailed)
      end
    end
  end
end
