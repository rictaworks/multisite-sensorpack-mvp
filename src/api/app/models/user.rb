class User < ApplicationRecord
  # requirements.md 1.4: google_subのみ保持し、メールアドレス等は保存しない。
  has_many :sites, dependent: :restrict_with_exception
  has_many :claim_codes, dependent: :restrict_with_exception
  has_many :ai_summaries, dependent: :restrict_with_exception
  has_many :ai_quota_usages, dependent: :restrict_with_exception

  validates :google_sub, presence: true, uniqueness: true
  validates :session_token_version, presence: true,
            numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  # このユーザーに対して発行済みのセッションcookieをすべて失効させる。
  #
  # cookieにはsession_token_versionが埋め込まれており(concerns/authenticatable.rb)、
  # リクエストごとにDBの現在値と照合される。加算すると既存cookieはすべて不一致になり、
  # 有効期限(SESSION_TTL)を待たずに無効化できる。
  #
  # ログアウトは「その端末だけ」ではなく全端末のセッションを失効させる挙動になる。
  # cookieを窃取された場合にユーザー自身が自衛できることを優先した意図的な設計判断であり、
  # 端末個別のログアウトが必要になった時点でセッションレコードを別テーブルへ切り出す
  # (現行のMVP規模では、失効漏れのリスクを負ってまで作り込む段階ではない)。
  def revoke_all_sessions!
    increment!(:session_token_version)
    Rails.logger.info(
      "[User#revoke_all_sessions!] user_id=#{id} session_token_version=#{session_token_version}"
    )
  end
end
