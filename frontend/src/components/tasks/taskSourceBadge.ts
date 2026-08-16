import type { TaskSourceBadge } from "./TaskRow";

const SOURCE_TONES: Record<string, string> = {
  conversation: "bg-accent/15 text-accent",
  meeting: "bg-accent/15 text-accent",
  assistant: "bg-accent/15 text-accent",
  gmail: "bg-red-500/15 text-red-400",
  outlook: "bg-sky-500/15 text-sky-400",
  "google-calendar": "bg-emerald-500/15 text-emerald-400",
  "outlook-calendar": "bg-sky-500/15 text-sky-400",
};

const SOURCE_LABEL_KEYS: Record<string, string> = {
  conversation: "tasks.sources.conversation",
  meeting: "tasks.sources.meeting",
  assistant: "tasks.sources.assistant",
  gmail: "tasks.sources.gmail",
  outlook: "tasks.sources.outlook",
  "google-calendar": "tasks.sources.googleCalendar",
  "outlook-calendar": "tasks.sources.outlookCalendar",
};

export function taskSourceBadge(source: string, t: (key: string) => string): TaskSourceBadge {
  return {
    label: SOURCE_LABEL_KEYS[source] ? t(SOURCE_LABEL_KEYS[source]) : source.replace(/-/g, " "),
    tone: SOURCE_TONES[source] ?? "bg-bg-primary text-muted",
  };
}
