# F9 開発者向け管理画面: AIクォータ手動リセット(Issue #16 / requirements.md F9受け入れ条件)。
#
# 「任意ユーザーのAIクォータ(#14で実装したai_quota_usages)を手動リセットできる」を満たす。
# リセット処理自体はIssue #14で用意済みのAiQuotaUsage.reset_for!に委譲し、自前実装しない
# (.claude/rules/architecture.md)。
module Admin
  class AiQuotaUsagesController < Admin::BaseController
    def index
      load_ai_quota_usages
      # devices_controller.rbと同様、ActionController::API既定のimplicit renderは
      # 常にhead :no_contentのため、テンプレート描画を明示する。
      render :index
    end

    # POST /admin/ai_quota_usages
    #
    # 指定ユーザー・クォータ日のAIクォータ消費記録を手動リセットする。フォームからの
    # 入力(想定外のuser_id・quota_date)はフォールバックで握りつぶさず、明示的に検証し
    # エラーメッセージ付きでindexへ戻す(.claude/rules/coding-style.md: フォールバック禁止)。
    def create
      user = User.find(reset_params[:user_id])
      quota_date = parse_quota_date(reset_params[:quota_date])

      AiQuotaUsage.reset_for!(user: user, quota_date: quota_date)
      Rails.logger.info(
        "[Admin::AiQuotaUsagesController#create] manually reset user_id=#{user.id} quota_date=#{quota_date}"
      )

      @notice = I18n.t("admin.ai_quota_usages.reset_success", user_id: user.id, quota_date: quota_date.iso8601)
      load_ai_quota_usages
      render :index, status: :ok
    rescue ActiveRecord::RecordNotFound
      Rails.logger.warn(
        "[Admin::AiQuotaUsagesController#create] user not found user_id=#{reset_params[:user_id].inspect}"
      )
      @alert = I18n.t("admin.ai_quota_usages.user_not_found")
      load_ai_quota_usages
      render :index, status: :unprocessable_content
    rescue ArgumentError, Date::Error, TypeError
      Rails.logger.warn(
        "[Admin::AiQuotaUsagesController#create] invalid quota_date=#{reset_params[:quota_date].inspect}"
      )
      @alert = I18n.t("admin.ai_quota_usages.invalid_date")
      load_ai_quota_usages
      render :index, status: :unprocessable_content
    end

    private

    def reset_params
      params.permit(:user_id, :quota_date)
    end

    def parse_quota_date(raw)
      raise ArgumentError, "quota_date is required" if raw.blank?

      Date.iso8601(raw)
    end

    def load_ai_quota_usages
      @ai_quota_usages = AiQuotaUsage.includes(:user).order(quota_date: :desc, user_id: :asc).to_a
    end
  end
end
