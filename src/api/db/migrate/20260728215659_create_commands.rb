class CreateCommands < ActiveRecord::Migration[8.1]
  # requirements.md F5: 冪等ID(idempotency_key)付きコマンド。origin(manual/auto)、
  # status(pending/delivered/done/expired)、TTL10分(expires_at)。
  # idempotency_keyはUUID文字列だが、開発(SQLite)・本番(PostgreSQL)両対応のため
  # ネイティブuuid型ではなくstring型で保持する(requirements.md 8節)。
  def change
    create_table :commands do |t|
      t.references :device, null: false, foreign_key: true
      t.string :command_type_code, null: false
      t.string :idempotency_key, null: false
      t.string :origin, null: false
      t.string :status, null: false, default: "pending"
      t.datetime :issued_at, null: false
      t.datetime :expires_at, null: false

      t.foreign_key :command_types, column: :command_type_code, primary_key: :code

      t.timestamps
    end

    add_index :commands, :command_type_code
    add_index :commands, :idempotency_key, unique: true
    add_index :commands, :status
  end
end
