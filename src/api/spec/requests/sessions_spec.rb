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
        # session_token_versionはセッション失効管理用の内部カウンタであり、
        # 個人を識別しうる情報(メールアドレス・氏名等)ではない(requirements.md 1.4)。
        expect(user.attributes.keys)
          .to match_array(%w[id google_sub session_token_version created_at updated_at])
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

  # ログアウトがブラウザ側のcookie削除だけだと、cookieを窃取された場合に
  # サーバー側から無効化する手段が無く、SESSION_TTL(30日)のあいだ有効なままになる。
  # user.session_token_versionをcookieに埋め込み、ログアウト時に加算することで
  # 発行済みcookieを一括で失効させる(.claude/OWASP10.md A07: 認証・認可の欠陥)。
  describe "セッションのサーバー側失効" do
    before { allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return("google-sub-user-1") }

    def login_and_capture_cookie
      post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: "recaptcha-token" }
      cookies[:session_id]
    end

    it "ログアウト後は、ログアウト前に発行されたcookieを再送しても認証されない" do
      stolen_cookie = login_and_capture_cookie
      expect(stolen_cookie).to be_present

      delete "/auth/session"

      # cookieを窃取した攻撃者が、ログアウト後に手元のcookieで再アクセスする状況を再現する。
      cookies[:session_id] = stolen_cookie
      get "/auth/session"

      expect(response).to have_http_status(:unauthorized)
    end

    it "ログアウトすると他の端末で発行済みのセッションも同時に失効する" do
      first_device_cookie = login_and_capture_cookie

      # 別端末からのログインを、独立したintegration sessionとして再現する。
      second_device = open_session
      second_device.post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: "recaptcha-token" }
      expect(second_device.response).to have_http_status(:ok)

      # 片方の端末でログアウトする。
      second_device.delete "/auth/session"
      expect(second_device.response).to have_http_status(:no_content)

      cookies[:session_id] = first_device_cookie
      get "/auth/session"

      expect(response).to have_http_status(:unauthorized)
    end

    it "ログアウトしていなければセッションは有効なまま維持される" do
      login_and_capture_cookie

      get "/auth/session"

      expect(response).to have_http_status(:ok)
    end

    it "再ログインすれば新しいcookieで再びアクセスできる" do
      login_and_capture_cookie
      delete "/auth/session"

      post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: "recaptcha-token" }
      get "/auth/session"

      expect(response).to have_http_status(:ok)
    end

    it "ログアウトのたびにsession_token_versionが加算される" do
      login_and_capture_cookie
      user = User.find_by!(google_sub: "google-sub-user-1")

      expect { delete "/auth/session" }.to change { user.reload.session_token_version }.by(1)
    end

    # cookieの中身が改竄されていなくても、token_versionが一致しなければ通さない
    # (Rails標準の暗号化cookieによる改竄検知に加えた、サーバー側の失効判定)。
    it "DBのsession_token_versionが進んでいるcookieは受け付けない" do
      login_and_capture_cookie
      user = User.find_by!(google_sub: "google-sub-user-1")

      user.increment!(:session_token_version)

      get "/auth/session"
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
