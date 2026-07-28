# Google ID トークン(JWT)を検証し、Googleのopaqueな sub 値を取り出すサービス。
#
# JWT署名検証・JWKS(Google公開鍵)取得は自前実装せず、Google公式・実績のあるOSSである
# googleauth gem (Google::Auth::IDTokens.verify_oidc) に委譲する
# (.claude/rules/architecture.md: 安全で実績のあるOSSを優先し、車輪の再発明を避ける)。
#
# requirements.md 1.4節: DBにはGoogleのopaqueなsub値のみを保存し、
# メールアドレス・氏名等は一切保存しない。本サービスもsub値以外はペイロードから取り出さない。
class GoogleIdTokenVerifier
  class VerificationFailed < StandardError; end

  def self.verify_sub(id_token)
    new.verify_sub(id_token)
  end

  def verify_sub(id_token)
    raise VerificationFailed, "id_token is blank" if id_token.blank?

    payload = verify_with_google(id_token)
    sub = payload["sub"]
    raise VerificationFailed, "verified payload is missing the sub claim" if sub.blank?

    Rails.logger.info("[GoogleIdTokenVerifier] verification succeeded sub=#{mask(sub)}")
    sub
  end

  private

  def verify_with_google(id_token)
    Google::Auth::IDTokens.verify_oidc(id_token, aud: client_id)
  rescue Google::Auth::IDTokens::VerificationError => e
    # フォールバックせず、失敗理由を明示的にログへ残したうえで例外として再送出する(Fail Fast)。
    Rails.logger.warn("[GoogleIdTokenVerifier] verification failed: #{e.class}: #{e.message}")
    raise VerificationFailed, e.message
  end

  def client_id
    Rails.application.config.x.google_oauth_client_id
  end

  # ログにsub値をそのまま残さないための部分マスク(OWASP A09: 機微情報のログ出力対策)。
  def mask(sub)
    return "" if sub.blank?

    "#{sub[0, 4]}...(#{sub.length}chars)"
  end
end
