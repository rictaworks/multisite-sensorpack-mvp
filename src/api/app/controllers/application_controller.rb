class ApplicationController < ActionController::API
  # APIモードでは既定で除外されるcookies機能を有効化する(Issue #7: セッションcookie用)。
  include ActionController::Cookies
end
