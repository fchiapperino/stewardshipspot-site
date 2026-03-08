/**
 * Cloudflare Pages Function: /api/leads (read-only)
 *
 * Purpose (Phase 2, Chunk 1): provide an incremental D1 read path so reporting
 * can stop depending on Discord history.
 *
 * Auth: signed URL (HMAC-SHA256) using query params ts + sig.
 * Cursor model (incremental):
 * - Request: after_cursor = checkpoint representing LAST lead already reported
 * - Response: next_cursor = checkpoint representing LAST lead in this response
 *
 * Parameter strictness:
 * - Require exactly ONE of: after_cursor OR since
 *   - after_cursor: normal incremental machine path
 *   - since: explicit bootstrap/debug path
 * - Do not accept both.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const TTL_SECONDS = 120;

function bad(status, msg) {
  return new Response(msg, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function clampInt(v, min, max, fallback) {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function canonicalizeQuery(params, omitKeys = []) {
  const omit = new Set(omitKeys);
  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (omit.has(k)) continue;
    pairs.push([k, v]);
  }
  pairs.sort((a, b) => {
    if (a[0] === b[0]) return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
    return a[0] < b[0] ? -1 : 1;
  });
  return pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function hmacSha256Hex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const bytes = new Uint8Array(sigBuf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Cursor is base64url(JSON.stringify({received_at, id}))
function parseCursor(cursorStr) {
  if (!cursorStr) return null;
  try {
    const b64 = cursorStr.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = atob(b64);
    const obj = JSON.parse(jsonStr);
    if (!obj || typeof obj.received_at !== 'string' || typeof obj.id !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}

function makeCursor(receivedAt, id) {
  const jsonStr = JSON.stringify({ received_at: receivedAt, id });
  return btoa(jsonStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return bad(500, 'D1 binding DB not configured');
  if (!env.LEADS_READ_SECRET) return bad(500, 'LEADS_READ_SECRET not configured');

  const url = new URL(request.url);
  const params = url.searchParams;

  // ---- Signed URL auth ----
  const tsStr = params.get('ts');
  const sig = params.get('sig');
  if (!tsStr || !sig) return bad(401, 'Missing ts/sig');

  const ts = Number.parseInt(tsStr, 10);
  if (!Number.isFinite(ts)) return bad(401, 'Invalid ts');

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TTL_SECONDS) return bad(401, 'Signed URL expired');

  const canonicalQuery = canonicalizeQuery(params, ['sig']);
  const canonicalString = ['GET', url.pathname, canonicalQuery].join('\n');
  const expectedSig = await hmacSha256Hex(env.LEADS_READ_SECRET, canonicalString);
  if (!constantTimeEqual(expectedSig, sig)) return bad(401, 'Bad signature');

  // ---- Strict parameters (exactly one of after_cursor or since) ----
  const afterCursorStr = params.get('after_cursor');
  const since = params.get('since');

  const hasAfter = !!afterCursorStr;
  const hasSince = !!since;

  if ((hasAfter && hasSince) || (!hasAfter && !hasSince)) {
    return bad(
      400,
      'Provide exactly one of: after_cursor (incremental) OR since (bootstrap/debug).'
    );
  }

  const limit = clampInt(params.get('limit'), 1, MAX_LIMIT, DEFAULT_LIMIT);

  let leads = [];

  if (hasAfter) {
    const after = parseCursor(afterCursorStr);
    if (!after) return bad(400, 'Invalid after_cursor');

    const r = await env.DB.prepare(`
      SELECT id, received_at, name, email, church, message, page,
             discord_post_succeeded, discord_error
      FROM leads
      WHERE (received_at > ?)
         OR (received_at = ? AND id > ?)
      ORDER BY received_at ASC, id ASC
      LIMIT ?
    `)
      .bind(after.received_at, after.received_at, after.id, limit)
      .all();

    leads = r.results ?? [];
  } else {
    // since mode
    // We treat since as an ISO string and compare lexicographically.
    // This works because received_at is ISO8601 in UTC (lex order == time order).
    const r = await env.DB.prepare(`
      SELECT id, received_at, name, email, church, message, page,
             discord_post_succeeded, discord_error
      FROM leads
      WHERE received_at > ?
      ORDER BY received_at ASC, id ASC
      LIMIT ?
    `)
      .bind(since, limit)
      .all();

    leads = r.results ?? [];
  }

  const count = leads.length;
  const nextCursor = count > 0 ? makeCursor(leads[count - 1].received_at, leads[count - 1].id) : afterCursorStr ?? null;

  return json({
    ok: true,
    query: {
      after_cursor: afterCursorStr ?? null,
      since: since ?? null,
      limit,
    },
    count,
    leads,
    next_cursor: nextCursor,
  });
}
