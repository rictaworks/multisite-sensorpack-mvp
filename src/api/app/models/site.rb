class Site < ApplicationRecord
  belongs_to :user
  has_many :devices, dependent: :restrict_with_exception
  has_many :claim_codes, dependent: :restrict_with_exception

  # requirements.md 1.4: 拠点名は自由入力ラベル。住所入力を強制するバリデーションは設けない。
  validates :name, presence: true
end
