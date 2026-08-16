const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEventsBatch, validateFeedback } = require("../lib/telemetryValidate");

test("validateEventsBatch accepts allowlisted events", () => {
  const result = validateEventsBatch({
    instance_id: "desktop-abc12345",
    app_version: "1.0.0",
    platform: "electron",
    locale: "en",
    client_ts_ms: Date.now(),
    events: [{ name: "app_started", props: { ui_locale: "en" } }],
  });
  assert.ok("rows" in result);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].event_name, "app_started");
});

test("validateEventsBatch rejects forbidden props", () => {
  const result = validateEventsBatch({
    instance_id: "desktop-abc12345",
    app_version: "1.0.0",
    platform: "electron",
    locale: "en",
    events: [{ name: "first_drop", props: { path: "/secret" } }],
  });
  assert.ok("error" in result);
});

test("validateFeedback rejects file paths in message", () => {
  const result = validateFeedback({
    instance_id: "desktop-abc12345",
    category: "bug",
    message: "Crash in /Users/me/file.pdf",
  });
  assert.ok("error" in result);
});

test("validateFeedback accepts concise feedback", () => {
  const result = validateFeedback({
    instance_id: "desktop-abc12345",
    category: "ux",
    message: "Sort review grid is hard to scan on small screens.",
  });
  assert.ok("row" in result);
  assert.equal(result.row.category, "ux");
});

test("validateEventsBatch accepts granular sort events", () => {
  const result = validateEventsBatch({
    instance_id: "desktop-abc12345",
    app_version: "1.0.0",
    platform: "electron",
    locale: "en",
    events: [
      {
        name: "job_completed",
        props: {
          source: "local",
          file_count_bucket: "1-5",
          uncertain_rate_bucket: "0%",
          outcome: "clean",
          ocr_used: true,
        },
      },
      { name: "sort_blocked", props: { reason: "offline" } },
      { name: "job_cancelled", props: { tab: "queue", follow_up: "user" } },
    ],
  });
  assert.ok("rows" in result);
  assert.equal(result.rows.length, 3);
});

test("validateEventsBatch accepts mail reply events", () => {
  const names = [
    "mail_reply_proposed",
    "mail_reply_opened",
    "mail_reply_sent",
    "mail_reply_dismissed",
    "mail_reply_failed",
  ];
  for (const name of names) {
    const result = validateEventsBatch({
      instance_id: "desktop-abc12345",
      app_version: "1.0.0",
      platform: "electron",
      locale: "en",
      events: [{ name, props: name === "mail_reply_failed" ? { error_class: "network" } : {} }],
    });
    assert.ok("rows" in result, `expected rows for ${name}`);
    assert.equal(result.rows[0].event_name, name);
  }
});

test("validateEventsBatch accepts lifecycle events", () => {
  const names = [
    "account_signed_in",
    "account_signed_out",
    "account_deleted",
    "telemetry_opt_in",
    "telemetry_opt_out",
    "app_heartbeat",
  ];
  for (const name of names) {
    const result = validateEventsBatch({
      instance_id: "desktop-abc12345",
      app_version: "1.0.0",
      platform: "electron",
      locale: "en",
      events: [{ name, props: name === "account_signed_in" ? { ui_locale: "en" } : {} }],
    });
    assert.ok("rows" in result, `expected rows for ${name}`);
    assert.equal(result.rows[0].event_name, name);
  }
});
