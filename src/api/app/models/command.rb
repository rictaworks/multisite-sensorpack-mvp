class Command < ApplicationRecord
  ORIGINS = %w[manual auto].freeze
  STATUSES = %w[pending delivered done expired].freeze

  # requirements.md F5: TTL10分。ピギーバック配信は1レスポンスあたり最大5件。
  TTL_MINUTES = 10
  PIGGYBACK_LIMIT = 5

  belongs_to :device
  belongs_to :command_type, foreign_key: :command_type_code, primary_key: :code, inverse_of: :commands

  # requirements.md F5: 冪等ID(idempotency_key)で重複ACKを無視する。TTL10分。
  validates :idempotency_key, presence: true, uniqueness: true
  validates :origin, presence: true, inclusion: { in: ORIGINS }
  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :issued_at, presence: true
  validates :expires_at, presence: true

  scope :pending_only, -> { where(status: "pending") }
  scope :not_expired, -> { where("expires_at > ?", Time.current) }

  # requirements.md F5 受け入れ条件: ピギーバック配信対象はissued_at昇順・最大5件、未配信(pending)のみ。
  scope :deliverable, -> { pending_only.not_expired.order(issued_at: :asc, id: :asc).limit(PIGGYBACK_LIMIT) }

  # requirements.md F5 受け入れ条件: TTL超過の未配信・未ACKコマンド(pending/delivered、doneに至っていないもの)は
  # expiredになる。「未配信」(pending)と「配信済みだが未ACK」(delivered)の両方を対象とする
  # (配信レスポンス自体がネットワーク上で失われるケースも、ACKが届かない限り放置しないため)。
  scope :overdue, -> { where(status: %w[pending delivered]).where("expires_at <= ?", Time.current) }

  # requirements.md F5 手順2: pending -> delivered(ピギーバック配信時)。
  # 想定外の状態からの呼び出しはフォールバックで握りつぶさず、明示的に例外化する(Fail Fast)。
  def mark_delivered!
    raise "Command##{id}: cannot mark_delivered! from status=#{status.inspect}" unless status == "pending"

    update!(status: "delivered")
    Rails.logger.info(
      "[Command##{id}] pending -> delivered (device_id=#{device_id}, command_type_code=#{command_type_code})"
    )
  end

  # requirements.md F5 手順3: ESP32からのACKでdoneにする。
  # 同一冪等IDの重複ACKは無視する(受け入れ条件)ため、既にdoneであれば冪等な無処理とする。
  # 既にTTL失効(expired)済みのコマンドへの遅延ACKも、doneへ復活させずログのみ残す。
  def mark_done!
    case status
    when "pending", "delivered"
      previous_status = status
      update!(status: "done")
      Rails.logger.info(
        "[Command##{id}] #{previous_status} -> done via ACK (device_id=#{device_id}, idempotency_key=#{idempotency_key})"
      )
    when "done"
      Rails.logger.info(
        "[Command##{id}] duplicate ACK ignored, already done (idempotency_key=#{idempotency_key})"
      )
    when "expired"
      Rails.logger.warn(
        "[Command##{id}] ACK received for an already TTL-expired command, ignoring (idempotency_key=#{idempotency_key})"
      )
    else
      raise "Command##{id}: unexpected status encountered in mark_done!: #{status.inspect}"
    end
  end

  # requirements.md F5 受け入れ条件: TTL超過の未配信・未ACKコマンドはexpiredになる。
  # 既にexpired済みなら冪等な無処理(CommandDispatchServiceの定期的な掃引から複数回呼ばれても安全)。
  def mark_expired!
    return if status == "expired"

    previous_status = status
    update!(status: "expired")
    Rails.logger.info(
      "[Command##{id}] #{previous_status} -> expired (TTL exceeded, device_id=#{device_id}, expires_at=#{expires_at})"
    )
  end
end
