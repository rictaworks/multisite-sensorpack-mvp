class Alert < ApplicationRecord
  STATUSES = %w[open acknowledged closed].freeze

  # closeはユーザー操作から行えず、閾値/オフラインの解除条件成立時の自動処理のみで行う
  # (requirements.md 1.6 F8、#9・#10で実装)。手動closeを試みた場合に送出する例外。
  class AlreadyClosedError < StandardError; end

  belongs_to :device
  belongs_to :alert_type, foreign_key: :alert_type_code, primary_key: :code, inverse_of: :alerts
  belongs_to :alert_severity, foreign_key: :severity_code, primary_key: :code, inverse_of: :alerts

  # requirements.md F8: open -> acknowledged -> closed、または open -> closed(自動)。
  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :opened_at, presence: true

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
end
