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

  # requirements.md F5 受け入れ条件: ピギーバック配信はissued_at昇順・最大5件。
  describe ".deliverable(Issue #11)" do
    def create_pending!(issued_at:, expires_at: 10.minutes.from_now, command_type: nil)
      described_class.create!(
        device: device, command_type: command_type || self.command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "pending", issued_at: issued_at, expires_at: expires_at
      )
    end

    it "returns only pending, non-expired commands ordered by issued_at ascending, capped at 5" do
      base = 1.hour.ago
      commands = (1..7).map { |i| create_pending!(issued_at: base + i.minutes) }
      expired = create_pending!(issued_at: base, expires_at: 1.minute.ago)
      done_command = create_pending!(issued_at: base)
      done_command.update!(status: "done")

      result = device.commands.deliverable.to_a

      expect(result).to eq(commands.first(5))
      expect(result).not_to include(expired, done_command)
    end
  end

  describe ".overdue(Issue #11)" do
    it "includes pending and delivered commands past their TTL, excludes done/expired/not-yet-expired" do
      overdue_pending = described_class.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "pending", issued_at: 20.minutes.ago, expires_at: 1.minute.ago
      )
      overdue_delivered = described_class.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "delivered", issued_at: 20.minutes.ago, expires_at: 1.minute.ago
      )
      described_class.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "pending", issued_at: Time.current, expires_at: 9.minutes.from_now
      )
      described_class.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "done", issued_at: 20.minutes.ago, expires_at: 1.minute.ago
      )

      expect(device.commands.overdue.to_a).to contain_exactly(overdue_pending, overdue_delivered)
    end
  end

  describe "#mark_delivered!(Issue #11)" do
    it "transitions pending to delivered" do
      command = described_class.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "pending", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      command.mark_delivered!

      expect(command.reload.status).to eq("delivered")
    end

    it "raises if called from a non-pending status(fail fast on unexpected call order)" do
      command = described_class.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "done", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      expect { command.mark_delivered! }.to raise_error(RuntimeError)
    end
  end

  describe "#mark_done!(Issue #11: ACK処理)" do
    it "transitions pending or delivered to done" do
      command = described_class.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "delivered", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      command.mark_done!

      expect(command.reload.status).to eq("done")
    end

    it "重複ACK: is idempotent when already done" do
      command = described_class.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "done", issued_at: Time.current, expires_at: 10.minutes.from_now
      )

      expect { command.mark_done! }.not_to raise_error
      expect(command.reload.status).to eq("done")
    end

    it "does not resurrect an expired command back into done" do
      command = described_class.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "expired", issued_at: 20.minutes.ago, expires_at: 10.minutes.ago
      )

      expect { command.mark_done! }.not_to raise_error
      expect(command.reload.status).to eq("expired")
    end
  end

  describe "#mark_expired!(Issue #11: TTL失効)" do
    it "transitions pending to expired" do
      command = described_class.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "pending", issued_at: 20.minutes.ago, expires_at: 1.minute.ago
      )

      command.mark_expired!

      expect(command.reload.status).to eq("expired")
    end

    it "is idempotent when already expired" do
      command = described_class.create!(
        device: device, command_type: command_type, idempotency_key: SecureRandom.uuid,
        origin: "manual", status: "expired", issued_at: 20.minutes.ago, expires_at: 1.minute.ago
      )

      expect { command.mark_expired! }.not_to raise_error
    end
  end
end
