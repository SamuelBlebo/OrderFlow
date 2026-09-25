import type { Env } from './env';
import { logOutboundMessage } from './messages';
import { touchLastMessageAt } from './customers';
import type { WhatsappAccount } from './types';

/**
 * Mirrors functions/src/whatsapp/client.ts exactly — same payload shapes and
 * truncation limits, so a customer sees identical messages regardless of
 * which backend answered them. `send()` is also the one choke point every
 * outbound message passes through, so it doubles as where the Inbox's
 * conversation log gets written — callers don't have to remember to log.
 */

interface SendResult {
  ok: boolean;
  error?: string;
}

async function send(
  env: Env,
  account: WhatsappAccount,
  to: string,
  payload: Record<string, unknown>,
  log: { type: string; body: string | null } | null,
): Promise<SendResult> {
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${account.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('WhatsApp send failed', response.status, detail);
    return { ok: false, error: detail };
  }

  if (log) {
    // Best-effort: a logging hiccup should never fail the send itself, the
    // customer already got their message.
    await Promise.all([
      logOutboundMessage(env, account.organizationId, to, log.type, log.body),
      touchLastMessageAt(env, account.organizationId, to),
    ]).catch((err) => console.error('Failed to log outbound message', err));
  }

  return { ok: true };
}

export function sendText(env: Env, account: WhatsappAccount, to: string, body: string) {
  return send(env, account, to, { to, type: 'text', text: { preview_url: false, body } }, { type: 'text', body });
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export function sendList(
  env: Env,
  account: WhatsappAccount,
  to: string,
  opts: { body: string; buttonLabel: string; sectionTitle: string; rows: ListRow[]; footer?: string },
) {
  return send(
    env,
    account,
    to,
    {
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: truncate(opts.body, 1024) },
        ...(opts.footer ? { footer: { text: truncate(opts.footer, 60) } } : {}),
        action: {
          button: truncate(opts.buttonLabel, 20),
          sections: [
            {
              title: truncate(opts.sectionTitle, 24),
              rows: opts.rows.slice(0, 10).map((row) => ({
                id: row.id.slice(0, 200),
                title: truncate(row.title, 24),
                ...(row.description ? { description: truncate(row.description, 72) } : {}),
              })),
            },
          ],
        },
      },
    },
    { type: 'interactive', body: opts.body },
  );
}

export function sendButtons(
  env: Env,
  account: WhatsappAccount,
  to: string,
  opts: { body: string; buttons: Array<{ id: string; title: string }>; header?: string },
) {
  return send(
    env,
    account,
    to,
    {
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(opts.header ? { header: { type: 'text', text: truncate(opts.header, 60) } } : {}),
        body: { text: truncate(opts.body, 1024) },
        action: {
          buttons: opts.buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id.slice(0, 200), title: truncate(b.title, 20) },
          })),
        },
      },
    },
    { type: 'interactive', body: opts.body },
  );
}

/** Not a conversational message — nothing useful to show in the Inbox, so it's the one send that isn't logged. */
export function markAsRead(env: Env, account: WhatsappAccount, messageId: string) {
  return send(env, account, '', { status: 'read', message_id: messageId }, null);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
