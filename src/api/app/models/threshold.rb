class Threshold < ApplicationRecord
  DIRECTIONS = %w[upper lower].freeze
  BREACH_STATES = %w[NORMAL BREACHED].freeze

  belongs_to :device
  belongs_to :sensor_type, foreign_key: :sensor_type_code, primary_key: :code, inverse_of: :thresholds

  # requirements.md F3: 方向(upper/lower)・ヒステリシス状態(NORMAL/BREACHED)。
  # 具体的な発報・解除ロジックは各機能issueで実装する(ここでは整合性のみ検証)。
  validates :direction, presence: true, inclusion: { in: DIRECTIONS }
  validates :trigger_value, presence: true
  validates :deadband, presence: true, numericality: { greater_than_or_equal_to: 0 }
  validates :breach_state, presence: true, inclusion: { in: BREACH_STATES }
  validates :consecutive_count, presence: true,
            numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :sensor_type_code, uniqueness: { scope: [ :device_id, :direction ] }
end
