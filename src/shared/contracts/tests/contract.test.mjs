// openapi.yaml が Issue #5 の受け入れ条件を満たしているかを検証する回帰テスト。
// `npm test`（node:test）で実行する。CIでは `.github/workflows/openapi-contract.yml` から呼び出す。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { load } from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, "..", "openapi.yaml");
const specText = readFileSync(specPath, "utf8");
const spec = load(specText);

function collectOperations(openApiSpec) {
  const operations = [];
  for (const pathItem of Object.values(openApiSpec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (
        ["get", "post", "put", "patch", "delete"].includes(method) &&
        operation &&
        typeof operation === "object"
      ) {
        operations.push({ method, ...operation });
      }
    }
  }
  return operations;
}

test("OpenAPIとして基本構造が妥当である", () => {
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.paths && Object.keys(spec.paths).length > 0, "pathsが空");
  assert.ok(spec.components?.schemas, "components.schemasが存在しない");
});

test("requirements.md 1.4節: 個人情報を含むフィールドが定義されていない", () => {
  // メールアドレス・氏名・住所・電話番号・生年月日・Google生subの直接露出を禁止する。
  // ただし説明文(description)中の「メールアドレス」等の禁止事項の言及は許可するため、
  // スキーマのプロパティ名（キー）のみを対象に検査する。
  const forbiddenPropertyNames = [
    "email",
    "phone",
    "phonenumber",
    "address",
    "birthdate",
    "dateofbirth",
    "fullname",
    "googlesub",
    "google_sub",
    "sub",
  ];

  function walkSchemaProperties(node, path, violations) {
    if (!node || typeof node !== "object") return;
    if (node.properties && typeof node.properties === "object") {
      for (const propName of Object.keys(node.properties)) {
        const normalized = propName.toLowerCase().replace(/[_-]/g, "");
        if (forbiddenPropertyNames.includes(normalized)) {
          violations.push(`${path}.${propName}`);
        }
        walkSchemaProperties(node.properties[propName], `${path}.${propName}`, violations);
      }
    }
    if (Array.isArray(node.allOf)) {
      node.allOf.forEach((sub, i) => walkSchemaProperties(sub, `${path}.allOf[${i}]`, violations));
    }
    if (node.items) walkSchemaProperties(node.items, `${path}.items`, violations);
  }

  const violations = [];
  for (const [schemaName, schema] of Object.entries(spec.components.schemas)) {
    walkSchemaProperties(schema, schemaName, violations);
  }
  assert.deepEqual(violations, [], `個人情報らしきフィールドが見つかった: ${violations.join(", ")}`);
});

test("認証方式(Googleセッション/デバイストークン/内部サービスキー/管理者BASIC)がsecuritySchemesに定義されている", () => {
  const schemeNames = Object.keys(spec.components.securitySchemes ?? {});
  for (const required of [
    "googleSessionCookie",
    "deviceBearerToken",
    "internalServiceKey",
    "adminBasicAuth",
  ]) {
    assert.ok(schemeNames.includes(required), `securitySchemesに${required}が定義されていない`);
  }
});

test("requirements.mdに記載のエラーレスポンス(401/410/429)がpaths中に定義されている", () => {
  const operations = collectOperations(spec);
  const statusCodes = new Set();
  for (const operation of operations) {
    for (const status of Object.keys(operation.responses ?? {})) {
      statusCodes.add(status);
    }
  }
  for (const required of ["401", "410", "429"]) {
    assert.ok(statusCodes.has(required), `レスポンスステータス${required}が一度も定義されていない`);
  }
});

test("F1〜F8の関数ロジックに対応するoperationIdが揃っている", () => {
  const operations = collectOperations(spec);
  const operationIds = operations.map((op) => op.operationId).filter(Boolean);

  const requiredByFunction = {
    "F1 claim_device": ["issueClaimCode", "claimDevice"],
    "F2/F3 ingest_telemetry/evaluate_thresholds": ["ingestTelemetry"],
    "F5 dispatch_command": ["createCommand", "updateAutomationRule"],
    "F6 render_dashboard": ["getDashboardSitesSummary", "getDeviceTelemetrySeries"],
    "F7 generate_daily_summary": ["generateDailySummary", "internalGenerateSummary"],
    "F8 manage_alerts": ["listAlerts", "acknowledgeAlert"],
  };

  for (const [label, ids] of Object.entries(requiredByFunction)) {
    for (const id of ids) {
      assert.ok(operationIds.includes(id), `${label} に対応するoperationId "${id}" が見つからない`);
    }
  }
});

test("operationIdに重複がない", () => {
  const operations = collectOperations(spec);
  const operationIds = operations.map((op) => op.operationId).filter(Boolean);
  const unique = new Set(operationIds);
  assert.equal(operationIds.length, unique.size, "operationIdが重複している");
});
