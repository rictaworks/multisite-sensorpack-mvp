class Alert < ApplicationRecord
  STATUSES = %w[open acknowledged closed].freeze

  belongs_to :device
  belongs_to :alert_type, foreign_key: :alert_type_code, primary_key: :code, inverse_of: :alerts
  belongs_to :alert_severity, foreign_key: :severity_code, primary_key: :code, inverse_of: :alerts

  # requirements.md F8: open -> acknowledged -> closed、または open -> closed(自動)。
  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :opened_at, presence: true
end
