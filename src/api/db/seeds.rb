# This file should ensure the existence of records required to run the application in every environment (production,
# development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).

# requirements.md 1.7: マスタデータ合計17件
# (センサー種別2/アクチュエータ種別2/コマンド種別4/アラート種別3/重要度3/デバイス状態3)
# を、開発・テスト・本番のすべての環境で冪等(idempotent)に投入する。
class MasterDataSeeder
  SENSOR_TYPES = {
    "temperature" => "温度",
    "humidity" => "湿度"
  }.freeze

  ACTUATOR_TYPES = {
    "led" => "LED",
    "fan" => "ファン"
  }.freeze

  COMMAND_TYPES = {
    "LED_ON" => { name: "LED点灯", actuator_type_code: "led" },
    "LED_OFF" => { name: "LED消灯", actuator_type_code: "led" },
    "FAN_ON" => { name: "ファン起動", actuator_type_code: "fan" },
    "FAN_OFF" => { name: "ファン停止", actuator_type_code: "fan" }
  }.freeze

  ALERT_TYPES = {
    "threshold_upper_breach" => "上限超過",
    "threshold_lower_breach" => "下限逸脱",
    "offline" => "オフライン"
  }.freeze

  ALERT_SEVERITIES = {
    "info" => "情報",
    "warning" => "警告",
    "critical" => "重大"
  }.freeze

  DEVICE_STATUSES = {
    "provisioning" => "登録中",
    "online" => "オンライン",
    "offline" => "オフライン"
  }.freeze

  def self.call
    new.call
  end

  def call
    seed_sensor_types
    seed_actuator_types
    seed_command_types
    seed_alert_types
    seed_alert_severities
    seed_device_statuses
  end

  private

  def seed_sensor_types
    SENSOR_TYPES.each do |code, name|
      SensorType.find_or_create_by!(code: code) { |record| record.name = name }
    end
  end

  def seed_actuator_types
    ACTUATOR_TYPES.each do |code, name|
      ActuatorType.find_or_create_by!(code: code) { |record| record.name = name }
    end
  end

  def seed_command_types
    COMMAND_TYPES.each do |code, attrs|
      CommandType.find_or_create_by!(code: code) do |record|
        record.name = attrs[:name]
        record.actuator_type_code = attrs[:actuator_type_code]
      end
    end
  end

  def seed_alert_types
    ALERT_TYPES.each do |code, name|
      AlertType.find_or_create_by!(code: code) { |record| record.name = name }
    end
  end

  def seed_alert_severities
    ALERT_SEVERITIES.each do |code, name|
      AlertSeverity.find_or_create_by!(code: code) { |record| record.name = name }
    end
  end

  def seed_device_statuses
    DEVICE_STATUSES.each do |code, name|
      DeviceStatus.find_or_create_by!(code: code) { |record| record.name = name }
    end
  end
end

MasterDataSeeder.call
