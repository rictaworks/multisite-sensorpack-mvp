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
               headers: auth_headers
        end.to change(AiQuotaUsage, :count).by(-1)

        expect(response).to have_http_status(:ok)
        expect(AiQuotaUsage.consumed?(user: user, quota_date: quota_date)).to be false
      end

      it "消費記録がまだ存在しないユーザー・日付を指定しても冪等にエラーなく完了する" do
        expect do
          post "/admin/ai_quota_usages",
               params: { user_id: user.id, quota_date: quota_date.iso8601 },
               headers: auth_headers
        end.not_to raise_error

        expect(response).to have_http_status(:ok)
      end

      it "存在しないuser_idを指定した場合、例外を発生させずわかりやすいエラーを返す" do
        post "/admin/ai_quota_usages",
             params: { user_id: 999_999, quota_date: quota_date.iso8601 },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_content)
      end

      it "不正なquota_dateを指定した場合、例外を発生させずわかりやすいエラーを返す" do
        post "/admin/ai_quota_usages",
             params: { user_id: user.id, quota_date: "not-a-date" },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_content)
      end
    end
  end

  describe "クロスオリジンからの状態変更リクエスト対策(CSRFトークンインフラがないAPIモードでの補完)" do
    it "Originヘッダーがリクエスト先ホストと一致しない場合は拒否する" do
      post "/admin/ai_quota_usages",
           params: { user_id: user.id, quota_date: quota_date.iso8601 },
           headers: auth_headers.merge("HTTP_ORIGIN" => "https://evil.example.com")

      expect(response).to have_http_status(:forbidden)
    end
  end
end
