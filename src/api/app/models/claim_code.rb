class ClaimCode < ApplicationRecord
  belongs_to :user
  belongs_to :site

  # requirements.md F1: 8桁英数字。fail_countが5回で失効。expires_atは発行+15分。
  validates :code, presence: true, uniqueness: true
  validates :fail_count, presence: true,
            numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :expires_at, presence: true
end
