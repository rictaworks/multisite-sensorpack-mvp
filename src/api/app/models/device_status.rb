class DeviceStatus < ApplicationRecord
  self.primary_key = "code"

  # requirements.md 1.7: マスタ3件(provisioning/online/offline)
  has_many :devices, foreign_key: :status_code, inverse_of: :device_status,
                      dependent: :restrict_with_exception

  validates :code, presence: true, uniqueness: true
  validates :name, presence: true
end
