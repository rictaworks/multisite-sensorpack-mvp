#!/usr/bin/env node
"use strict";

/**
 * requirements.md 1.8「テストデータに関する注記」: 実機ESP32(1台)に加え、もう1台はシミュレータ端末で
 * 検証する最小構成のMVP。本スクリプトはIssue #9(F2/F3テレメトリ受信・閾値判定)のEdit scopeに含まれる
 * 「実機代替の開発・E2E用テレメトリ送信シミュレータ」であり、POST /api/v1/telemetry
 * (src/shared/contracts/openapi.yaml operationId: ingestTelemetry)へ、デバイストークン認証付きで
 * 温湿度テレメトリを一定間隔で送信する。
 *
 * 使い方:
 *   TELEMETRY_DEVICE_TOKEN=<claim後に発行された生トークン> node simulate.js
 *
 * 環境変数(.claude/rules配下の方針どおり、値はコードにハードコードせず環境変数/.envから読む):
 *   TELEMETRY_DEVICE_TOKEN   必須。POST /api/v1/devices/claim で発行される長寿命デバイストークン。
 *   TELEMETRY_API_BASE_URL   任意。既定: http://localhost:3000/api/v1
 *   TELEMETRY_INTERVAL_MS    任意。既定: 60000(requirements.md F2手順1のデフォルト送信間隔60秒と一致)。
 *   TELEMETRY_START_SEQ      任意。既定: 1。再実行時に前回の続きから送りたい場合に指定する。
 *   TELEMETRY_ITERATIONS     任意。既定: 無制限(Ctrl+Cで停止)。指定件数を送信したら終了する。
 *   TELEMETRY_ANOMALY_MODE   任意。requirements.md 1.9 Eカテゴリの手動確認用:
 *                              "out_of_range" -> 値域外(温度90℃)のテレメトリを1回だけ混ぜる
 *                              "duplicate"    -> 直前のseqを1回だけ再送する
 *                            未指定または"none"の場合は通常運転のみ。
 *
 * `.env`ファイルが存在すればロードする(dotenv等の外部依存を増やさないための最小実装)。
 * 既にOS環境変数として設定されている値は`.env`の値で上書きしない(dotenv-railsの挙動と合わせる)。
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_API_BASE_URL = "http://localhost:3000/api/v1";
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_START_SEQ = 1;

// requirements.md F2手順4: 値域チェック(温度-40〜85℃・湿度0〜100%)。
// シミュレータの通常運転はこの範囲内に収まる、現実的な室内環境値の乱歩(ランダムウォーク)で生成する。
const NORMAL_TEMPERATURE_RANGE = { min: 15, max: 35 };
const NORMAL_HUMIDITY_RANGE = { min: 20, max: 80 };
const WALK_STEP = { temperature: 0.6, humidity: 1.5 };

function loadDotEnvIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function clamp(value, range) {
  return Math.min(range.max, Math.max(range.min, value));
}

function randomStep(magnitude) {
  return (Math.random() * 2 - 1) * magnitude;
}

// requirements.md 1.6 F2手順1: 温湿度をランダムウォークで生成し、DHT22の実測データに近い
// なだらかな推移を模擬する(急激な値変化はセンサー故障シミュレーション時のみ)。
class SensorWalker {
  constructor() {
    this.temperature =
      NORMAL_TEMPERATURE_RANGE.min +
      Math.random() * (NORMAL_TEMPERATURE_RANGE.max - NORMAL_TEMPERATURE_RANGE.min);
    this.humidity =
      NORMAL_HUMIDITY_RANGE.min + Math.random() * (NORMAL_HUMIDITY_RANGE.max - NORMAL_HUMIDITY_RANGE.min);
  }

  next() {
    this.temperature = clamp(this.temperature + randomStep(WALK_STEP.temperature), NORMAL_TEMPERATURE_RANGE);
    this.humidity = clamp(this.humidity + randomStep(WALK_STEP.humidity), NORMAL_HUMIDITY_RANGE);
    return {
      temperatureC: Math.round(this.temperature * 10) / 10,
      humidityPct: Math.round(this.humidity * 10) / 10
    };
  }
}

function readConfig() {
  loadDotEnvIfPresent(path.join(__dirname, ".env"));

  const deviceToken = process.env.TELEMETRY_DEVICE_TOKEN;
  if (!deviceToken) {
    // requirements.md CLAUDE.md「フォールバック禁止」: 必須設定の欠落を既定値で誤魔化さず、
    // ここで明示的に失敗させる(Fail Fast)。
    throw new Error(
      "TELEMETRY_DEVICE_TOKEN is required (issue a device via POST /api/v1/devices/claim first)."
    );
  }

  return {
    apiBaseUrl: process.env.TELEMETRY_API_BASE_URL || DEFAULT_API_BASE_URL,
    deviceToken,
    intervalMs: Number(process.env.TELEMETRY_INTERVAL_MS || DEFAULT_INTERVAL_MS),
    startSeq: Number(process.env.TELEMETRY_START_SEQ || DEFAULT_START_SEQ),
    iterations: process.env.TELEMETRY_ITERATIONS ? Number(process.env.TELEMETRY_ITERATIONS) : null,
    anomalyMode: process.env.TELEMETRY_ANOMALY_MODE || "none"
  };
}

async function postTelemetry(config, payload) {
  const response = await fetch(`${config.apiBaseUrl}/telemetry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.deviceToken}`
    },
    body: JSON.stringify(payload)
  });

  let body = null;
  try {
    body = await response.json();
  } catch (_error) {
    // レスポンスがJSONでない(サーバーエラー等)場合もクラッシュさせず、ステータスのみで記録を続ける。
    body = null;
  }

  return { status: response.status, body };
}

function buildPayload(seq, reading, anomalyMode, isFirstIteration) {
  // requirements.md 1.9 Eカテゴリの手動確認用に、1回目のみ意図的な異常値/重複を混入する。
  if (anomalyMode === "out_of_range" && isFirstIteration) {
    return { seq, temperatureC: 90, humidityPct: reading.humidityPct, deviceReportedAt: new Date().toISOString() };
  }

  return {
    seq,
    temperatureC: reading.temperatureC,
    humidityPct: reading.humidityPct,
    deviceReportedAt: new Date().toISOString()
  };
}

async function main() {
  const config = readConfig();
  const walker = new SensorWalker();

  console.log(
    `[telemetry-simulator] starting apiBaseUrl=${config.apiBaseUrl} intervalMs=${config.intervalMs} ` +
      `startSeq=${config.startSeq} anomalyMode=${config.anomalyMode}`
  );

  let seq = config.startSeq;
  let sentCount = 0;
  let stopped = false;
  let lastPayload = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    console.log(`[telemetry-simulator] stopping after ${sentCount} request(s).`);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const tick = async () => {
    if (stopped) return;

    const reading = walker.next();
    let payload = buildPayload(seq, reading, config.anomalyMode, sentCount === 0);

    if (config.anomalyMode === "duplicate" && sentCount === 1 && lastPayload) {
      payload = { ...lastPayload };
      console.log(`[telemetry-simulator] resending previous seq=${payload.seq} to simulate a duplicate`);
    } else {
      seq += 1;
    }

    try {
      const { status, body } = await postTelemetry(config, payload);
      sentCount += 1;
      lastPayload = payload;

      console.log(
        `[telemetry-simulator] seq=${payload.seq} temperatureC=${payload.temperatureC} ` +
          `humidityPct=${payload.humidityPct} -> status=${status} ` +
          `accepted=${body?.accepted} duplicate=${body?.duplicate} commands=${body?.commands?.length ?? 0}`
      );
    } catch (error) {
      // ネットワーク断・サーバー未起動等を握りつぶさず、明示的にログへ残す(デバッグトレース可能性の確保)。
      console.error(`[telemetry-simulator] request failed for seq=${payload.seq}: ${error.message}`);
    }

    if (config.iterations !== null && sentCount >= config.iterations) {
      stop();
      return;
    }

    setTimeout(tick, config.intervalMs);
  };

  await tick();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[telemetry-simulator] fatal: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { SensorWalker, buildPayload, clamp };
