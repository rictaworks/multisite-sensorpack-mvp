class CreateDevices < ActiveRecord::Migration[8.1]
  # requirements.md F1/F2/F4: クレーム成立でprovisioning、初回テレメトリでonline、
  # 通信途絶でofflineに遷移する(状態遷移図6.1)。expected_interval_secの既定は60秒。
  def change
    create_table :devices do |t|
      t.references :site, null: false, foreign_key: true
      t.string :status_code, null: false, default: "provisioning"
      t.string :device_token_digest, null: false
      t.integer :expected_interval_sec, null: false, default: 60
      t.datetime :last_seen_at
      t.boolean :deleted, null: false, default: false

      t.foreign_key :device_statuses, column: :status_code, primary_key: :code

      t.timestamps
    end

    add_index :devices, :status_code
    add_index :devices, :device_token_digest, unique: true
  end
end
