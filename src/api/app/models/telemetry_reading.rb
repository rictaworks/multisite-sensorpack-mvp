class TelemetryReading < ApplicationRecord
  belongs_to :device

  # requirements.md F2 手順4: DHT22想定の値域(温度-40〜85℃・湿度0〜100%)。
  # TelemetryIngestServiceの値域外チェックとバリデーションで同一の範囲定数を共有する(DRY)。
  TEMPERATURE_RANGE = (-40..85).freeze
  HUMIDITY_RANGE = (0..100).freeze

  # requirements.md F2: 値域 温度-40〜85℃・湿度0〜100%。device_id+seqで重複排除。
  validates :seq, presence: true, uniqueness: { scope: :device_id }
  validates :temperature_c, presence: true,
            numericality: { greater_than_or_equal_to: TEMPERATURE_RANGE.min, less_than_or_equal_to: TEMPERATURE_RANGE.max }
  validates :humidity_pct, presence: true,
            numericality: { greater_than_or_equal_to: HUMIDITY_RANGE.min, less_than_or_equal_to: HUMIDITY_RANGE.max }
  validates :recorded_at, presence: true

  # requirements.md F2 手順4: 逸脱データを保存前に判別するために使う
  # (TelemetryIngestServiceがバリデーションエラーではなくaccepted=falseの200として扱うため)。
  def self.within_range?(temperature_c:, humidity_pct:)
    TEMPERATURE_RANGE.cover?(temperature_c) && HUMIDITY_RANGE.cover?(humidity_pct)
  end
end
