# Be sure to restart your server when you modify this file.

# Configure parameters to be partially matched (e.g. passw matches password) and filtered from the log file.
# Use this to limit dissemination of sensitive information.
# See the ActiveSupport::ParameterFilter documentation for supported notations and behaviors.
Rails.application.config.filter_parameters += [
  :passw, :email, :secret, :token, :_key, :crypt, :salt, :certificate, :otp, :ssn, :cvv, :cvc,
  # クレームコード(POST /api/v1/devices/claim の`code`)は発行から15分間有効な秘密情報であり、
  # これを知る者がデバイスをクレームできてしまう(requirements.md F1手順3-6)。
  # ClaimDeviceServiceは意図的に生コードをログへ出していないが、Railsが自動出力する
  # リクエストパラメータのログには残るため、ここで併せて伏せる
  # (.claude/OWASP10.md A09: セキュリティログとモニタリングの失敗)。
  :code
]
