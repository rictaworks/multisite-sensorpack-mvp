# F8 アラート管理API(requirements.md 1.6 manage_alerts)。
#
# ユーザーは自分の拠点配下のデバイスに紐づくアラートのみ参照・ack操作できる(テナント分離、
# requirements.md F6-1と同様の方針)。close遷移はユーザー操作からは行えず、閾値/オフラインの
# 解除条件成立時の自動処理のみで行われる(#9・#10で実装)。通知はアプリ内通知バッジのみであり、
# メール通知は実装しない(requirements.md 1.4/1.6 F8)。
#
# NOTE: Google OAuthセッションによるcurrent_user解決はIssue #7(認証・テナント分離基盤)の担当範囲。
# #7がマージされ次第、本コントローラの#current_user/#resolve_current_userはApplicationController
# 共通の実装に置き換える。それまではdevelopment/test環境限定のデバッグヘッダーで代替し、
# production環境ではこのヘッダーが絶対に機能しない(fail closed、.claude/rules/environment.md)。
module Api
  class AlertsController < ApplicationController
    # X-Debug-User-Idヘッダーで許容するのはdevelopment/testのみ。判定不能な環境は本番として扱う。
    DEBUG_AUTH_ALLOWED_ENVIRONMENTS = %i[development test].freeze
    DEFAULT_LIST_STATUSES = %w[open acknowledged].freeze

    before_action :authenticate_user!
    before_action :set_alert, only: [ :ack ]

    # GET /api/alerts
    #
    # 自分の拠点配下の全アラートを一覧取得する(UC7)。statusクエリ(カンマ区切り、
    # 例:open,acknowledged)が指定されない場合はopen/acknowledgedのみを返す
    # (requirements.md 1.6 F8-2)。deviceIdクエリでデバイス単位にも絞り込める。
    def index
      statuses = params[:status].present? ? params[:status].to_s.split(",").map(&:strip) : DEFAULT_LIST_STATUSES
      invalid_statuses = statuses - Alert::STATUSES
      if invalid_statuses.any?
        Rails.logger.warn("[Api::AlertsController#index] invalid status requested: #{invalid_statuses}")
        render json: { error: "invalid_status", invalidStatuses: invalid_statuses }, status: :bad_request
        return
      end

      alerts = scoped_alerts.where(status: statuses)
      alerts = alerts.where(device_id: params[:deviceId]) if params[:deviceId].present?
      alerts = alerts.order(opened_at: :desc)

      Rails.logger.info(
        "[Api::AlertsController#index] user_id=#{current_user.id} statuses=#{statuses} count=#{alerts.size}"
      )

      render json: { alerts: alerts.map { |alert| serialize_alert(alert) } }, status: :ok
    end

    # GET /api/alerts/unread_count
    #
    # アプリ内通知バッジ用の未対応(open)件数を返す(requirements.md 1.4/1.6 F8-3、メール通知は実装しない)。
    def unread_count
      count = scoped_alerts.where(status: "open").count

      render json: { unreadCount: count }, status: :ok
    end

    # POST /api/alerts/:alertId/ack
    #
    # open状態のアラートをacknowledgedにする(UC7)。acknowledged済みへの再ackは冪等な無処理。
    # closed済みのアラートへのackは409(手動close不可であり、既に自動close済みのため)。
    def ack
      @alert.acknowledge!
      render json: serialize_alert(@alert), status: :ok
    rescue Alert::AlreadyClosedError => e
      Rails.logger.info("[Api::AlertsController#ack] #{e.message}")
      render json: { error: "alert_already_closed" }, status: :conflict
    end

    private

    def authenticate_user!
      render json: { error: "unauthorized" }, status: :unauthorized unless current_user
    end

    def current_user
      @current_user ||= resolve_current_user
    end

    def resolve_current_user
      unless DEBUG_AUTH_ALLOWED_ENVIRONMENTS.any? { |env| Rails.env.public_send("#{env}?") }
        return nil
      end

      debug_user_id = request.headers["X-Debug-User-Id"]
      return nil if debug_user_id.blank?

      User.find_by(id: debug_user_id)
    end

    # 自分(current_user)が所有する拠点配下のデバイスに紐づくアラートのみを対象とする。
    def scoped_alerts
      Alert.joins(device: :site).where(sites: { user_id: current_user.id })
    end

    def set_alert
      @alert = Alert.find_by(id: params[:alertId])
      unless @alert
        render json: { error: "not_found" }, status: :not_found
        return
      end

      unless @alert.device.site.user_id == current_user.id
        Rails.logger.warn(
          "[Api::AlertsController#set_alert] user_id=#{current_user.id} attempted cross-tenant access " \
          "to alert_id=#{@alert.id}"
        )
        render json: { error: "forbidden" }, status: :forbidden
        nil
      end
    end

    def serialize_alert(alert)
      {
        id: alert.id,
        deviceId: alert.device_id,
        alertType: alert.alert_type_code,
        severity: alert.severity_code,
        status: alert.status,
        openedAt: alert.opened_at&.iso8601,
        acknowledgedAt: alert.acknowledged_at&.iso8601,
        closedAt: alert.closed_at&.iso8601
      }
    end
  end
end
