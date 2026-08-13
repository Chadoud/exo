const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyEmailTemplate, resetPasswordTemplate } = require("../lib/emailTemplates");

test("verifyEmailTemplate embeds the verify URL in text and html", () => {
  const url = "https://api.exosites.ch/auth/verify-email?token=abc123";
  const { subject, text, html } = verifyEmailTemplate(url);
  assert.match(subject, /verify/i);
  assert.ok(text.includes(url));
  assert.ok(html.includes(url));
});

test("resetPasswordTemplate embeds the reset URL and escapes it in html", () => {
  const url = "https://api.exosites.ch/auth/reset-password/page?token=a&b=1";
  const { subject, text, html } = resetPasswordTemplate(url);
  assert.match(subject, /reset/i);
  assert.ok(text.includes(url));
  // HTML must escape the ampersand — never inject the raw query string into the anchor.
  assert.ok(html.includes("a&amp;b=1"));
  assert.ok(!html.includes(`href="${url}"`));
});
