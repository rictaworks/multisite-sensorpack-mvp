class CommandType < ApplicationRecord
  self.primary_key = "code"

  # requirements.md 1.7: マスタ4件(LED_ON/LED_OFF/FAN_ON/FAN_OFF)
  belongs_to :actuator_type, foreign_key: :actuator_type_code, primary_key: :code, inverse_of: :command_types
  has_many :commands, foreign_key: :command_type_code, inverse_of: :command_type,
                       dependent: :restrict_with_exception

  validates :code, presence: true, uniqueness: true
  validates :name, presence: true
end
