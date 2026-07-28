class Alert < ApplicationRecord
  STATUSES = %w[open acknowledged closed].freeze

  belongs_to :device
  belongs_to :alert_type, foreign_key: :alert_type_code, primary_key: :code, inverse_of: :alerts
  belongs_to :alert_severity, foreign_key: :severity_code, primary_key: :code, inverse_of: :alerts

  # requirements.md F8: open -> acknowledged -> closed、または open -> closed(自動)。
  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :opened_at, presence: true

  # requirements.md F4/F3: オフライン復帰・閾値解除の判定はopen中のアラートのみを対象にする。
  scope :open, -> { where(status: "open") }

  # requirements.md F4 手順4-5 / クラス図 Alert#autoClose(): 解除条件成立(オフライン復帰・閾値解除)による自動クローズ。
  # 既にclosed済みなら何もしない(冪等。二重クローズでclosed_atを上書きしない)。
  def auto_close!
    return if status == "closed"

    Rails.logger.info("[Alert##{id}] 解除条件成立によりclosedへ自動遷移します(alert_type_code=#{alert_type_code})")
    update!(status: "closed", closed_at: Time.current)
  end
end
