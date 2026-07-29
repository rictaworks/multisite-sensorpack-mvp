# F5 自動制御ルール設定API(openapi.yaml getAutomationRule / updateAutomationRule、UC9)。
#
# 契約に定義がありながらルーティングが存在せず、運用ツール画面(Issue #21)の自動制御
# トグルを実APIへ結線できない状態だったため実装する。
#
# 自動ルールに基づく実際のコマンド発行(温度上限アラートでのFAN_ON/OFF等)は
# CommandDispatchService の責務であり、本コントローラは設定値の参照・更新のみを扱う。
#
# 認証・テナント分離は Authenticatable/TenantScoped concern に委譲する
# (自前のユーザー識別・所有権チェックを再実装しない)。
module Api
  class AutomationRulesController < ApplicationController
    include Authenticatable
    include TenantScoped

    before_action :set_device

    # GET /api/v1/devices/:deviceId/automation-rule
    #
    # ルール未作成のデバイスでも404にしない。404にすると画面側は「デバイスが無い」のか
    # 「まだ設定していない」のか区別できず、設定画面を出せない。
    # DB上の既定値(いずれも無効)と同じ内容を返す。
    def show
      render json: serialize(@device.automation_rule), status: :ok
    end

    # PUT /api/v1/devices/:deviceId/automation-rule
    def update
      attributes = update_attributes

      rule = @device.automation_rule || @device.build_automation_rule
      rule.assign_attributes(attributes)
      rule.save!

      Rails.logger.info(
        "[Api::AutomationRulesController#update] user_id=#{current_user.id} device_id=#{@device.id} " \
        "fan_on_temp_alert=#{rule.fan_on_temp_alert} led_on_alert=#{rule.led_on_alert}"
      )
      render json: serialize(rule), status: :ok
    rescue InvalidBooleanError => e
      Rails.logger.info("[Api::AutomationRulesController#update] validation_error #{e.message}")
      render json: {
        error: { code: "validation_error", message: I18n.t("errors.validation_error"), details: { message: e.message } }
      }, status: :bad_request
    end

    private

    # 真偽値として解釈できない値を送られたときに送出する。
    # ActiveModel::Type::Boolean は未知の文字列をtrue扱いにしてしまい、
    # 誤った値を黙って受け入れることになるため、明示的に弾く。
    class InvalidBooleanError < StandardError; end

    BOOLEAN_FIELDS = { fanOnTempAlert: :fan_on_temp_alert, ledOnAlert: :led_on_alert }.freeze
    TRUE_VALUES = [ true, "true", "1", 1 ].freeze
    FALSE_VALUES = [ false, "false", "0", 0 ].freeze

    def set_device
      @device = authorize_owner!(Device.find(params[:deviceId]))
    end

    # 契約(AutomationRuleUpdateRequest)はどちらのフィールドも必須ではない。
    # 送られてこなかったフィールドは現在値を維持する(既定値へ巻き戻すと、
    # 片方だけ切り替えたときにもう片方のトグルが勝手に戻る)。
    def update_attributes
      BOOLEAN_FIELDS.each_with_object({}) do |(param_name, column), attributes|
        next unless params.key?(param_name)

        attributes[column] = coerce_boolean(param_name, params[param_name])
      end
    end

    def coerce_boolean(param_name, value)
      return true if TRUE_VALUES.include?(value)
      return false if FALSE_VALUES.include?(value)

      raise InvalidBooleanError, "#{param_name} must be a boolean, got #{value.inspect}"
    end

    # openapi.yaml AutomationRule。未作成の場合もDB上の既定値と同じ内容を返す。
    def serialize(rule)
      {
        fanOnTempAlert: rule ? rule.fan_on_temp_alert : false,
        ledOnAlert: rule ? rule.led_on_alert : false,
        manualOverrideUntil: rule&.manual_override_until&.iso8601
      }
    end
  end
end
