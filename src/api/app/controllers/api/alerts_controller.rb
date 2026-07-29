# F8 アラート管理API(requirements.md 1.6 manage_alerts)。
#
# ユーザーは自分の拠点配下のデバイスに紐づくアラートのみ参照・ack操作できる(テナント分離、
# requirements.md F6-1と同様の方針)。close遷移はユーザー操作からは行えず、閾値/オフラインの
# 解除条件成立時の自動処理のみで行われる(#9・#10で実装)。通知はアプリ内通知バッジのみであり、
# メール通知は実装しない(requirements.md 1.4/1.6 F8)。
#
# 認証・テナント分離はIssue #7で整備された Authenticatable/TenantScoped concern に委譲する
# (自前のユーザー識別・所有権チェックを再実装しない。.claude/rules/architecture.md準拠)。
# src/shared/contracts/openapi.yaml の listAlerts/acknowledgeAlert はいずれも
# `security: [googleSessionCookie]` を要求しており、Issue #15時点で暫定的に用いていた
# development/test限定のデバッグヘッダー(X-Debug-User-Id)は廃止した。当該ヘッダーは
# 本番ではfail closedで無効だったものの、development/testでは任意ユーザーへのなりすましが
# 可能でテナント分離が成立していなかったため、環境を問わず一切参照しない。
module Api
  class AlertsController < ApplicationController
    include Authenticatable
    include TenantScoped

    DEFAULT_LIST_STATUSES = %w[open acknowledged].freeze

    before_action :set_alert, only: [ :ack ]

    # GET /api/v1/alerts
    #
    # 自分の拠点配下の全アラートを一覧取得する(UC7)。statusクエリ(カンマ区切り、
    # 例:open,acknowledged)が指定されない場合はopen/acknowledgedのみを返す
    # (requirements.md 1.6 F8-2)。deviceIdクエリでデバイス単位にも絞り込める。
    def index
      statuses = params[:status].present? ? params[:status].to_s.split(",").map(&:strip) : DEFAULT_LIST_STATUSES
      invalid_statuses = statuses - Alert::STATUSES
      if invalid_statuses.any?
        Rails.logger.warn("[Api::AlertsController#index] invalid status requested: #{invalid_statuses}")
        return render_error(status: :bad_request, code: "validation_error", i18n_key: "errors.validation_error",
                            details: { invalidStatuses: invalid_statuses })
      end

      alerts = scoped_alerts.where(status: statuses)
      # deviceIdはscoped_alerts(自分の拠点配下)への追加絞り込みでしかないため、他ユーザーの
      # デバイスIDを指定しても常に空配列になる(越境参照は構造的に不可)。
      alerts = alerts.where(device_id: params[:deviceId]) if params[:deviceId].present?
      alerts = alerts.order(opened_at: :desc)

      Rails.logger.info(
        "[Api::AlertsController#index] user_id=#{current_user.id} statuses=#{statuses} count=#{alerts.size}"
      )

      render json: { alerts: alerts.map { |alert| serialize_alert(alert) } }, status: :ok
    end

    # GET /api/v1/alerts/unread-count
    #
    # アプリ内通知バッジ用の未対応(open)件数を返す(requirements.md 1.4/1.6 F8-3、メール通知は実装しない)。
    def unread_count
      count = scoped_alerts.where(status: "open").count

      Rails.logger.info("[Api::AlertsController#unread_count] user_id=#{current_user.id} count=#{count}")

      render json: { unreadCount: count }, status: :ok
    end

    # POST /api/v1/alerts/:alertId/ack
    #
    # open状態のアラートをacknowledgedにする(UC7)。acknowledged済みへの再ackは冪等な無処理。
    # closed済みのアラートへのackは409(手動close不可であり、既に自動close済みのため)。
    def ack
      @alert.acknowledge!
      render json: serialize_alert(@alert), status: :ok
    rescue Alert::AlreadyClosedError => e
      Rails.logger.info("[Api::AlertsController#ack] #{e.message}")
      render_error(status: :conflict, code: "alert_already_closed", i18n_key: "errors.alert_already_closed")
    end

    private

    # 自分(current_user)が所有する拠点配下のデバイスに紐づくアラートのみを対象とする。
    def scoped_alerts
      Alert.joins(device: :site).where(sites: { user_id: current_user.id })
    end

    # 存在しないアラートはActiveRecord::RecordNotFoundから、他ユーザー所有のアラートは
    # TenantScoped::TenantViolationから、それぞれTenantScopedのrescue_fromが
    # 契約形状の404/403を返す(自前のnot_found/forbidden分岐は書かない)。
    #
    # AlertはuserもsiteもDBカラム/関連として直接持たない(belongs_to :deviceのみ)ため、
    # TenantScoped#resolve_tenant_ownerが辿れる@alert.device(Device#site#user)を
    # 所有権チェックの対象として渡す。
    def set_alert
      @alert = Alert.find(params[:alertId])
      authorize_owner!(@alert.device)
    end

    def serialize_alert(alert)
      {
        id: alert.id,
        deviceId: alert.device_id,
        # DBのマスタコード("threshold_upper_breach")をそのまま返すと契約
        # (openapi.yaml AlertTypeCode: "upper_breach")違反になる。変換はAlertモデルに集約。
        alertType: alert.contract_alert_type_code,
        severity: alert.severity_code,
        status: alert.status,
        openedAt: alert.opened_at&.iso8601,
        acknowledgedAt: alert.acknowledged_at&.iso8601,
        closedAt: alert.closed_at&.iso8601
      }
    end

    # src/shared/contracts/openapi.yaml components.schemas.Error: {error: {code, message, details?}}
    def render_error(status:, code:, i18n_key:, details: nil)
      render json: { error: { code: code, message: I18n.t(i18n_key), details: details } }, status: status
    end
  end
end
