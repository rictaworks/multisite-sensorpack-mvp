require "rails_helper"

RSpec.describe "Auth session (Google login)", type: :request do
  let(:valid_payload) { { "sub" => "google-sub-user-1" } }

  describe "POST /auth/session" do
    context "有効なGoogle IDトークンとreCAPTCHAトークンが送られた場合" do
      before do
        allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return("google-sub-user-1")
      end

      it "200を返し、内部の不透明なユーザーIDを含むレスポンスを返す" do
        post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }

        expect(response).to have_http_status(:ok)
        body = JSON.parse(response.body)
        expect(body["user"]).to include("id", "createdAt")
        expect(body["user"]["id"]).not_to eq("google-sub-user-1")
      end

      it "httpOnlyのsession_id cookieを発行する" do
        post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }

        set_cookie = response.headers["Set-Cookie"]
        expect(set_cookie).to include("session_id")
        expect(set_cookie.downcase).to include("httponly")
      end

      it "新規ユーザーの場合、google_subのみを保持したUserレコードを作成する(メールアドレス等は保存しない)" do
        expect do
          post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }
        end.to change(User, :count).by(1)

        user = User.last
        expect(user.google_sub).to eq("google-sub-user-1")
        expect(user.attributes.keys).to match_array(%w[id google_sub created_at updated_at])
      end

      it "既存ユーザーの場合、重複作成せず同一ユーザーでログインする" do
        existing = User.create!(google_sub: "google-sub-user-1")

        expect do
          post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }
        end.not_to change(User, :count)

        body = JSON.parse(response.body)
        expect(body["user"]["id"]).to eq(existing.id.to_s)
      end
    end

    context "IDトークンが不正でGoogle検証に失敗する場合" do
      before do
        allow(GoogleIdTokenVerifier).to receive(:verify_sub)
          .and_raise(GoogleIdTokenVerifier::VerificationFailed, "signature invalid")
      end

      it "401を返しユーザーを作成しない" do
        expect do
          post "/auth/session", params: { idToken: "tampered.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }
        end.not_to change(User, :count)

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "idTokenが欠落している場合" do
      it "400を返す" do
        post "/auth/session", params: { recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }

        expect(response).to have_http_status(:bad_request)
      end
    end

    context "recaptchaTokenが欠落している場合" do
      it "400を返す" do
        post "/auth/session", params: { idToken: "valid.jwt" }

        expect(response).to have_http_status(:bad_request)
      end
    end

    # requirements.md 1.3節: ログイン導線にreCAPTCHAを適用する。
    # src/shared/contracts/openapi.yaml createSession の429:
    # 「reCAPTCHA検証失敗、またはログイン試行のレート制限超過」。
    context "reCAPTCHA検証に失敗する場合" do
      before do
        allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return("google-sub-user-1")
      end

      it "429を返し、ユーザーを作成せずセッションも発行しない" do
        expect do
          post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: "not-a-valid-recaptcha-token" }
        end.not_to change(User, :count)

        expect(response).to have_http_status(:too_many_requests)
        expect(JSON.parse(response.body).dig("error", "code")).to eq("recaptcha_failed")
        expect(response.headers["Set-Cookie"]).to be_nil
      end

      # 検証を通過していないトークンでGoogle IDトークンの検証まで進んでしまうと、
      # reCAPTCHAがBot対策として機能しない(先に弾く必要がある)。
      it "reCAPTCHA検証前にGoogle IDトークンの検証を行わない" do
        expect(GoogleIdTokenVerifier).not_to receive(:verify_sub)

        post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: "not-a-valid-recaptcha-token" }
      end
    end

    context "reCAPTCHAの設定自体が欠落している場合(RECAPTCHA_SECRET_KEY未設定)" do
      it "検証失敗(429)ではなく例外として扱い、設定ミスを黙って通過させない" do
        allow(RecaptchaVerifier).to receive(:verify)
          .and_raise(RecaptchaVerifier::ConfigurationError, "RECAPTCHA_SECRET_KEY is not set")

        expect do
          post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: "any-token" }
        end.to raise_error(RecaptchaVerifier::ConfigurationError)
      end
    end
  end

  describe "GET /auth/session" do
    context "ログイン済みの場合" do
      it "現在のユーザー情報を200で返す" do
        allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return("google-sub-user-1")
        post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }

        get "/auth/session"

        expect(response).to have_http_status(:ok)
        body = JSON.parse(response.body)
        expect(body["user"]).to include("id", "createdAt")
      end
    end

    context "未ログインの場合" do
      it "401を返す" do
        get "/auth/session"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "DELETE /auth/session" do
    it "ログイン中に呼び出すとセッションcookieを失効させ204を返す" do
      allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return("google-sub-user-1")
      post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }

      delete "/auth/session"
      expect(response).to have_http_status(:no_content)

      get "/auth/session"
      expect(response).to have_http_status(:unauthorized)
    end

    it "未ログインの場合401を返す" do
      delete "/auth/session"

      expect(response).to have_http_status(:unauthorized)
    end
  end
end
