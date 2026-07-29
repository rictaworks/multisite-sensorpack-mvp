# セッションのサーバー側失効(ログアウト・cookie漏洩時の無効化)を可能にするカウンタ。
#
# セッションcookieにこの値を埋め込み、リクエストごとにDBの現在値と照合する。
# ログアウト時に加算することで、発行済みのcookieを一括で失効させられる
# (.claude/OWASP10.md A07: 認証・認可の欠陥)。
#
# requirements.md 1.4「google_subのみを保持し個人情報を保存しない」方針とは矛盾しない。
# 個人を識別しうる情報ではなく、セッション管理のための内部カウンタであるため。
class AddSessionTokenVersionToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :session_token_version, :integer, null: false, default: 0
  end
end
