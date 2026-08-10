/**
 * IPC handler registrations — delegates to focused modules under ./ipc/.
 * Single entry point for main process (`registerHandlers`).
 */

const { registerIntegrationHandlers } = require("./integrations/ipc");
const { registerSetupHandlers } = require("./ipc/setupHandlers");
const { registerDialogHandlers } = require("./ipc/dialogHandlers");
const { registerAppHandlers } = require("./ipc/appHandlers");
const { registerShellHandlers } = require("./ipc/shellHandlers");
const { registerWindowHandlers } = require("./ipc/windowHandlers");
const { registerSystemCommandHandlers } = require("./ipc/systemCommandHandlers");
const { registerTelemetryHandlers } = require("./ipc/telemetryHandlers");
const { registerScreenCaptureHandlers } = require("./ipc/screenCapture");
const { registerClapHandlers } = require("./ipc/clapHandlers");
const { registerPttHandlers } = require("./ipc/pushToTalkHandlers");
const { registerCodegenHandlers } = require("./ipc/codegenHandlers");
const { registerSecretsHandlers } = require("./ipc/secretsHandlers");
const { registerBillingHandlers } = require("./ipc/billingHandlers");
const { registerUpdateHandlers } = require("./autoUpdater");
const { registerVoiceHandlers } = require("./ipc/voiceHandlers");

function registerHandlers() {
  registerIntegrationHandlers();
  registerSetupHandlers();
  registerDialogHandlers();
  registerAppHandlers();
  registerShellHandlers();
  registerWindowHandlers();
  registerSystemCommandHandlers();
  registerTelemetryHandlers();
  registerScreenCaptureHandlers();
  registerClapHandlers();
  registerPttHandlers();
  registerCodegenHandlers();
  registerSecretsHandlers();
  registerBillingHandlers();
  registerVoiceHandlers();
  registerUpdateHandlers();
}

module.exports = { registerHandlers };
