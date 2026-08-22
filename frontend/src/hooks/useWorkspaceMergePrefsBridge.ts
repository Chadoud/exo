import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { GmailMergePrefs } from "../components/workspace/GmailWorkspaceSortBlock";
import type { DriveMergePrefs } from "../components/workspace/DriveWorkspaceSortBlock";
import type { DropboxMergePrefs } from "../components/workspace/DropboxWorkspaceSortBlock";
import type { OneDriveMergePrefs } from "../components/workspace/oneDriveWorkspaceImportResolve";
import type { OutlookMergePrefs } from "../components/workspace/outlookWorkspaceImportResolve";
import type { S3MergePrefs } from "../components/workspace/s3WorkspaceImportResolve";
import type { SlackMergePrefs } from "../components/workspace/slackWorkspaceImportResolve";
import type { ICloudMergePrefs } from "../components/workspace/icloudWorkspaceImportResolve";
import type { InfomaniakMergePrefs } from "../components/workspace/infomaniakWorkspaceImportResolve";
import type { InfomaniakMailMergePrefs } from "../components/workspace/InfomaniakMailWorkspaceSortBlock";

/**
 * Single place for all merge-prefs state — prevents App from duplicating source-of-truth wiring.
 */
export function useWorkspaceMergePrefsBridge(): {
  gmailMergePrefsRef: MutableRefObject<GmailMergePrefs | null>;
  gmailMergePrefsSnapshot: GmailMergePrefs | null;
  driveMergePrefsSnapshot: DriveMergePrefs | null;
  dropboxMergePrefsSnapshot: DropboxMergePrefs | null;
  oneDriveMergePrefsSnapshot: OneDriveMergePrefs | null;
  outlookMergePrefsSnapshot: OutlookMergePrefs | null;
  s3MergePrefsSnapshot: S3MergePrefs | null;
  slackMergePrefsSnapshot: SlackMergePrefs | null;
  icloudMergePrefsSnapshot: ICloudMergePrefs | null;
  infomaniakMergePrefsSnapshot: InfomaniakMergePrefs | null;
  infomaniakMailMergePrefsSnapshot: InfomaniakMailMergePrefs | null;
  handleGmailMergePrefsChange: (prefs: GmailMergePrefs | null) => void;
  handleDriveMergePrefsChange: (prefs: DriveMergePrefs | null) => void;
  handleDropboxMergePrefsChange: (prefs: DropboxMergePrefs | null) => void;
  handleOneDriveMergePrefsChange: (prefs: OneDriveMergePrefs | null) => void;
  handleOutlookMergePrefsChange: (prefs: OutlookMergePrefs | null) => void;
  handleS3MergePrefsChange: (prefs: S3MergePrefs | null) => void;
  handleSlackMergePrefsChange: (prefs: SlackMergePrefs | null) => void;
  handleICloudMergePrefsChange: (prefs: ICloudMergePrefs | null) => void;
  handleInfomaniakMergePrefsChange: (prefs: InfomaniakMergePrefs | null) => void;
  handleInfomaniakMailMergePrefsChange: (prefs: InfomaniakMailMergePrefs | null) => void;
  workspaceGmailMailOnlyRunnerRef: MutableRefObject<
    ((opts?: { signal?: AbortSignal }) => Promise<string | null>) | null
  >;
  registerWorkspaceGmailMailOnlyRunner: (
    fn: ((opts?: { signal?: AbortSignal }) => Promise<string | null>) | null
  ) => void;
} {
  const gmailMergePrefsRef = useRef<GmailMergePrefs | null>(null);
  const [gmailMergePrefsSnapshot, setGmailMergePrefsSnapshot] = useState<GmailMergePrefs | null>(null);
  const [driveMergePrefsSnapshot, setDriveMergePrefsSnapshot] = useState<DriveMergePrefs | null>(null);
  const [dropboxMergePrefsSnapshot, setDropboxMergePrefsSnapshot] = useState<DropboxMergePrefs | null>(null);
  const [oneDriveMergePrefsSnapshot, setOneDriveMergePrefsSnapshot] = useState<OneDriveMergePrefs | null>(null);
  const [outlookMergePrefsSnapshot, setOutlookMergePrefsSnapshot] = useState<OutlookMergePrefs | null>(null);
  const [s3MergePrefsSnapshot, setS3MergePrefsSnapshot] = useState<S3MergePrefs | null>(null);
  const [slackMergePrefsSnapshot, setSlackMergePrefsSnapshot] = useState<SlackMergePrefs | null>(null);
  const [icloudMergePrefsSnapshot, setICloudMergePrefsSnapshot] = useState<ICloudMergePrefs | null>(null);
  const [infomaniakMergePrefsSnapshot, setInfomaniakMergePrefsSnapshot] = useState<InfomaniakMergePrefs | null>(null);
  const [infomaniakMailMergePrefsSnapshot, setInfomaniakMailMergePrefsSnapshot] =
    useState<InfomaniakMailMergePrefs | null>(null);
  const workspaceGmailMailOnlyRunnerRef = useRef<
    ((opts?: { signal?: AbortSignal }) => Promise<string | null>) | null
  >(null);

  const handleGmailMergePrefsChange = useCallback((prefs: GmailMergePrefs | null) => {
    gmailMergePrefsRef.current = prefs;
    setGmailMergePrefsSnapshot(prefs);
  }, []);
  const handleDriveMergePrefsChange = useCallback((prefs: DriveMergePrefs | null) => { setDriveMergePrefsSnapshot(prefs); }, []);
  const handleDropboxMergePrefsChange = useCallback((prefs: DropboxMergePrefs | null) => { setDropboxMergePrefsSnapshot(prefs); }, []);
  const handleOneDriveMergePrefsChange = useCallback((prefs: OneDriveMergePrefs | null) => { setOneDriveMergePrefsSnapshot(prefs); }, []);
  const handleOutlookMergePrefsChange = useCallback((prefs: OutlookMergePrefs | null) => { setOutlookMergePrefsSnapshot(prefs); }, []);
  const handleS3MergePrefsChange = useCallback((prefs: S3MergePrefs | null) => { setS3MergePrefsSnapshot(prefs); }, []);
  const handleSlackMergePrefsChange = useCallback((prefs: SlackMergePrefs | null) => { setSlackMergePrefsSnapshot(prefs); }, []);
  const handleICloudMergePrefsChange = useCallback((prefs: ICloudMergePrefs | null) => { setICloudMergePrefsSnapshot(prefs); }, []);
  const handleInfomaniakMergePrefsChange = useCallback((prefs: InfomaniakMergePrefs | null) => { setInfomaniakMergePrefsSnapshot(prefs); }, []);
  const handleInfomaniakMailMergePrefsChange = useCallback((prefs: InfomaniakMailMergePrefs | null) => {
    setInfomaniakMailMergePrefsSnapshot(prefs);
  }, []);

  const registerWorkspaceGmailMailOnlyRunner = useCallback(
    (fn: ((opts?: { signal?: AbortSignal }) => Promise<string | null>) | null) => {
      workspaceGmailMailOnlyRunnerRef.current = fn;
    },
    []
  );

  return {
    gmailMergePrefsRef,
    gmailMergePrefsSnapshot,
    driveMergePrefsSnapshot,
    dropboxMergePrefsSnapshot,
    oneDriveMergePrefsSnapshot,
    outlookMergePrefsSnapshot,
    s3MergePrefsSnapshot,
    slackMergePrefsSnapshot,
    icloudMergePrefsSnapshot,
    infomaniakMergePrefsSnapshot,
    infomaniakMailMergePrefsSnapshot,
    handleGmailMergePrefsChange,
    handleDriveMergePrefsChange,
    handleDropboxMergePrefsChange,
    handleOneDriveMergePrefsChange,
    handleOutlookMergePrefsChange,
    handleS3MergePrefsChange,
    handleSlackMergePrefsChange,
    handleICloudMergePrefsChange,
    handleInfomaniakMergePrefsChange,
    handleInfomaniakMailMergePrefsChange,
    workspaceGmailMailOnlyRunnerRef,
    registerWorkspaceGmailMailOnlyRunner,
  };
}
