class HourlyAggregate < ApplicationRecord
  belongs_to :device
  belongs_to :sensor_type, foreign_key: :sensor_type_code, primary_key: :code, inverse_of: :hourly_aggregates

  validates :hour_bucket, presence: true,
            uniqueness: { scope: [ :device_id, :sensor_type_code ] }
  validates :min_value, presence: true
  validates :max_value, presence: true
  validates :avg_value, presence: true
end
