require "rails_helper"

# .claude/rules/i18n.md: 「新しいUI文言を追加する際は、7言語すべてのロケールファイルに
# キーを追加する」を機械的に保証する。片方の言語だけキーを足して他を忘れると、その言語の
# 利用者にだけ翻訳キー文字列(例: "translation missing: ...")が露出してしまうため。
#
# 例外: 開発者向け管理画面(F9)の`admin`名前空間は日本語のみでよい(同ルール)ため、
# 比較対象は`errors`名前空間(ユーザー向けAPIのエラーメッセージ)に限定する。
SUPPORTED_LOCALES = %i[ja en fr zh ru es ar].freeze
REFERENCE_LOCALE = :ja

# ActiveModel/ActiveRecordがen名前空間へ組み込みで持ち込む`errors.format`・`errors.messages`
# (バリデーションエラーの既定フォーマット)。アプリが定義した文言ではなくRails本体由来のため、
# 7言語整合性の比較対象から明示的に除外する。除外を暗黙のフィルタにせず定数化しておくことで、
# 将来アプリ側が同名キーを定義した場合に見落とさないようにする。
RAILS_BUILT_IN_ERROR_KEYS = %i[format messages].freeze

RSpec.describe "ロケールファイルの7言語整合性(.claude/rules/i18n.md)" do
  before { I18n.backend.load_translations }

  def error_translations_for(locale)
    I18n.backend.translations.fetch(locale).fetch(:errors).except(*RAILS_BUILT_IN_ERROR_KEYS)
  end

  it "7言語すべてのロケール定義が読み込まれている" do
    SUPPORTED_LOCALES.each do |locale|
      expect(I18n.backend.translations).to have_key(locale), "#{locale}.yml のロケール定義が見つかりません"
    end
  end

  SUPPORTED_LOCALES.reject { |locale| locale == REFERENCE_LOCALE }.each do |locale|
    it "#{locale} のerrorsキーが #{REFERENCE_LOCALE} と完全に一致する" do
      reference_keys = error_translations_for(REFERENCE_LOCALE).keys.sort
      target_keys = error_translations_for(locale).keys.sort

      expect(reference_keys - target_keys).to be_empty,
        "#{locale}.yml に翻訳が不足しているキーがあります: #{(reference_keys - target_keys).inspect}"
      expect(target_keys - reference_keys).to be_empty,
        "#{locale}.yml に #{REFERENCE_LOCALE}.yml へ未追加のキーがあります: #{(target_keys - reference_keys).inspect}"
    end

    it "#{locale} のerrorsに空の翻訳(未翻訳のプレースホルダー)がない" do
      blank_keys = error_translations_for(locale).select { |_key, value| value.to_s.strip.empty? }.keys

      expect(blank_keys).to be_empty, "#{locale}.yml の値が空のキー: #{blank_keys.inspect}"
    end
  end
end
