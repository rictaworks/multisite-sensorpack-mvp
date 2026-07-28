class Device < ApplicationRecord
  belongs_to :site
  belongs_to :device_status, foreign_key: :status_code, primary_key: :code, inverse_of: :devices

  has_many :telemetry_readings, dependent: :restrict_with_exception
  has_many :hourly_aggregates, dependent: :restrict_with_exception
  has_many :thresholds, dependent: :restrict_with_exception
  has_many :alerts, dependent: :restrict_with_exception
  has_many :commands, dependent: :restrict_with_exception
  has_one :automation_rule, dependent: :restrict_with_exception

  validates :device_token_digest, presence: true, uniqueness: true
  validates :expected_interval_sec, presence: true,
            numericality: { only_integer: true, greater_than: 0 }
end
