class AlertSeverity < ApplicationRecord
  self.primary_key = "code"

  # requirements.md 1.7: マスタ3件(info/warning/critical)
  has_many :alerts, foreign_key: :severity_code, inverse_of: :alert_severity,
                     dependent: :restrict_with_exception

  validates :code, presence: true, uniqueness: true
  validates :name, presence: true
end
