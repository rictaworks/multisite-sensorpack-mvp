require "rails_helper"

# Issue #16 (F9 開発者向け管理画面): 任意ユーザーのAIクォータ(#14 ai_quota_usages)を
# BASIC認証の背後で手動リセットできることを検証する。実際のリセット処理は
# Issue #14で実装済みのAiQuotaUsage.reset_for!に委譲する(app/models/ai_quota_usage.rb)。
RSpec.describe "Admin AI quota manual reset (F9)", type: :request do
  let(:admin_user) { "admin-user" }
  let(:admin_password) { "s3cr3t-passw0rd" }
  let(:auth_headers) do
    { "HTTP_AUTHORIZATION" => ActionController::HttpAuthentication::Basic.encode_credentials(admin_user, admin_password) }
  end
  # 管理画面のフォーム送信を模したヘッダー。ブラウザはPOSTに必ずOriginを付与するため、
  # 状態変更リクエストの正常系はsame-originのOriginを伴う。
  let(:same_origin_headers) { auth_headers.merge("HTTP_ORIGIN" => "http://www.example.com") }
  let!(:user) { User.create!(google_sub: "quota-user-sub") }
  let(:quota_date) { Date.current }

  around do |example|
    original_user = ENV["ADMIN_BASIC_AUTH_USER"]
    original_password = ENV["ADMIN_BASIC_AUTH_PASSWORD"]
    ENV["ADMIN_BASIC_AUTH_USER"] = admin_user
    ENV["ADMIN_BASIC_AUTH_PASSWORD"] = admin_password
    example.run
  ensure
    ENV["ADMIN_BASIC_AUTH_USER"] = original_user
    ENV["ADMIN_BASIC_AUTH_PASSWORD"] = original_password
  end

  describe "GET /admin/ai_quota_usages" do
    it "未認証の場合401を返す" do
      get "/admin/ai_quota_usages"

      expect(response).to have_http_status(:unauthorized)
    end

    it "認証済みの場合200を返し、既存のクォータ消費記録(ユーザーID)を一覧表示する" do
      AiQuotaUsage.consume!(user: user, quota_date: quota_date)

      get "/admin/ai_quota_usages", headers: auth_headers

      expect(response).to have_http_status(:ok)
      expect(response.body).to include(user.id.to_s)
    end
  end

  describe "POST /admin/ai_quota_usages" do
    context "未認証の場合" do
      it "401を返し、クォータ消費記録を変更しない" do
        AiQuotaUsage.consume!(user: user, quota_date: quota_date)

        expect do
          post "/admin/ai_quota_usages", params: { user_id: user.id, quota_date: quota_date.iso8601 }
        end.not_to change(AiQuotaUsage, :count)

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "認証済みの場合" do
      it "指定ユーザー・クォータ日のAIクォータ消費記録をAiQuotaUsage.reset_for!経由で手動リセットする" do
        AiQuotaUsage.consume!(user: user, quota_date: quota_date)
        expect(AiQuotaUsage.consumed?(user: user, quota_date: quota_date)).to be true

        expect do
          post "/admin/ai_quota_usages",
               params: { user_id: user.id, quota_date: quota_date.iso8601 },
               headers: same_origin_headers
        end.to change(AiQuotaUsage, :count).by(-1)

        expect(response).to have_http_status(:ok)
        expect(AiQuotaUsage.consumed?(user: user, quota_date: quota_date)).to be false
      end

      it "消費記録がまだ存在しないユーザー・日付を指定しても冪等にエラーなく完了する" do
        expect do
          post "/admin/ai_quota_usages",
               params: { user_id: user.id, quota_date: quota_date.iso8601 },
               headers: same_origin_headers
        end.not_to raise_error

        expect(response).to have_http_status(:ok)
      end

      it "存在しないuser_idを指定した場合、例外を発生させずわかりやすいエラーを返す" do
        post "/admin/ai_quota_usages",
             params: { user_id: 999_999, quota_date: quota_date.iso8601 },
             headers: same_origin_headers

        expect(response).to have_http_status(:unprocessable_content)
      end

      it "不正なquota_dateを指定した場合、例外を発生させずわかりやすいエラーを返す" do
        post "/admin/ai_quota_usages",
             params: { user_id: user.id, quota_date: "not-a-date" },
             headers: same_origin_headers

        expect(response).to have_http_status(:unprocessable_content)
      end
    end
  end

  describe "クロスオリジンからの状態変更リクエスト対策(CSRFトークンインフラがないAPIモードでの補完)" do
    it "Originヘッダーがリクエスト先ホストと一致しない場合は拒否する" do
      post "/admin/ai_quota_usages",
           params: { user_id: user.id, quota_date: quota_date.iso8601 },
           headers: same_origin_headers.merge("HTTP_ORIGIN" => "https://evil.example.com")

      expect(response).to have_http_status(:forbidden)
    end

    # BASIC認証はブラウザが同一originへのリクエストへ認証情報を自動で付け直すため、
    # Originを検証できないリクエストを素通りさせるとCSRFが成立しうる。判定できない場合は
    # 本番として扱う(fail closed)という .claude/rules/environment.md の方針に合わせ、
    # Origin/Refererのいずれも無い状態変更リクエストは拒否する。
    it "OriginヘッダーもRefererヘッダーも無い場合は拒否し、クォータ消費記録を変更しない" do
      AiQuotaUsage.consume!(user: user, quota_date: quota_date)

      expect do
        post "/admin/ai_quota_usages",
             params: { user_id: user.id, quota_date: quota_date.iso8601 },
             headers: auth_headers
      end.not_to change(AiQuotaUsage, :count)

      expect(response).to have_http_status(:forbidden)
    end

    it "Originが無くてもRefererが同一originであれば許可する" do
      post "/admin/ai_quota_usages",
           params: { user_id: user.id, quota_date: quota_date.iso8601 },
           headers: auth_headers.merge("HTTP_REFERER" => "http://www.example.com/admin/ai_quota_usages")

      expect(response).to have_http_status(:ok)
    end

    it "Originが無くRefererが別originの場合は拒否する" do
      post "/admin/ai_quota_usages",
           params: { user_id: user.id, quota_date: quota_date.iso8601 },
           headers: auth_headers.merge("HTTP_REFERER" => "https://evil.example.com/attack.html")

      expect(response).to have_http_status(:forbidden)
    end

    it "Originが一致していればRefererが別originでも許可する(Originを優先して検証する)" do
      post "/admin/ai_quota_usages",
           params: { user_id: user.id, quota_date: quota_date.iso8601 },
           headers: same_origin_headers.merge("HTTP_REFERER" => "https://evil.example.com/attack.html")

      expect(response).to have_http_status(:ok)
    end

    it "GETリクエストはOrigin/Refererが無くても許可する(状態を変更しないため)" do
      get "/admin/ai_quota_usages", headers: auth_headers

      expect(response).to have_http_status(:ok)
    end
  end
end
