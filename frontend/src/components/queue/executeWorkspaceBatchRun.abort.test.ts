import { describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { executeWorkspaceBatchRun } from "./executeWorkspaceBatchRun";

vi.mock("../../api", () => ({
  api: { cancelJob: vi.fn().mockResolvedValue({ success: true }) },
}));

describe("executeWorkspaceBatchRun abort after analyze", () => {
  it("cancels the job id when the user aborts after analyze already started polling", async () => {
    const ac = new AbortController();
    const result = await executeWorkspaceBatchRun({
      signal: ac.signal,
      t: (key) => key,
      stagedPaths: ["/tmp/a.pdf"],
      includeLocalInRun: true,
      gmailMergePrefsSnapshot: null,
      driveMergePrefsSnapshot: null,
      dropboxMergePrefsSnapshot: null,
      oneDriveMergePrefsSnapshot: null,
      outlookMergePrefsSnapshot: null,
      s3MergePrefsSnapshot: null,
      slackMergePrefsSnapshot: null,
      icloudMergePrefsSnapshot: null,
      infomaniakMergePrefsSnapshot: null,
      infomaniakMailMergePrefsSnapshot: null,
      onStartExplicitLocalSort: async () => {
        ac.abort();
        return "job-9";
      },
      workspaceGmailMailOnlyRunnerRef: { current: null },
      setSortRunStartedAtMs: () => {},
      setPreviewCount: () => {},
      setStagedPaths: () => {},
    });

    expect(result).toBeNull();
    expect(api.cancelJob).toHaveBeenCalledWith("job-9");
  });
});
