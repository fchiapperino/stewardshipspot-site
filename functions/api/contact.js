/**
 * Cloudflare Pages Function: /api/contact
 *
 * Accepts contact form POSTs (urlencoded or multipart) and:
 * 1) Stores the lead in Cloudflare D1 first (source of truth)
 * 2) Posts an alert copy to a Discord webhook (notification surface)
 *
 * Notes:
 * - Full message is always preserved in D1.
 * - Discord copy is truncated to avoid Discord/webhook length issues.
 */

const THANKS_PATH = '/thanks.html';
const DISCORD_MAX_CONTENT_LEN = 2000;

function truncateForDiscord(text, maxLen) {
  const s = String(text ?? '');
  if (s.length <= maxLen) return s;
  // Leave room for the ellipsis marker.
  return s.slice(0, Math.max(0, maxLen - 14)) + '\n…(truncated)';
}

export async function onRequestPost({ request, env }) {
  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return new Response('DISCORD_WEBHOOK_URL not configured', { status: 500 });
  }

  // D1 binding must be configured in Cloudflare Pages as binding name "DB".
  // (This project uses env.DB in code.)
  const db = env.DB;
  if (!db) {
    return new Response('D1 binding DB not configured', { status: 500 });
  }

  const contentType = request.headers.get('content-type') || '';
  let params;

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    params = new URLSearchParams(text);
  } else if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    params = new URLSearchParams();
    for (const [k, v] of form.entries()) params.set(k, String(v));
  } else {
    // Try anyway (some browsers omit it)
    const text = await request.text();
    params = new URLSearchParams(text);
  }

  // Honeypot
  const botField = (params.get('bot-field') || '').trim();
  if (botField) {
    return Response.redirect(new URL(THANKS_PATH, request.url).toString(), 303);
  }

  // Normalize inputs
  const name = (params.get('name') || '').trim();
  const email = (params.get('email') || '').trim().toLowerCase();
  const church = (params.get('church') || '').trim();
  const message = (params.get('message') || '').trim();

  const missing = [];
  if (!name) missing.push('name');
  if (!email) missing.push('email');
  if (!church) missing.push('church');
  if (!message) missing.push('message');

  if (missing.length) {
    return new Response(`Missing: ${missing.join(', ')}`, {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const page = request.headers.get('referer') || 'unknown';
  const id = crypto.randomUUID();
  const receivedAt = new Date().toISOString();

  // 1) Store in D1 FIRST (source of truth)
  try {
    await db
      .prepare(
        `INSERT INTO leads (
          id, received_at, name, email, church, message, page,
          discord_post_attempted, discord_post_succeeded, discord_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL)`
      )
      .bind(id, receivedAt, name, email, church, message, page)
      .run();
  } catch (err) {
    // Strict D1-first behavior: if we cannot store the lead, do not fall back to Discord.
    return new Response('Temporary error. Please try again.', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  // 2) Post Discord alert copy SECOND (best-effort)
  let discordOk = false;
  let discordErr = null;

  try {
    // Build a Discord-safe copy.
    // We keep the full message in D1, but truncate the Discord copy to reduce webhook failures.
    const baseLines = [
      '**New Stewardship Spot request**',
      `**Name:** ${name}`,
      `**Email:** ${email}`,
      `**Church:** ${church}`,
      // message inserted below
      `**Page:** ${page}`,
    ];

    // First attempt: include message; then truncate if needed.
    const messageLinePrefix = '**Message:** ';
    const roughBase = [
      baseLines[0],
      baseLines[1],
      baseLines[2],
      baseLines[3],
      // placeholder for message line
      baseLines[4],
    ].join('\n');

    // Compute max allowed for the message line content.
    // (roughBase includes the Page line already; we just need to fit the message line in the middle.)
    const overhead = roughBase.length + 1 + messageLinePrefix.length; // +1 for newline
    const maxMessageLen = Math.max(0, DISCORD_MAX_CONTENT_LEN - overhead);
    const safeMessage = truncateForDiscord(message, Math.min(message.length, maxMessageLen));

    const content = [
      '**New Stewardship Spot request**',
      `**Name:** ${name}`,
      `**Email:** ${email}`,
      `**Church:** ${church}`,
      `${messageLinePrefix}${safeMessage}`,
      `**Page:** ${page}`,
    ].join('\n');

    const payload = { content: truncateForDiscord(content, DISCORD_MAX_CONTENT_LEN) };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      discordErr = `Discord webhook failed: ${res.status} ${text}`.slice(0, 1800);
    } else {
      discordOk = true;
    }
  } catch (err) {
    discordErr = `Discord webhook exception: ${String(err)}`.slice(0, 1800);
  }

  // 3) Update D1 with Discord status (do not fail the user if this update fails)
  try {
    await db
      .prepare(
        `UPDATE leads
         SET discord_post_attempted = 1,
             discord_post_succeeded = ?,
             discord_error = ?
         WHERE id = ?`
      )
      .bind(discordOk ? 1 : 0, discordOk ? null : discordErr, id)
      .run();
  } catch (_) {
    // swallow
  }

  // 4) Redirect (POST → GET) to the thanks page
  return Response.redirect(new URL(THANKS_PATH, request.url).toString(), 303);
}
