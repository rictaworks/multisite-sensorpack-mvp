class User < ApplicationRecord
  # requirements.md 1.4: google_subのみ保持し、メールアドレス等は保存しない。
  has_many :sites, dependent: :restrict_with_exception
  has_many :claim_codes, dependent: :restrict_with_exception
  has_many :ai_summaries, dependent: :restrict_with_exception
  has_many :ai_quota_usages, dependent: :restrict_with_exception

  validates :google_sub, presence: true, uniqueness: true
end
