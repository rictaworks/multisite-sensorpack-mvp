class ActuatorType < ApplicationRecord
  self.primary_key = "code"

  # requirements.md 1.7: マスタ2件(LED, ファン)。command_typesが分類として参照する。
  has_many :command_types, foreign_key: :actuator_type_code, inverse_of: :actuator_type,
                            dependent: :restrict_with_exception

  validates :code, presence: true, uniqueness: true
  validates :name, presence: true
end
