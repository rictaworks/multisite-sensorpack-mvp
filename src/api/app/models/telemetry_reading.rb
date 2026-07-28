class TelemetryReading < ApplicationRecord
  belongs_to :device

  # requirements.md F2: 値域 温度-40〜85℃・湿度0〜100%。device_id+seqで重複排除。
  validates :seq, presence: true, uniqueness: { scope: :device_id }
  validates :temperature_c, presence: true,
            numericality: { greater_than_or_equal_to: -40, less_than_or_equal_to: 85 }
  validates :humidity_pct, presence: true,
            numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }
  validates :recorded_at, presence: true
end
