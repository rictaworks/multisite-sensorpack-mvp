require "rails_helper"

RSpec.describe User, type: :model do
  describe "associations" do
    it { expect(described_class.reflect_on_association(:sites).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:claim_codes).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:ai_summaries).macro).to eq(:has_many) }
    it { expect(described_class.reflect_on_association(:ai_quota_usages).macro).to eq(:has_many) }
  end

  describe "validations" do
    it "requires google_sub" do
      user = described_class.new(google_sub: nil)

      expect(user).not_to be_valid
      expect(user.errors[:google_sub]).to be_present
    end

    it "requires google_sub to be unique" do
      described_class.create!(google_sub: "user-spec-sub-1")
      duplicate = described_class.new(google_sub: "user-spec-sub-1")

      expect(duplicate).not_to be_valid
    end
  end

  describe "個人情報の非保持(requirements.md 1.4)" do
    it "個人を識別しうるカラムを一切持たない" do
      personal_information_columns = %w[
        email name given_name family_name full_name nickname
        phone phone_number address picture avatar_url locale birthday
      ]

      expect(described_class.column_names).not_to include(*personal_information_columns)
    end

    # ホワイトリストで固定し、意図せず個人情報カラムが増えることを防ぐ。
    # session_token_versionはセッション失効管理用の内部カウンタであり、
    # 個人を識別しうる情報ではない(app/models/user.rb #revoke_all_sessions! 参照)。
    it "保持するのはgoogle_subとセッション管理用カラムのみ" do
      expect(described_class.column_names)
        .to match_array(%w[id google_sub session_token_version created_at updated_at])
    end
  end

  describe "#revoke_all_sessions!(セッションのサーバー側失効)" do
    it "session_token_versionを加算し、発行済みcookieを失効させる" do
      user = described_class.create!(google_sub: "user-spec-revoke")

      expect { user.revoke_all_sessions! }.to change { user.reload.session_token_version }.by(1)
    end

    it "新規ユーザーのsession_token_versionは0から始まる" do
      user = described_class.create!(google_sub: "user-spec-initial-version")

      expect(user.session_token_version).to eq(0)
    end
  end
end
