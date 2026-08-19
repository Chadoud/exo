const test = require("node:test");
const assert = require("node:assert/strict");
const {
  emailFromCalendarPrimaryPayload,
  emailFromDriveAboutPayload,
  emailFromGmailProfilePayload,
} = require("./google");

test("emailFromGmailProfilePayload reads emailAddress", () => {
  assert.equal(emailFromGmailProfilePayload({ emailAddress: "you@gmail.com" }), "you@gmail.com");
});

test("emailFromGmailProfilePayload ignores blank or missing", () => {
  assert.equal(emailFromGmailProfilePayload({ emailAddress: "  " }), undefined);
  assert.equal(emailFromGmailProfilePayload({}), undefined);
  assert.equal(emailFromGmailProfilePayload(null), undefined);
});

test("emailFromDriveAboutPayload reads user.emailAddress", () => {
  assert.equal(
    emailFromDriveAboutPayload({ user: { emailAddress: "you@gmail.com" } }),
    "you@gmail.com",
  );
  assert.equal(emailFromDriveAboutPayload({ user: {} }), undefined);
});

test("emailFromCalendarPrimaryPayload only keeps mailbox ids", () => {
  assert.equal(emailFromCalendarPrimaryPayload({ id: "you@gmail.com" }), "you@gmail.com");
  assert.equal(emailFromCalendarPrimaryPayload({ id: "primary" }), undefined);
});
