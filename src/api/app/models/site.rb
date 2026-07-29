class Site < ApplicationRecord
  belongs_to :user
  has_many :devices, dependent: :restrict_with_exception
  has_many :claim_codes, dependent: :restrict_with_exception

  # 拠点名の最大長。src/shared/contracts/openapi.yaml components.schemas.Site.name の
  # maxLength と一致させる(契約と実装が食い違うと、契約上は通るはずの入力が500になる)。
  NAME_MAX_LENGTH = 100

  # requirements.md 1.4: 拠点名は自由入力ラベル。住所入力を強制するバリデーションは設けない。
  validates :name, presence: true, length: { maximum: NAME_MAX_LENGTH }

  # 拠点とその配下デバイスを論理削除する(openapi.yaml deleteSite:
  # 「拠点を論理削除する（配下デバイスも論理削除対象）」)。
  #
  # テレメトリ・アラート等の履歴は監査のため残すため物理削除はしない。デバイスの
  # 関連付けは `dependent: :restrict_with_exception` であり、物理削除は元々できない。
  #
  # 拠点だけが削除済みでデバイスが生き残る中途半端な状態を作らないよう、
  # 2つの更新を1トランザクションにまとめる。
  # 既に削除済みの場合も同じ結果に収束する(DELETEの冪等性)。
  def soft_delete!
    transaction do
      devices.where(deleted: false).update_all(deleted: true, updated_at: Time.current)
      update!(deleted: true)
    end

    Rails.logger.info("[Site#soft_delete!] site_id=#{id} user_id=#{user_id} soft-deleted with its devices")
  end
end
