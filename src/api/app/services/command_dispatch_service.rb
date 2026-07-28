# requirements.md 1.6 F5 dispatch_command:
# LED/ファンの手動制御コマンドの発行(pending)・ピギーバック配信(pending->delivered)・
# ACK処理(->done)・TTL失効(->expired)・自動ルール発火
# (温度上限アラートopen/closeでFAN、任意のアラートopen中はLEDを現地表示灯として自動制御)を担う。
#
# 認証・所有者チェック(手動発行時のテナント分離)はコントローラ側
# (Api::CommandsController + Authenticatable/TenantScoped concern)の責務であり、
# 本サービスは対象Deviceを受け取った前提で動作する(TelemetryIngestServiceと同様の責務分担)。
class CommandDispatchService
  # 未知のcommandTypeが渡された場合に送出する(コントローラ側で400 validation_errorにマッピングする)。
  class InvalidCommandTypeError < StandardError; end

  TTL = Command::TTL_MINUTES.minutes

  # requirements.md 1.7マスタ: LED_ON/LED_OFF/FAN_ON/FAN_OFFのon/offペア。
  ACTUATOR_COMMAND_PAIRS = {
    "fan" => { on: "FAN_ON", off: "FAN_OFF" },
    "led" => { on: "LED_ON", off: "LED_OFF" }
  }.freeze

  def initialize(device:)
    @device = device
  end

  # requirements.md F5 手順1: ユーザーが手動でLED/ファンコマンドを発行する。
  # 冪等ID付き・pending・TTL10分でキューに積み、同一アクチュエータへの自動ルール発行を
  # 30分間抑止するオーバーライドウィンドウを開始する(手動優先)。
  # オフライン中のデバイス宛の発行も許可する(受け入れ条件、UI側の警告表示は別issue)。
  def enqueue_manual!(command_type_code:)
    command_type = CommandType.find_by(code: command_type_code)
    unless command_type
      raise InvalidCommandTypeError, "unknown commandType: #{command_type_code.inspect}"
    end

    command = create_command!(command_type: command_type, origin: "manual")
    automation_rule_for_update.register_manual_override!

    Rails.logger.info(
      "[CommandDispatchService] device_id=#{@device.id} manual command enqueued " \
      "command_type=#{command_type_code} idempotency_key=#{command.idempotency_key}"
    )
    command
  end

  # requirements.md F5 手順2-5: テレメトリ受信のたびに呼び出す(ピギーバック方式、専用ポーリングは設けない)。
  #   1. 前回配信分のACKを処理してdoneにする(同一冪等IDの重複ACKは無視する)
  #   2. TTL超過のpending/deliveredをexpiredにする
  #   3. 自動ルールを現在のアラート状態に基づいて評価し、必要であれば自動コマンドを発行する
  #   4. 配信対象(pending・TTL内・issued_at昇順・最大5件)をdeliveredにして返す
  # 一連の状態遷移は単一トランザクションで行い、途中失敗時に中途半端な状態(例: ACK済みだが
  # 配信リストが不整合)を残さない。
  def piggyback!(command_acks: [])
    Command.transaction do
      apply_acks!(command_acks)
      expire_overdue!
      reconcile_automation!
      deliver!
    end
  end

  private

  # requirements.md F5 手順3: ACKで該当コマンドをdoneにする。
  # 対象デバイス配下のコマンドのみを検索する(他デバイスの冪等IDを誤ってACKできないようにする、テナント/デバイス分離)。
  # 存在しない冪等ID(既に掃除済み・別デバイスのもの等)は、フォールバックで握りつぶさず
  # 明示的にログを残した上でスキップする(エラーにはしない。ESP32側の再送耐性を優先する)。
  def apply_acks!(idempotency_keys)
    Array(idempotency_keys).each do |key|
      next if key.blank?

      command = @device.commands.find_by(idempotency_key: key)
      unless command
        Rails.logger.warn(
          "[CommandDispatchService] device_id=#{@device.id} ACK for unknown idempotency_key=#{key}, ignoring"
        )
        next
      end

      command.mark_done!
    end
  end

  def expire_overdue!
    @device.commands.overdue.find_each(&:mark_expired!)
  end

  # requirements.md F5 受け入れ条件: 自動ルール(温度上限アラートopenでFAN_ON、closeでFAN_OFF。
  # LEDはアラートopen中の現地表示灯として自動制御)。automation_ruleが未設定のデバイスは対象外
  # (フラグ既定値falseと同じ扱いで、自動発行を一切行わない)。
  def reconcile_automation!
    rule = @device.automation_rule
    return unless rule

    if rule.fan_on_temp_alert?
      maybe_dispatch_auto!(rule, actuator_type_code: "fan", alert_active: temperature_upper_alert_open?)
    end

    if rule.led_on_alert?
      maybe_dispatch_auto!(rule, actuator_type_code: "led", alert_active: any_alert_open?)
    end
  end

  def temperature_upper_alert_open?
    @device.alerts.open.exists?(alert_type_code: Alert::THRESHOLD_UPPER_BREACH_ALERT_TYPE_CODE)
  end

  # openapi.yaml AutomationRule.ledOnAlert: 「アラートopen中の現地表示灯としてLEDを自動制御する」。
  # 温度上限に限定されないため、種別を問わずopen中のアラートが1件でもあるかで判定する。
  def any_alert_open?
    @device.alerts.open.exists?
  end

  # 望ましい状態(desired_code)と、直近そのアクチュエータに発行された最後のコマンド種別を比較し、
  # 差分があるときだけ新規コマンドを発行する(テレメトリ受信のたびに呼ばれるため、状態が
  # 変わっていない限り毎回発行してキューを埋め尽くさないようにするための冪等ガード)。
  def maybe_dispatch_auto!(rule, actuator_type_code:, alert_active:)
    pair = ACTUATOR_COMMAND_PAIRS.fetch(actuator_type_code)
    desired_code = alert_active ? pair[:on] : pair[:off]

    if rule.manual_override_active?(actuator_type_code)
      Rails.logger.info(
        "[CommandDispatchService] device_id=#{@device.id} actuator=#{actuator_type_code} " \
        "自動ルール発行を手動オーバーライドにより抑止しました"
      )
      return
    end

    return if live_command_exists?(desired_code)

    last_code = last_command_type_code_for(actuator_type_code)
    return if last_code == desired_code
    # まだ一度もON(自動/手動問わず)にした実績がないアクチュエータへ、開始時からいきなり
    # OFFを自動発行する必要はない(requirements.md: openでON・closeでOFFという「対」の発火)。
    return if desired_code == pair[:off] && last_code.nil?

    command_type = CommandType.find_by!(code: desired_code)
    command = create_command!(command_type: command_type, origin: "auto")
    Rails.logger.info(
      "[CommandDispatchService] device_id=#{@device.id} auto command enqueued " \
      "command_type=#{desired_code} idempotency_key=#{command.idempotency_key}"
    )
    command
  end

  def live_command_exists?(command_type_code)
    @device.commands.where(command_type_code: command_type_code, status: %w[pending delivered]).exists?
  end

  def last_command_type_code_for(actuator_type_code)
    @device.commands
           .joins(:command_type)
           .where(command_types: { actuator_type_code: actuator_type_code })
           .order(issued_at: :desc, id: :desc)
           .limit(1)
           .pick(:command_type_code)
  end

  def deliver!
    commands = @device.commands.deliverable.to_a
    commands.each(&:mark_delivered!)
    commands
  end

  def create_command!(command_type:, origin:)
    issued_at = Time.current
    @device.commands.create!(
      command_type: command_type,
      idempotency_key: SecureRandom.uuid,
      origin: origin,
      status: "pending",
      issued_at: issued_at,
      expires_at: issued_at + TTL
    )
  end

  # requirements.md ER図: DEVICES ||--o| AUTOMATION_RULES(0..1)。手動発行時点でまだ
  # automation_ruleが存在しないデバイスにも、フラグ既定値false(自動制御なし)のレコードを
  # 作成しておくことで、以後manual_override_untilの参照・更新先を一意に持たせる。
  def automation_rule_for_update
    @device.automation_rule || @device.create_automation_rule!
  end
end
