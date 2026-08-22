import { describe, expect, it } from "vitest";
import { executeWorkspaceBatchRun } from "./executeWorkspaceBatchRun";

describe("executeWorkspaceBatchRun gmail-only", () => {
  it("does not claim a start when mail import returns no job id", async () => {
    const result = await executeWorkspaceBatchRun({
      signal: new AbortController().signal,
      t: (key) => key,
      stagedPaths: [],
      includeLocalInRun: false,
      gmailMergePrefsSnapshot: {
        enabled: true,
        gmail_query: "in:inbox",
        max_messages: 10,
        gmail_import_content: "both",
      },
      driveMergePrefsSnapshot: null,
      dropboxMergePrefsSnapshot: null,
      oneDriveMergePrefsSnapshot: null,
      outlookMergePrefsSnapshot: null,
      s3MergePrefsSnapshot: null,
      slackMergePrefsSnapshot: null,
      icloudMergePrefsSnapshot: null,
      infomaniakMergePrefsSnapshot: null,
      infomaniakMailMergePrefsSnapshot: null,
      onStartExplicitLocalSort: async () => null,
      workspaceGmailMailOnlyRunnerRef: { current: async () => null },
      onStartGmailOnlySort: async () => null,
      setSortRunStartedAtMs: () => {},
      setPreviewCount: () => {},
      setStagedPaths: () => {},
    });

    expect(result).toBeNull();
  });

  it("starts Gmail-only without the Sources card runner", async () => {
    const result = await executeWorkspaceBatchRun({
      signal: new AbortController().signal,
      t: (key) => key,
      stagedPaths: [],
      includeLocalInRun: false,
      gmailMergePrefsSnapshot: {
        enabled: true,
        gmail_query: "in:inbox",
        max_messages: 10,
        gmail_import_content: "both",
      },
      driveMergePrefsSnapshot: null,
      dropboxMergePrefsSnapshot: null,
      oneDriveMergePrefsSnapshot: null,
      outlookMergePrefsSnapshot: null,
      s3MergePrefsSnapshot: null,
      slackMergePrefsSnapshot: null,
      icloudMergePrefsSnapshot: null,
      infomaniakMergePrefsSnapshot: null,
      infomaniakMailMergePrefsSnapshot: null,
      onStartExplicitLocalSort: async () => null,
      onStartGmailOnlySort: async () => "gmail-job-1",
      workspaceGmailMailOnlyRunnerRef: { current: null },
      setSortRunStartedAtMs: () => {},
      setPreviewCount: () => {},
      setStagedPaths: () => {},
    });

    expect(result).toBe("gmail-job-1");
  });
});
