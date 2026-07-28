# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_07_28_215724) do
  create_table "actuator_types", primary_key: "code", id: :string, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
  end

  create_table "ai_quota_usages", force: :cascade do |t|
    t.datetime "consumed_at", null: false
    t.datetime "created_at", null: false
    t.date "quota_date", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["user_id", "quota_date"], name: "index_ai_quota_usages_on_user_id_and_quota_date", unique: true
    t.index ["user_id"], name: "index_ai_quota_usages_on_user_id"
  end

  create_table "ai_summaries", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.date "quota_date", null: false
    t.text "summary_text", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["user_id", "quota_date"], name: "index_ai_summaries_on_user_id_and_quota_date", unique: true
    t.index ["user_id"], name: "index_ai_summaries_on_user_id"
  end

  create_table "alert_severities", primary_key: "code", id: :string, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
  end

  create_table "alert_types", primary_key: "code", id: :string, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
  end

  create_table "alerts", force: :cascade do |t|
    t.datetime "acknowledged_at"
    t.string "alert_type_code", null: false
    t.datetime "closed_at"
    t.datetime "created_at", null: false
    t.integer "device_id", null: false
    t.datetime "opened_at", null: false
    t.string "severity_code", null: false
    t.string "status", default: "open", null: false
    t.datetime "updated_at", null: false
    t.index ["alert_type_code"], name: "index_alerts_on_alert_type_code"
    t.index ["device_id"], name: "index_alerts_on_device_id"
    t.index ["severity_code"], name: "index_alerts_on_severity_code"
    t.index ["status"], name: "index_alerts_on_status"
  end

  create_table "automation_rules", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "device_id", null: false
    t.boolean "fan_on_temp_alert", default: false, null: false
    t.boolean "led_on_alert", default: false, null: false
    t.datetime "manual_override_until"
    t.datetime "updated_at", null: false
    t.index ["device_id"], name: "index_automation_rules_on_device_id", unique: true
  end

  create_table "claim_codes", force: :cascade do |t|
    t.string "code", null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.integer "fail_count", default: 0, null: false
    t.integer "site_id", null: false
    t.datetime "updated_at", null: false
    t.datetime "used_at"
    t.integer "user_id", null: false
    t.index ["code"], name: "index_claim_codes_on_code", unique: true
    t.index ["site_id"], name: "index_claim_codes_on_site_id"
    t.index ["user_id"], name: "index_claim_codes_on_user_id"
  end

  create_table "command_types", primary_key: "code", id: :string, force: :cascade do |t|
    t.string "actuator_type_code", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["actuator_type_code"], name: "index_command_types_on_actuator_type_code"
  end

  create_table "commands", force: :cascade do |t|
    t.string "command_type_code", null: false
    t.datetime "created_at", null: false
    t.integer "device_id", null: false
    t.datetime "expires_at", null: false
    t.string "idempotency_key", null: false
    t.datetime "issued_at", null: false
    t.string "origin", null: false
    t.string "status", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.index ["command_type_code"], name: "index_commands_on_command_type_code"
    t.index ["device_id"], name: "index_commands_on_device_id"
    t.index ["idempotency_key"], name: "index_commands_on_idempotency_key", unique: true
    t.index ["status"], name: "index_commands_on_status"
  end

  create_table "device_statuses", primary_key: "code", id: :string, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
  end

  create_table "devices", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.boolean "deleted", default: false, null: false
    t.string "device_token_digest", null: false
    t.integer "expected_interval_sec", default: 60, null: false
    t.datetime "last_seen_at"
    t.integer "site_id", null: false
    t.string "status_code", default: "provisioning", null: false
    t.datetime "updated_at", null: false
    t.index ["device_token_digest"], name: "index_devices_on_device_token_digest", unique: true
    t.index ["site_id"], name: "index_devices_on_site_id"
    t.index ["status_code"], name: "index_devices_on_status_code"
  end

  create_table "hourly_aggregates", force: :cascade do |t|
    t.decimal "avg_value", precision: 5, scale: 2, null: false
    t.datetime "created_at", null: false
    t.integer "device_id", null: false
    t.datetime "hour_bucket", null: false
    t.decimal "max_value", precision: 5, scale: 2, null: false
    t.decimal "min_value", precision: 5, scale: 2, null: false
    t.string "sensor_type_code", null: false
    t.datetime "updated_at", null: false
    t.index ["device_id", "sensor_type_code", "hour_bucket"], name: "index_hourly_aggregates_on_device_sensor_hour", unique: true
    t.index ["device_id"], name: "index_hourly_aggregates_on_device_id"
  end

  create_table "sensor_types", primary_key: "code", id: :string, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
  end

  create_table "sites", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.boolean "deleted", default: false, null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["user_id"], name: "index_sites_on_user_id"
  end

  create_table "telemetry_readings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "device_id", null: false
    t.datetime "device_reported_at"
    t.decimal "humidity_pct", precision: 5, scale: 2, null: false
    t.datetime "recorded_at", null: false
    t.integer "seq", null: false
    t.decimal "temperature_c", precision: 5, scale: 2, null: false
    t.datetime "updated_at", null: false
    t.index ["device_id", "seq"], name: "index_telemetry_readings_on_device_id_and_seq", unique: true
    t.index ["device_id"], name: "index_telemetry_readings_on_device_id"
  end

  create_table "thresholds", force: :cascade do |t|
    t.string "breach_state", default: "NORMAL", null: false
    t.integer "consecutive_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.decimal "deadband", precision: 6, scale: 2, default: "0.0", null: false
    t.integer "device_id", null: false
    t.string "direction", null: false
    t.string "sensor_type_code", null: false
    t.decimal "trigger_value", precision: 6, scale: 2, null: false
    t.datetime "updated_at", null: false
    t.index ["device_id", "sensor_type_code", "direction"], name: "index_thresholds_on_device_sensor_direction", unique: true
    t.index ["device_id"], name: "index_thresholds_on_device_id"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "google_sub", null: false
    t.datetime "updated_at", null: false
    t.index ["google_sub"], name: "index_users_on_google_sub", unique: true
  end

  add_foreign_key "ai_quota_usages", "users"
  add_foreign_key "ai_summaries", "users"
  add_foreign_key "alerts", "alert_severities", column: "severity_code", primary_key: "code"
  add_foreign_key "alerts", "alert_types", column: "alert_type_code", primary_key: "code"
  add_foreign_key "alerts", "devices"
  add_foreign_key "automation_rules", "devices"
  add_foreign_key "claim_codes", "sites"
  add_foreign_key "claim_codes", "users"
  add_foreign_key "command_types", "actuator_types", column: "actuator_type_code", primary_key: "code"
  add_foreign_key "commands", "command_types", column: "command_type_code", primary_key: "code"
  add_foreign_key "commands", "devices"
  add_foreign_key "devices", "device_statuses", column: "status_code", primary_key: "code"
  add_foreign_key "devices", "sites"
  add_foreign_key "hourly_aggregates", "devices"
  add_foreign_key "hourly_aggregates", "sensor_types", column: "sensor_type_code", primary_key: "code"
  add_foreign_key "sites", "users"
  add_foreign_key "telemetry_readings", "devices"
  add_foreign_key "thresholds", "devices"
  add_foreign_key "thresholds", "sensor_types", column: "sensor_type_code", primary_key: "code"
end
