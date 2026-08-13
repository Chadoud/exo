const test = require("node:test");
const assert = require("node:assert/strict");

/** Minimal in-memory pool mock for the license_activations table shape. */
function createLicenseActivationsMockPool() {
  const rows = [];

  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.startsWith("select 1 from license_activations")) {
        const [licenseId, machineId] = params;
        const found = rows.some((r) => r.license_id === licenseId && r.machine_id === machineId);
        return [found ? [{ 1: 1 }] : []];
      }
      if (normalized.startsWith("select count(*) as n from license_activations")) {
        const [licenseId] = params;
        const n = rows.filter((r) => r.license_id === licenseId).length;
        return [[{ n }]];
      }
      if (normalized.startsWith("insert into license_activations")) {
        const [licenseId, machineId] = params;
        rows.push({ license_id: licenseId, machine_id: machineId });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`unexpected execute in conn: ${sql}`);
    },
    release() {},
  };

  return {
    async getConnection() {
      return conn;
    },
    _rows: rows,
  };
}

function freshLicenseActivationsModule(mockPool) {
  for (const name of ["../lib/db", "../lib/licenseActivations"]) {
    delete require.cache[require.resolve(name)];
  }
  require("../lib/db").getPool = () => mockPool;
  return require("../lib/licenseActivations");
}

test("first activation for a license_id succeeds", async () => {
  const pool = createLicenseActivationsMockPool();
  const { activateDevice } = freshLicenseActivationsModule(pool);

  const result = await activateDevice("lic-1", "machine-a", 1);
  assert.deepEqual(result, { ok: true });
  assert.equal(pool._rows.length, 1);
});

test("re-activating the same device is idempotent and doesn't consume another seat", async () => {
  const pool = createLicenseActivationsMockPool();
  const { activateDevice } = freshLicenseActivationsModule(pool);

  await activateDevice("lic-1", "machine-a", 1);
  const second = await activateDevice("lic-1", "machine-a", 1);
  assert.deepEqual(second, { ok: true });
  assert.equal(pool._rows.length, 1);
});

test("a second device is rejected once max_seats is reached", async () => {
  const pool = createLicenseActivationsMockPool();
  const { activateDevice } = freshLicenseActivationsModule(pool);

  const first = await activateDevice("lic-1", "machine-a", 1);
  const secondDevice = await activateDevice("lic-1", "machine-b", 1);
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(secondDevice, { ok: false, reason: "seat_limit" });
  assert.equal(pool._rows.length, 1);
});

test("a second device is allowed when max_seats permits it", async () => {
  const pool = createLicenseActivationsMockPool();
  const { activateDevice } = freshLicenseActivationsModule(pool);

  const first = await activateDevice("lic-1", "machine-a", 2);
  const second = await activateDevice("lic-1", "machine-b", 2);
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true });
  assert.equal(pool._rows.length, 2);
});

test("different license_ids don't share a seat pool", async () => {
  const pool = createLicenseActivationsMockPool();
  const { activateDevice } = freshLicenseActivationsModule(pool);

  const a = await activateDevice("lic-1", "machine-a", 1);
  const b = await activateDevice("lic-2", "machine-a", 1);
  assert.deepEqual(a, { ok: true });
  assert.deepEqual(b, { ok: true });
});
