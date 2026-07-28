class Threshold < ApplicationRecord
  DIRECTIONS = %w[upper lower].freeze
  BREACH_STATES = %w[NORMAL BREACHED].freeze
  NORMAL = "NORMAL".freeze
  BREACHED = "BREACHED".freeze

  # requirements.md F3 手順3-4: 発報・解除とも連続3回の成立が必要(単発スパイクでは発報しない)。
  CONSECUTIVE_REQUIRED = 3

  belongs_to :device
  belongs_to :sensor_type, foreign_key: :sensor_type_code, primary_key: :code, inverse_of: :thresholds

  # requirements.md F3: 方向(upper/lower)・ヒステリシス状態(NORMAL/BREACHED)。
  validates :direction, presence: true, inclusion: { in: DIRECTIONS }
  validates :trigger_value, presence: true
  validates :deadband, presence: true, numericality: { greater_than_or_equal_to: 0 }
  validates :breach_state, presence: true, inclusion: { in: BREACH_STATES }
  validates :consecutive_count, presence: true,
            numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :sensor_type_code, uniqueness: { scope: [ :device_id, :direction ] }

  # requirements.md F3 手順3: 上限は value > 閾値、下限は value < 閾値(境界値ちょうどは正常)。
  def breach_condition?(value)
    case direction
    when "upper" then value > trigger_value
    when "lower" then value < trigger_value
    else raise "unexpected threshold direction: #{direction.inspect}"
    end
  end

  # requirements.md F3 手順4: 上限は「発報閾値-デッドバンド」以下、下限は「発報閾値+デッドバンド」以上。
  def release_condition?(value)
    case direction
    when "upper" then value <= (trigger_value - deadband)
    when "lower" then value >= (trigger_value + deadband)
    else raise "unexpected threshold direction: #{direction.inspect}"
    end
  end

  # requirements.md F3 手順3-4 / クラス図 Threshold#evaluate(): 1回分のテレメトリ値をヒステリシス状態機械に適用する。
  # NORMAL中は発報条件、BREACHED中は解除条件が連続何回成立したかをconsecutive_countで追跡し、
  # 3回に達したら状態遷移する。条件を満たさない読み取りが来た場合は連続回数をリセットする
  # (単発スパイク・デッドバンド内往復で誤って発報/解除しないため、requirements.md 1.9 Bカテゴリ)。
  #
  # 戻り値: :breached(NORMAL->BREACHED遷移が成立) / :released(BREACHED->NORMAL遷移が成立) / nil(状態維持)。
  # アラートのopen/close自体はこのメソッドの責務外(呼び出し元のThresholdEvaluationServiceが行う)。
  def register_reading!(value)
    case breach_state
    when NORMAL
      advance_or_reset!(condition_met: breach_condition?(value), confirmed_state: BREACHED, confirmed_result: :breached)
    when BREACHED
      advance_or_reset!(condition_met: release_condition?(value), confirmed_state: NORMAL, confirmed_result: :released)
    else
      raise "unexpected threshold breach_state: #{breach_state.inspect}"
    end
  end

  private

  def advance_or_reset!(condition_met:, confirmed_state:, confirmed_result:)
    unless condition_met
      update!(consecutive_count: 0) if consecutive_count != 0
      return nil
    end

    new_count = consecutive_count + 1
    if new_count >= CONSECUTIVE_REQUIRED
      update!(consecutive_count: 0, breach_state: confirmed_state)
      confirmed_result
    else
      update!(consecutive_count: new_count)
      nil
    end
  end
end
