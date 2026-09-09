const test = require("node:test");
const assert = require("node:assert/strict");

const { oauthHandoffPageHtml } = require("../lib/oauthHandoffHtml");

test("success handoff shows close hint after Open Exo click", () => {
  const html = oauthHandoffPageHtml({ deepLink: "exo://auth/callback?exo_code=abc123" });
  assert.match(html, /Open Exo/);
  assert.match(html, /You can close this tab/);
  assert.match(html, /window\.close\(\)/);
  assert.match(html, /--bg: #f0f2f8/);
  assert.match(html, /--text: #0f0b2e/);
  assert.doesNotMatch(html, /#6c63ff/);
});

test("handoff page ships the light shell", () => {
  const html = oauthHandoffPageHtml({ deepLink: "exo://auth/callback?exo_code=abc123" });
  assert.match(html, /content="light"/);
  assert.match(html, /--surface: #ffffff/);
  // Navy button on a white card — the label must not inherit the page ink.
  assert.match(html, /--button: #0f0b2e/);
  assert.match(html, /--button-text: #eef2ff/);
});

test("error handoff uses Return button with same close behavior", () => {
  const html = oauthHandoffPageHtml({
    deepLink: "exo://auth/callback?error=cancelled",
    error: "cancelled",
  });
  assert.match(html, /Return to Exo/);
  assert.match(html, /window\.close\(\)/);
});
