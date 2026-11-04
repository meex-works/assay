// The Assay Office poster. Posts to the channel, edits a post in place, and threads events as comments: Telegram copies
// every channel post into the linked discussion group (`is_automatic_forward`), and a comment is a reply to that copy,
// so the poster reads the group's updates to learn each copy's message id.
// Plain text only (no Markdown, nothing to escape). Each chat is paced to stay inside Telegram's limits.
import { secret } from "./keys.ts";

const TOKEN = secret("desk-telegram-bot", "desk");   // @meexplexbot: admin in @assayoffice and in its discussion group
const API = `https://api.telegram.org/bot${TOKEN}/`;
export const DRY = process.env.ASSAY_POST === "0";
export const tgStats = { sent: 0, edited: 0, comments: 0, errors: 0, dry: DRY };

async function call(method: string, body: Record<string, unknown>): Promise<any> {
  for (let i = 0; ; i++) {
    const r = await fetch(API + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) }).catch((e) => e as Error);
    if (r instanceof Error) { if (i < 3) continue; tgStats.errors++; throw r; }
    const j = await r.json();
    if (j.ok) return j.result;
    if (j.error_code === 429 && i < 5) { await new Promise((z) => setTimeout(z, 1000 * (j.parameters?.retry_after ?? 3))); continue; }
    if (/message is not modified/.test(j.description ?? "")) return null;
    tgStats.errors++;
    console.error(`[telegram] ${method}: ${j.error_code} ${j.description}`);
    throw new Error(`${method}: ${j.description}`);
  }
}

// one queue per chat, ≥ 3.1 s apart (Telegram allows ~20 messages a minute in a group)
const lanes = new Map<string, Promise<unknown>>();
function paced<T>(chat: string, fn: () => Promise<T>): Promise<T> {
  const prev = lanes.get(chat) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  lanes.set(chat, next.then(() => new Promise((r) => setTimeout(r, 3100)), () => new Promise((r) => setTimeout(r, 3100))));
  return next;
}

let groupId: number | null = null;
const copies = new Map<number, number>();            // channel message id → its copy in the discussion group
const waiting = new Map<number, ((id: number) => void)[]>();

export async function init(channel: string) {
  if (DRY) return;
  const chat = await call("getChat", { chat_id: channel });
  groupId = chat.linked_chat_id ?? null;
  if (!groupId) console.error("[telegram] the channel has no linked discussion group: comments disabled");
  pollUpdates().catch((e) => console.error(`[telegram] updates stopped: ${e.message}`));
}

async function pollUpdates() {
  let offset = 0;
  for (;;) {
    let ups: any[] = [];
    try { ups = await call("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] }); }
    catch { await new Promise((r) => setTimeout(r, 5000)); continue; }
    for (const u of ups) {
      offset = u.update_id + 1;
      const m = u.message;
      if (!m?.is_automatic_forward || m.chat?.id !== groupId) continue;
      const src = m.forward_origin?.message_id ?? m.forward_from_message_id;
      if (!src) continue;
      copies.set(src, m.message_id);
      for (const r of waiting.get(src) ?? []) r(m.message_id);
      waiting.delete(src);
    }
  }
}

function copyOf(channelMsg: number, ms = 20_000): Promise<number | null> {
  const known = copies.get(channelMsg);
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    const list = waiting.get(channelMsg) ?? [];
    list.push((id) => { clearTimeout(t); resolve(id); });
    waiting.set(channelMsg, list);
  });
}

let dryId = 1;
export async function post(channel: string, text: string): Promise<number> {
  if (DRY) { console.log(`[dry post]\n${text}\n`); return dryId++; }
  const m = await paced(channel, () => call("sendMessage", { chat_id: channel, text, link_preview_options: { is_disabled: true } }));
  tgStats.sent++;
  return m.message_id;
}

export async function edit(channel: string, msg: number, text: string): Promise<void> {
  if (DRY) { console.log(`[dry edit ${msg}]\n${text}\n`); return; }
  await paced(channel, () => call("editMessageText", { chat_id: channel, message_id: msg, text, link_preview_options: { is_disabled: true } }));
  tgStats.edited++;
}

/** A comment under a channel post (a reply to its copy in the discussion group). Returns the group's message id. */
export async function comment(channelMsg: number, text: string): Promise<number | null> {
  if (DRY) { console.log(`[dry comment on ${channelMsg}] ${text}`); return null; }
  if (!groupId) return null;
  const copy = await copyOf(channelMsg);
  const body: Record<string, unknown> = { chat_id: groupId, text, link_preview_options: { is_disabled: true } };
  if (copy) body.reply_parameters = { message_id: copy, allow_sending_without_reply: true };
  const m = await paced(String(groupId), () => call("sendMessage", body));
  tgStats.comments++;
  return m.message_id;
}
