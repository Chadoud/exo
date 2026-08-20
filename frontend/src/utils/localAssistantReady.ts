/** Whether the loopback assistant can accept work (sort, job poll, voice). */
export function isLocalAssistantReady(opts: {
  backendOnline: boolean;
  backendHealthProbing?: boolean;
  backendServiceStarting?: boolean;
}): boolean {
  return Boolean(opts.backendOnline) && !opts.backendHealthProbing && !opts.backendServiceStarting;
}

/** Skip job-refresh toasts while Connecting… / Restarting… is already the status. */
export function shouldNotifyJobPollError(opts: {
  backendOnline: boolean;
  backendHealthProbing?: boolean;
  backendServiceStarting?: boolean;
}): boolean {
  return isLocalAssistantReady(opts);
}
