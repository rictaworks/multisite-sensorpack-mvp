class AlertType < ApplicationRecord
  self.primary_key = "code"

  # requirements.md 1.7: マスタ3件(上限超過/下限逸脱/オフライン)
  has_many :alerts, foreign_key: :alert_type_code, inverse_of: :alert_type,
                     dependent: :restrict_with_exception

  validates :code, presence: true, uniqueness: true
  validates :name, presence: true
end
