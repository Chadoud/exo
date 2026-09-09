/**
 * useMeetingTranscription — stream microphone audio to the backend in
 * transcription-only mode so a meeting's spoken content becomes live notes.
 *
 * Deliberately minimal vs ``useVoiceSession``: no playback, no barge-in, no tool
 * handling. It reuses the same AudioWorklet (16 kHz Int16 PCM) and binary WS
 * protocol, pointed at ``/ws/voice?mode=transcribe&meeting_id=…``. The backend
 * appends each completed utterance to the meeting's notes, which the panel polls.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BACKEND_HOST, BACKEND_PORT, VOICE_CAPTURE_WORKLET_URL } from "../constants";
import {
  issueFromGetUserMediaFailure,
  type MeetingTranscriptionIssue,
} from "../utils/meetingTranscriptionIssue";
import { sendVoiceWsAppAuth } from "../voice/voiceWsAuth";

const WS_URL = `ws://${BACKEND_HOST}:${BACKEND_PORT}/ws/voice`;

interface MeetingTranscriptionStartResult {
  listening: boolean;
}

interface UseMeetingTranscriptionReturn {
  recording: boolean;
  issue: MeetingTranscriptionIssue | null;
  start: (meetingId: string) => Promise<MeetingTranscriptionStartResult>;
  stop: () => void;
}

export function useMeetingTranscription(): UseMeetingTranscriptionReturn {
  const [recording, setRecording] = useState(false);
  const [issue, setIssue] = useState<MeetingTranscriptionIssue | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const generationRef = useRef(0);
  const stoppingRef = useRef(false);
  const authReadyRef = useRef(false);

  const tearDown = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try {
        if (authReadyRef.current && ws.readyState === WebSocket.OPEN) {
          ws.send(new ArrayBuffer(0));
        }
        ws.close();
      } catch {
        /* already closing */
      }
    }
    workletRef.current?.port.close();
    workletRef.current?.disconnect();
    workletRef.current = null;
    srcRef.current?.disconnect();
    srcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    authReadyRef.current = false;
    setRecording(false);
  }, []);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    generationRef.current += 1;
    tearDown();
  }, [tearDown]);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(
    async (meetingId: string): Promise<MeetingTranscriptionStartResult> => {
      stop();
      stoppingRef.current = false;
      const generation = generationRef.current;
      setIssue(null);

      const stale = () => generationRef.current !== generation || stoppingRef.current;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        if (stale()) {
          stream.getTracks().forEach((t) => t.stop());
          return { listening: false };
        }
        streamRef.current = stream;

        const audioCtx = new AudioContext({ sampleRate: 16_000 });
        audioCtxRef.current = audioCtx;
        if (audioCtx.state === "suspended") await audioCtx.resume();
        if (stale()) {
          tearDown();
          return { listening: false };
        }
        await audioCtx.audioWorklet.addModule(VOICE_CAPTURE_WORKLET_URL);
        if (stale()) {
          tearDown();
          return { listening: false };
        }

        const ws = new WebSocket(
          `${WS_URL}?mode=transcribe&meeting_id=${encodeURIComponent(meetingId)}`,
        );
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        const opened = new Promise<boolean>((resolve) => {
          ws.onopen = () => resolve(true);
          ws.onerror = () => resolve(false);
        });

        ws.onclose = () => {
          if (wsRef.current !== ws) return;
          setRecording(false);
          if (!stoppingRef.current) setIssue("unavailable");
        };
        ws.onmessage = (event) => {
          if (typeof event.data !== "string") return;
          try {
            const frame = JSON.parse(event.data) as { type?: string };
            if (frame.type === "error") {
              setIssue("unavailable");
              stop();
            }
          } catch {
            /* non-JSON frame — ignore */
          }
        };

        const workletNode = new AudioWorkletNode(audioCtx, "voice-capture-processor");
        workletRef.current = workletNode;
        const srcNode = audioCtx.createMediaStreamSource(stream);
        srcRef.current = srcNode;
        srcNode.connect(workletNode);

        workletNode.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer }>) => {
          if (!authReadyRef.current) return;
          if (ws.readyState === WebSocket.OPEN) ws.send(e.data.pcm);
        };

        const didOpen = await opened;
        if (stale()) {
          tearDown();
          return { listening: false };
        }
        if (!didOpen || wsRef.current !== ws) {
          setIssue("unavailable");
          tearDown();
          return { listening: false };
        }

        const auth = await sendVoiceWsAppAuth(ws);
        if (stale() || wsRef.current !== ws) {
          tearDown();
          return { listening: false };
        }
        if (!auth.ok) {
          setIssue("unavailable");
          tearDown();
          return { listening: false };
        }

        authReadyRef.current = true;
        setRecording(true);
        return { listening: true };
      } catch (e) {
        if (!stale()) {
          setIssue(issueFromGetUserMediaFailure(e));
          tearDown();
        }
        return { listening: false };
      }
    },
    [stop, tearDown],
  );

  return { recording, issue, start, stop };
}
