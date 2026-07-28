class ClaimCode < ApplicationRecord
  # requirements.md F1: 8桁英数字。fail_countが5回で失効。expires_atは発行+15分。
  CODE_LENGTH = 8
  CODE_CHARSET = ("A".."Z").to_a + ("0".."9").to_a
  MAX_FAIL_COUNT = 5
  EXPIRY_DURATION = 15.minutes

  belongs_to :user
  belongs_to :site

  validates :code, presence: true, uniqueness: true, format: { with: /\A[A-Z0-9]{#{CODE_LENGTH}}\z/ }
  validates :fail_count, presence: true,
            numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :expires_at, presence: true

  # requirements.md F1手順1-2: reCAPTCHA通過後にユーザー・拠点に紐づく8桁コードを
  # 有効期限15分で発行する。コード自体の一意性はDB制約(index_claim_codes_on_code)でも担保する。
  def self.issue!(user:, site:)
    create!(user: user, site: site, code: generate_unique_code, expires_at: EXPIRY_DURATION.from_now)
  end

  def self.generate_unique_code
    loop do
      candidate = Array.new(CODE_LENGTH) { CODE_CHARSET.sample }.join
      break candidate unless exists?(code: candidate)
    end
  end

  def expired?
    expires_at <= Time.current
  end

  def used?
    used_at.present?
  end

  # requirements.md F1手順5: 総当たり対策。同一コードへの照合失敗が累計5回に達すると即時失効する。
  def exhausted?
    fail_count >= MAX_FAIL_COUNT
  end

  def usable?
    !used? && !expired? && !exhausted?
  end

  def register_failure!
    increment!(:fail_count)
  end

  def mark_used!
    update!(used_at: Time.current)
  end
end
