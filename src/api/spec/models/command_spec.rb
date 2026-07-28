require "rails_helper"
require "securerandom"

RSpec.describe Command, type: :model do
  let(:user) { User.create!(google_sub: "command-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "command-digest") }
  let(:command_type) { CommandType.find_by!(code: "FAN_ON") }

  describe "associations" do
    it { expect(described_class.reflect_on_association(:device).macro).to eq(:belongs_to) }
    it { expect(described_class.reflect_on_association(:command_type).macro).to eq(:belongs_to) }
  end

  describe "validations(requirements.md F5)" do
    it "defaults status to pending" do
      command = described_class.create!(
        device: device,
        command_type: command_type,
        idempotency_key: SecureRandom.uuid,
        origin: "manual",
        issued_at: Time.current,
        expires_at: 10.minutes.from_now
      )

      expect(command.status).to eq("pending")
    end

    it "rejects a duplicate idempotency_key(重複ACK無視の前提となる一意性)" do
      key = SecureRandom.uuid
      described_class.create!(
        device: device, command_type: command_type, idempotency_key: key,
        origin: "manual", issued_at: Time.current, expires_at: 10.minutes.from_now
      )
      duplicate = described_class.new(
        device: device, command_type: command_type, idempotency_key: key,
        origin: "auto", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      expect(duplicate).not_to be_valid
    end

    it "rejects an unknown origin" do
      command = described_class.new(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "scheduled", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      expect(command).not_to be_valid
    end
  end
end
