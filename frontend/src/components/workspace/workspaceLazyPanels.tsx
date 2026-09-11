import { lazy } from "react";

/** Code-split workspace panels — loaded when the user opens the matching tab. */
export const LazyOverviewPanel = lazy(() => import("../OverviewPanel"));
export const LazyHistoryPanel = lazy(() => import("../HistoryPanel"));
export const LazyMemoriesPanel = lazy(() => import("../MemoriesPanel"));
export const LazyCapturePanel = lazy(() => import("../CapturePanel"));
export const LazyStartupPanel = lazy(() => import("../startup/StartupPanel"));
export const LazyTasksPanel = lazy(() => import("../TasksPanel"));
export const LazyAssistantWorkspacePanel = lazy(() => import("../AssistantWorkspacePanel"));
export const LazyExternalSourcesPanel = lazy(() => import("../ExternalSourcesPanel"));
export const LazySettingsPanel = lazy(() => import("../SettingsPanel"));
export const LazyQueuePanel = lazy(() => import("../QueuePanel"));
export const LazyExoPanel = lazy(() => import("../ExoPanel"));
