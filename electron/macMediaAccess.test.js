const test = require("node:test");
const assert = require("node:assert/strict");

const { ensureMacMicrophoneAccess } = require("./macMediaAccess");

const darwinOnly = { skip: process.platform !== "darwin" };

function fakePrefs(status, askResult = true) {
  const calls = { asked: 0 };
  return {
    calls,
    getMediaAccessStatus: () => status,
    askForMediaAccess: async () => {
      calls.asked += 1;
      return askResult;
    },
  };
}

test("granted passes through without prompting", darwinOnly, async () => {
  const prefs = fakePrefs("granted");
  assert.equal(await ensureMacMicrophoneAccess(prefs), true);
  assert.equal(prefs.calls.asked, 0);
});

test("not-determined triggers the OS prompt and returns its result", darwinOnly, async () => {
  const allowed = fakePrefs("not-determined", true);
  assert.equal(await ensureMacMicrophoneAccess(allowed), true);
  assert.equal(allowed.calls.asked, 1);

  const refused = fakePrefs("not-determined", false);
  assert.equal(await ensureMacMicrophoneAccess(refused), false);
});

test("denied is refused without prompting (user must use System Settings)", darwinOnly, async () => {
  const prefs = fakePrefs("denied");
  assert.equal(await ensureMacMicrophoneAccess(prefs), false);
  assert.equal(prefs.calls.asked, 0);
});

test("preferences API failure never hard-disables voice", darwinOnly, async () => {
  const prefs = {
    getMediaAccessStatus: () => {
      throw new Error("boom");
    },
    askForMediaAccess: async () => false,
  };
  assert.equal(await ensureMacMicrophoneAccess(prefs), true);
});
