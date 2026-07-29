# F7 AI日次サマリー クォータ制御API(requirements.md 1.6 generate_daily_summary、Issue #14)。
#
# src/shared/contracts/openapi.yaml ai-summaryタグ(getTodaySummary/generateDailySummary)を実装する。
# 認証・テナント分離はIssue #7で実装済みのAuthenticatable/TenantScoped concernを再利用する
# (development/test限定のデバッグヘッダー等のプレースホルダー認証は新設しない)。
module Api
  class SummariesController < ApplicationController
    include Authenticatable
    include TenantScoped

    # GET /api/v1/ai-summaries/today
    #
    # 当日(現在のクォータ日)に生成済みのサマリーがあれば返す(クォータ消費なし)。
    # 未生成の場合は204を返す。
    def today
      quota_date = DailySummaryService.quota_date_for(Time.current)
      summary = AiSummary.find_by(user_id: current_user.id, quota_date: quota_date)

      if summary
        render json: serialize_summary(summary), status: :ok
      else
        head :no_content
      end
    end

    # POST /api/v1/ai-summaries
    #
    # AI日次サマリーを生成する(F7 generate_daily_summary)。同一クォータ日に既に
    # 生成済みなら429を返し、既存の保存済みサマリーを併せて返す。
    def create
      summary = DailySummaryService.new(current_user).call
      render json: serialize_summary(summary), status: :created
    rescue DailySummaryService::QuotaExceededError => e
      Rails.logger.info("[Api::SummariesController#create] #{e.message}")
      render json: {
        error: { code: "quota_exceeded", message: I18n.t("errors.ai_summary_quota_exceeded") },
        existingSummary: serialize_summary(e.existing_summary)
      }, status: :too_many_requests
    rescue DailySummaryService::InternalAiClient::ConfigurationError,
           DailySummaryService::InternalAiClient::RequestFailedError => e
      # フォールバックで無条件に定型文へすり替えず、AIサービス側の実障害は明示的に502として扱う
      # (「データ不足」の定型文は別経路であり、ここで混同しない、.claude/rules/coding-style.md)。
      Rails.logger.error("[Api::SummariesController#create] internal-ai call failed: #{e.message}")
      render json: { error: { code: "ai_service_unavailable", message: I18n.t("errors.ai_summary_service_unavailable") } },
             status: :bad_gateway
    end

    private

    # レスポンスはsrc/shared/contracts/openapi.yaml AiSummaryスキーマ(camelCase)に合わせる。
    def serialize_summary(summary)
      {
        quotaDate: summary.quota_date.iso8601,
        summaryText: summary.summary_text,
        generatedAt: summary.updated_at.iso8601,
        dataSufficient: summary.data_sufficient?
      }
    end
  end
end
