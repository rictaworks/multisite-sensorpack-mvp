class SensorType < ApplicationRecord
  self.primary_key = "code"

  # requirements.md 1.7: マスタ2件(temperature, humidity)
  has_many :thresholds, foreign_key: :sensor_type_code, inverse_of: :sensor_type,
                         dependent: :restrict_with_exception
  has_many :hourly_aggregates, foreign_key: :sensor_type_code, inverse_of: :sensor_type,
                                dependent: :restrict_with_exception

  validates :code, presence: true, uniqueness: true
  validates :name, presence: true
end
