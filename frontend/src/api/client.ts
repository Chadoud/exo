import { z } from "zod";
import { BACKEND_PORT, DEFAULT_API_BASE } from "../constants";
import { formatError } from "../utils/formatError";

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || DEFAULT_API_BASE;

const SESSION_REQUEST_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `req-${Date.now()}`;

type BackendHttpResult = {
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
};

function hasBackendHttpProxy(): boolean {
  return typeof window !== "undefined" && typeof window.electronAPI?.backendHttp === "function";
}

/**
 * @deprecated M2.3 — durable app token is never exposed to the renderer.
 * Voice auth uses mintVoiceWsAuthTicket(); HTTP uses backendHttp proxy.
 */
export async function getAppToken(): Promise<string | null> {
  return null;
}

/** Raised when the server rejects a request with HTTP 402 (quota / license). */
export class EntitlementBlockedError extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super(detail);
    this.name = "EntitlementBlockedError";
    this.detail = detail;
  }
}

const EntitlementStatusSchema = z.object({
  trialActive: z.boolean(),
  trialStartedAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  trialDaysRemaining: z.number(),
  trialExpired: z.boolean(),
  subscriptionActive: z.boolean().optional(),
  subscriptionStatus: z.string().nullable().optional(),
  subscriptionCurrentPeriodEnd: z.string().nullable().optional(),
  subscriptionCancelAtPeriodEnd: z.boolean().optional(),
  subscriptionPlan: z.string().nullable().optional(),
  subscriptionEntitled: z.boolean().optional(),
  licensed: z.boolean(),
  unlimitedBuild: z.boolean().optional(),
  licenseReason: z.string().nullable(),
  canAnalyze: z.boolean(),
  canUseProactive: z.boolean().optional(),
  canUseSync: z.boolean().optional(),
  hasLicenseKey: z.boolean(),
  cloudAuthRequired: z.boolean().optional(),
  cloudLoggedIn: z.boolean().optional(),
  cloudEmail: z.string().nullable().optional(),
  cloudFirstName: z.string().nullable().optional(),
  cloudLastName: z.string().nullable().optional(),
  isProductAdmin: z.boolean().optional(),
  sortServiceMode: z.enum(["local", "cloud"]).optional(),
  sortServiceConfigured: z.boolean().optional(),
  sortCredentialsManaged: z.boolean().optional(),
  sortCredentialsExpiresAt: z.number().nullable().optional(),
  sortSyncLastError: z.string().nullable().optional(),
  sortEntitledModels: z.array(z.string()).optional(),
});

export type EntitlementStatus = z.infer<typeof EntitlementStatusSchema>;

function detailPartToString(part: unknown): string {
  if (part == null) return "";
  if (typeof part === "string") return part;
  if (typeof part === "number" || typeof part === "boolean") return String(part);
  if (Array.isArray(part)) return part.map(detailPartToString).filter(Boolean).join("; ");
  if (typeof part === "object") {
    const o = part as { msg?: unknown; message?: unknown };
    if (typeof o.msg === "string") return o.msg;
    if (typeof o.message === "string") return o.message;
    try {
      return JSON.stringify(part);
    } catch {
      return String(part);
    }
  }
  return String(part);
}

/** Parse a non-OK response into a human-readable error message. */
export async function extractApiError(res: Response): Promise<string> {
  const body = await res.text();
  try {
    const j = JSON.parse(body) as { detail?: unknown };
    if (j.detail === undefined || j.detail === null) {
      /* use raw body below */
    } else if (typeof j.detail === "string") {
      return j.detail;
    } else {
      const s = detailPartToString(j.detail);
      if (s) return s;
    }
  } catch {
    /* fall through to raw body */
  }
  return body;
}

function extractApiErrorFromText(body: string): string {
  try {
    const j = JSON.parse(body) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
    const s = detailPartToString(j.detail);
    if (s) return s;
  } catch {
    /* fall through */
  }
  return body;
}

/** Consistent message when fetch fails before an HTTP response (offline, wrong port, etc.). */
export function mapFetchFailureToError(e: unknown): Error {
  const msg = formatError(e);
  if (msg.toLowerCase().includes("failed to fetch") || e instanceof TypeError) {
    return new Error(
      `Cannot reach the API at ${API_BASE} (is the backend running on port ${BACKEND_PORT}?)`
    );
  }
  return new Error(msg);
}

function proxyResultToResponse(result: BackendHttpResult): Response {
  return new Response(result.text, {
    status: result.status || 502,
    headers: { "Content-Type": result.contentType || "application/json" },
  });
}

async function proxyBackendHttp(
  path: string,
  options?: RequestInit & { bodyBase64?: string; contentType?: string }
): Promise<Response> {
  const api = window.electronAPI?.backendHttp;
  if (!api) throw new Error("backendHttp unavailable");
  const method = (options?.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    "X-Request-Id": SESSION_REQUEST_ID,
  };
  const extra = options?.headers as Record<string, string> | undefined;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (k.toLowerCase() === "x-app-token") continue;
      headers[k] = v;
    }
  }
  let body: string | undefined;
  const bodyBase64 = options?.bodyBase64;
  const contentType = options?.contentType;
  if (!bodyBase64 && options?.body != null && typeof options.body === "string") {
    body = options.body;
  }
  const result = await api({
    path,
    method,
    headers,
    body,
    bodyBase64,
    contentType,
  });
  return proxyResultToResponse(result);
}

/**
 * Returns request headers for raw fetch when not using the Electron backend proxy.
 * In Electron, prefer `request()` / `desktopClient` (token stays in main).
 */
export async function getApiHeaders(
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "X-Request-Id": SESSION_REQUEST_ID };
  return { ...headers, ...(extra ?? {}) };
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    if (hasBackendHttpProxy()) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...((options?.headers as Record<string, string> | undefined) ?? {}),
      };
      res = await proxyBackendHttp(path, {
        ...options,
        headers,
        body: typeof options?.body === "string" ? options.body : options?.body != null ? String(options.body) : undefined,
      });
    } else {
      const baseHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Request-Id": SESSION_REQUEST_ID,
      };
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...baseHeaders, ...((options?.headers as Record<string, string> | undefined) ?? {}) },
      });
    }
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw mapFetchFailureToError(e);
  }
  if (!res.ok) {
    if (res.status === 402) {
      throw new EntitlementBlockedError(await extractApiError(res));
    }
    throw new Error(await extractApiError(res));
  }
  return res.json();
}

async function formDataToMultipartBase64(formData: FormData): Promise<{ bodyBase64: string; contentType: string }> {
  const boundary = `----ExoForm${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const chunks: Uint8Array[] = [];
  const enc = new TextEncoder();
  const push = (s: string) => chunks.push(enc.encode(s));

  for (const [name, value] of formData.entries()) {
    push(`--${boundary}\r\n`);
    if (typeof value === "string") {
      push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
      push(value);
      push(`\r\n`);
    } else {
      const file = value as File;
      const filename = file.name || "upload.bin";
      const type = file.type || "application/octet-stream";
      push(
        `Content-Disposition: form-data; name="${name}"; filename="${filename.replace(/"/g, "")}"\r\n`
      );
      push(`Content-Type: ${type}\r\n\r\n`);
      chunks.push(new Uint8Array(await file.arrayBuffer()));
      push(`\r\n`);
    }
  }
  push(`--${boundary}--\r\n`);

  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  let binary = "";
  const slice = 0x8000;
  for (let i = 0; i < merged.length; i += slice) {
    binary += String.fromCharCode(...merged.subarray(i, i + slice));
  }
  return {
    bodyBase64: btoa(binary),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * POST multipart form data (e.g. browser file uploads). Do not set `Content-Type`; the runtime adds the boundary.
 */
export async function requestMultipart<T>(path: string, formData: FormData, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    if (hasBackendHttpProxy()) {
      const { bodyBase64, contentType } = await formDataToMultipartBase64(formData);
      res = await proxyBackendHttp(path, {
        method: "POST",
        bodyBase64,
        contentType,
        ...init,
      });
    } else {
      res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        body: formData,
        ...init,
        headers: {
          "X-Request-Id": SESSION_REQUEST_ID,
          ...((init?.headers as Record<string, string> | undefined) ?? {}),
        },
      });
    }
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw mapFetchFailureToError(e);
  }
  if (!res.ok) {
    if (res.status === 402) {
      throw new EntitlementBlockedError(await extractApiError(res));
    }
    throw new Error(await extractApiError(res));
  }
  return res.json();
}

/** Fetch + Zod-validate a response. Throws on schema mismatch in all environments. */
export async function requestValidated<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const raw = await request<unknown>(path, options);
  const result = schema.safeParse(raw);
  if (!result.success) {
    console.error("[api] schema mismatch on", path, result.error.flatten());
    throw new Error(`[api] Unexpected response shape from ${path}`);
  }
  return result.data;
}

export function entitlementStatus() {
  return requestValidated("/entitlement/status", EntitlementStatusSchema);
}

export function health() {
  return request<{ status: string }>("/health");
}

const VideoIngestMetaSchema = z.object({
  ffmpeg_path: z.string().nullable(),
  ffprobe_path: z.string().nullable(),
  can_decode_video: z.boolean(),
  vendored_bundle_detected: z.boolean(),
  frame_count: z.number(),
  max_duration_sec: z.number(),
  max_extract_sec: z.number(),
  max_transcript_chars: z.number(),
  ffmpeg_timeout_sec: z.number(),
  ffprobe_timeout_sec: z.number(),
  stt_enabled: z.boolean(),
  stt_model: z.string(),
  debug_log: z.boolean(),
});

export type VideoIngestMeta = z.infer<typeof VideoIngestMetaSchema>;

export function videoIngestMeta() {
  return requestValidated("/meta/video", VideoIngestMetaSchema);
}

export { extractApiErrorFromText, hasBackendHttpProxy, proxyBackendHttp };
