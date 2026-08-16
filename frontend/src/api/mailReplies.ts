import { z } from "zod";
import { request, requestValidated } from "./client";

const GatedReasonSchema = z.enum(["pro", "toggle_off", "no_scope", "disabled"]).nullable();

const MailReplyItemSchema = z.object({
  id: z.number(),
  from_name: z.string(),
  from_local_part: z.string(),
  subject: z.string(),
  created_at: z.string(),
});

export type MailReplyItem = z.infer<typeof MailReplyItemSchema>;

const MailReplyListSchema = z.object({
  items: z.array(MailReplyItemSchema),
  enabled: z.boolean(),
  can_send: z.boolean(),
  gated_reason: GatedReasonSchema,
});

export type MailReplyList = z.infer<typeof MailReplyListSchema>;

const MailReplySettingsSchema = z.object({
  enabled: z.boolean(),
});

export type MailReplySettings = z.infer<typeof MailReplySettingsSchema>;

const MailReplyDraftSchema = z.object({
  draft_token: z.string(),
  to_name: z.string(),
  to_email: z.string(),
  subject: z.string(),
  body: z.string(),
});

export type MailReplyDraft = z.infer<typeof MailReplyDraftSchema>;

export function fetchMailReplies(): Promise<MailReplyList> {
  return requestValidated("/mail/replies", MailReplyListSchema);
}

export function fetchMailReplySettings(): Promise<MailReplySettings> {
  return requestValidated("/mail/replies/settings", MailReplySettingsSchema);
}

export function patchMailReplySettings(enabled: boolean): Promise<MailReplySettings> {
  return requestValidated("/mail/replies/settings", MailReplySettingsSchema, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function draftMailReply(id: number): Promise<MailReplyDraft> {
  return requestValidated(`/mail/replies/${id}/draft`, MailReplyDraftSchema, { method: "POST" });
}

export async function dismissMailReply(id: number): Promise<void> {
  await request<unknown>(`/mail/replies/${id}/dismiss`, { method: "POST" });
}

export async function sendMailReply(body: {
  draft_token: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/mail/replies/send", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function clearMailReplies(): Promise<void> {
  await request<unknown>("/mail/replies/clear", { method: "POST" });
}
