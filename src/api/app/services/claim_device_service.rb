# requirements.md 1.6 F1 claim_device 手順3-6:
# ESP32が提出したクレームコードを照合し、成立したらdeviceレコード(provisioning状態)を作成して
# 長寿命デバイストークンを発行する。失敗はfail_countに記録し、累計5回で即時失効させる(総当たり対策)。
# IP単位のレート制限も別途併用する。
class ClaimDeviceService
  # 照合失敗の理由をerror_codeとして保持する(Api::DeviceClaimsControllerでHTTPステータス・
  # Errorスキーマのcodeにマッピングする。openapi.yaml Errorスキーマ: 機械可読なcode)。
  class InvalidCodeError < StandardError
    attr_reader :error_code

    def initialize(error_code, message)
      @error_code = error_code
      super(message)
    end
  end

  class RateLimitedError < StandardError; end

  Result = Struct.new(:device, :raw_token, keyword_init: true)

  IP_LIMIT = 20
  IP_PERIOD = 10.minutes

  # requirements.md F1手順5: IP単位のクレーム試行レート制限。
  # MVPは単一Pumaプロセス運用のため、プロセス内メモリのスライディングウィンドウで十分と判断する
  # (規模拡大時はRedis等の共有ストアに置換する。architecture.md「規模に応じた拡張」参照)。
  # 状態はこのクラス自身のスコープに閉じ込め、外部からは`reset_all!`(テスト専用)以外で触らせない。
  class RateLimiter
    # 全キーを走査してウィンドウ切れのエントリを回収する最短間隔(Issue #53 A-5)。
    # リクエストごとに全走査すると、追跡中の識別子数に比例してホットパスが重くなるため、
    # スイープはこの間隔に1回だけ行う。ウィンドウ判定自体は毎回そのキーに対して行うので、
    # 回収が遅れてもレート制限がすり抜けることはない(遅れて回収されるだけ)。
    SWEEP_INTERVAL = 1.minute

    MUTEX = Mutex.new
    # full_key => { timestamps: [Time], expires_at: Time }
    # expires_at はそのエントリを記録したスコープのperiodに基づく期限。scopeごとにperiodが
    # 異なっても、他スコープのスイープが有効なエントリを巻き込んで消さないようにするため、
    # 期間そのものではなく「いつ回収してよいか」をエントリ側に持たせる。
    ATTEMPTS = {}
    # 最後にスイープした時刻と、スイープの実行回数(スイープ頻度をテストで検証するため)。
    # クラス外からは触れない状態としてこのクラスのスコープに閉じ込める。
    SWEEP_STATE = { last_swept_at: nil, count: 0 }
    private_constant :MUTEX, :ATTEMPTS, :SWEEP_STATE

    def initialize(scope:, limit:, period:)
      @scope = scope
      @limit = limit
      @period = period
    end

    def exceeded?(identifier)
      full_key = "#{@scope}:#{identifier}"

      MUTEX.synchronize do
        now = Time.current
        sweep_expired_entries(now)

        window_start = now - @period
        entry = ATTEMPTS[full_key]
        timestamps = entry ? entry[:timestamps].select { |recorded_at| recorded_at > window_start } : []
        timestamps << now
        ATTEMPTS[full_key] = { timestamps: timestamps, expires_at: now + @period }
        timestamps.size > @limit
      end
    end

    # テスト専用: スペック間で試行回数が漏れ伝わらないようにする。
    def self.reset_all!
      MUTEX.synchronize do
        ATTEMPTS.clear
        SWEEP_STATE[:last_swept_at] = nil
        SWEEP_STATE[:count] = 0
      end
    end

    # 追跡中の識別子数。メモリが単調増加していないことを検証するために公開する
    # (spec/services/rate_limiter_spec.rb)。
    def self.tracked_entry_count
      MUTEX.synchronize { ATTEMPTS.size }
    end

    # スイープの実行回数。スイープ間隔が守られていることを検証するために公開する。
    def self.sweep_count
      MUTEX.synchronize { SWEEP_STATE[:count] }
    end

    private

    # ウィンドウを過ぎたエントリを回収する。これが無いと、識別子(IP)を変えながら
    # 叩き続けるだけでATTEMPTSが単調増加し、メモリ枯渇を招く(OWASP A05相当のDoS経路)。
    # 呼び出し元でMUTEXを保持している前提。
    def sweep_expired_entries(now)
      last_swept_at = SWEEP_STATE[:last_swept_at]
      return if last_swept_at && last_swept_at > now - SWEEP_INTERVAL

      SWEEP_STATE[:last_swept_at] = now
      SWEEP_STATE[:count] += 1

      expired_keys = ATTEMPTS.select { |_key, entry| entry[:expires_at] <= now }.keys
      return if expired_keys.empty?

      expired_keys.each { |key| ATTEMPTS.delete(key) }
      Rails.logger.info("[RateLimiter] swept #{expired_keys.size} expired entries, #{ATTEMPTS.size} remaining")
    end
  end

  def initialize(code:, ip:)
    @code = code
    @ip = ip
  end

  def call
    if rate_limiter.exceeded?(@ip)
      Rails.logger.warn("[ClaimDeviceService] rate limited ip=#{@ip}")
      raise RateLimitedError, "Too many claim attempts from this IP address."
    end

    # OWASP A09対策: 監査・不正検知のトレースのため、生コード自体はログに残さない
    # (コードはこの後15分間有効な秘密情報のため)。claim_code.idのみを追跡キーとして使う。
    claim_code = ClaimCode.find_by(code: @code)
    unless claim_code
      Rails.logger.warn("[ClaimDeviceService] claim attempt with unknown code ip=#{@ip}")
      raise InvalidCodeError.new("claim_code_not_found", "No claim code matches the submitted value.")
    end

    # 失敗系のfail_count加算・成功系のmark_used!は必ずコミットさせる必要があるため、
    # with_lockのトランザクション内では例外を発生させず結果(outcome)として返す。
    # (トランザクション内で例外raiseすると、直前のregister_failure!までロールバックされてしまう)
    outcome = claim_code.with_lock { evaluate_and_claim(claim_code) }
    Rails.logger.info("[ClaimDeviceService] claim_code_id=#{claim_code.id} ip=#{@ip} outcome=#{outcome.fetch(:ok) ? 'success' : outcome.fetch(:error_code)}")
    handle_outcome(outcome)
  end

  private

  def rate_limiter
    RateLimiter.new(scope: "device_claim", limit: IP_LIMIT, period: IP_PERIOD)
  end

  # with_lockのブロック内(行ロック取得後)で最新状態を前提に判定する。
  # 「同時クレーム」で2つのリクエストが競合しても、片方はロック待ちの後に
  # used_at済みの状態を読むため、二重成立しない。
  def evaluate_and_claim(claim_code)
    return failure("claim_code_locked", "Claim code was locked after repeated failed attempts.") if claim_code.exhausted?

    if claim_code.used?
      claim_code.register_failure!
      return failure("claim_code_used", "Claim code has already been used.")
    end

    if claim_code.expired?
      claim_code.register_failure!
      return failure("claim_code_expired", "Claim code has expired.")
    end

    device, raw_token = Device.provision_for_site!(claim_code.site)
    claim_code.mark_used!
    success(Result.new(device: device, raw_token: raw_token))
  end

  def success(result) = { ok: true, result: result }
  def failure(error_code, message) = { ok: false, error_code: error_code, message: message }

  def handle_outcome(outcome)
    return outcome.fetch(:result) if outcome.fetch(:ok)

    raise InvalidCodeError.new(outcome.fetch(:error_code), outcome.fetch(:message))
  end
end
