/** Split a stored meeting note ``Speaker 1: …`` / ``Alex: …`` into parts. */

const SPEAKER_PREFIX = /^([^:]{1,80}):\s+([\s\S]+)$/;

export function splitMeetingNoteLine(line: string): { speaker: string | null; text: string } {
  const trimmed = line.trim();
  const match = SPEAKER_PREFIX.exec(trimmed);
  if (!match) {
    return { speaker: null, text: trimmed };
  }
  return { speaker: match[1], text: match[2] };
}
