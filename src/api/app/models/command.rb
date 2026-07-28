class Command < ApplicationRecord
  ORIGINS = %w[manual auto].freeze
  STATUSES = %w[pending delivered done expired].freeze

  belongs_to :device
  belongs_to :command_type, foreign_key: :command_type_code, primary_key: :code, inverse_of: :commands

  # requirements.md F5: 冪等ID(idempotency_key)で重複ACKを無視する。TTL10分。
  validates :idempotency_key, presence: true, uniqueness: true
  validates :origin, presence: true, inclusion: { in: ORIGINS }
  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :issued_at, presence: true
  validates :expires_at, presence: true
end
