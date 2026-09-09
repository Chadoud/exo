interface AppInteractionGateInput {
  helpOpen: boolean;
  tourOpen: boolean;
  showWelcome: boolean;
  launchSphereSplashOpen: boolean;
  reassignFile: unknown | null;
  needsCloudAccount: boolean;
}

/**
 * When true, command palette shortcuts that navigate or open modals should not run
 * (same idea as blocking during overlays).
 */
export function computeAppInteractionGates(input: AppInteractionGateInput): boolean {
  const {
    helpOpen,
    tourOpen,
    showWelcome,
    launchSphereSplashOpen,
    reassignFile,
    needsCloudAccount,
  } = input;
  return (
    helpOpen ||
    tourOpen ||
    showWelcome ||
    launchSphereSplashOpen ||
    reassignFile !== null ||
    needsCloudAccount
  );
}
