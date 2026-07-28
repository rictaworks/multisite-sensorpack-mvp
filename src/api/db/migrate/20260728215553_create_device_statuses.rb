class CreateDeviceStatuses < ActiveRecord::Migration[8.1]
  # requirements.md 1.7: デバイス状態マスタ(3件: provisioning/online/offline)
  def change
    create_table :device_statuses, id: :string, primary_key: :code do |t|
      t.string :name, null: false

      t.timestamps
    end
  end
end
