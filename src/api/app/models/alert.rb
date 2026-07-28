class Alert < ApplicationRecord
  STATUSES = %w[open acknowledged closed].freeze

  # requirements.md 1.7マスタ: アラート種別「上限超過」「下限逸脱」(db/seeds.rb準拠)。
  # 重要度はrequirements.mdに明記がないため、Issue #10のオフラインアラートと同様に
  # "warning"を採用する(要件が明確になり次第、service-managerエージェント側で見直す余地あり)。
  THRESHOLD_UPPER_BREACH_ALERT_TYPE_CODE = "threshold_upper_breach".freeze
  THRESHOLD_LOWER_BREACH_ALERT_TYPE_CODE = "threshold_lower_breach".freeze
  THRESHOLD_BREACH_ALERT_SEVERITY_CODE = "warning".freeze

  # closeはユーザー操作から行えず、閾値/オフラインの解除条件成立時の自動処理のみで行う
  # (requirements.md 1.6 F8、#9・#10で実装)。手動closeを試みた場合に送出する例外。
  class AlreadyClosedError < StandardError; end

  belongs_to :device
  belongs_to :alert_type, foreign_key: :alert_type_code, primary_key: :code, inverse_of: :alerts
  belongs_to :alert_severity, foreign_key: :severity_code, primary_key: :code, inverse_of: :alerts

  # requirements.md F8: open -> acknowledged -> closed、または open -> closed(自動)。
  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :opened_at, presence: true

  # requirements.md F4/F3: オフライン復帰・閾値解除の判定はopen中のアラートのみを対象にする。
  scope :open, -> { where(status: "open") }

  # requirements.md 1.6 F8 `manage_alerts`: ユーザーはopen状態のアラートをacknowledgedにできる。
  # 既にacknowledged済みの場合は冪等な無処理として扱う(二重ackの多重クリック等を許容するため)。
  # closed済みのアラートはユーザー操作からack不可であり、AlreadyClosedErrorを送出する(Fail Fast)。
  def acknowledge!
    case status
    when "open"
      update!(status: "acknowledged", acknowledged_at: Time.current)
      Rails.logger.info("[Alert#acknowledge!] alert_id=#{id} open -> acknowledged")
    when "acknowledged"
      Rails.logger.info("[Alert#acknowledge!] alert_id=#{id} already acknowledged (idempotent no-op)")
    when "closed"
      raise AlreadyClosedError, "alert #{id} is already closed and cannot be acknowledged manually"
    else
      raise "unexpected alert status encountered: #{status.inspect}"
    end
  end

  # requirements.md F4 手順4-5 / クラス図 Alert#autoClose(): 解除条件成立(オフライン復帰・閾値解除)による自動クローズ。
  # 既にclosed済みなら何もしない(冪等。二重クローズでclosed_atを上書きしない)。
  def auto_close!
    return if status == "closed"

    Rails.logger.info("[Alert##{id}] 解除条件成立によりclosedへ自動遷移します(alert_type_code=#{alert_type_code})")
    update!(status: "closed", closed_at: Time.current)
  end

  # requirements.md F3 手順3-4: Threshold#direction(upper/lower)に対応するアラート種別コードを解決する。
  # ThresholdEvaluationServiceがThreshold単体からalert_type_codeを組み立てる際の重複を避けるため
  # マッピングをAlertモデル自身に持たせる(db/seeds.rbのAlertType一覧が正)。
  def self.alert_type_code_for_threshold_direction(direction)
    case direction
    when "upper" then THRESHOLD_UPPER_BREACH_ALERT_TYPE_CODE
    when "lower" then THRESHOLD_LOWER_BREACH_ALERT_TYPE_CODE
    else raise ArgumentError, "unexpected threshold direction: #{direction.inspect}"
    end
  end
end
