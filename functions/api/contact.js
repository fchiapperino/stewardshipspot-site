/**
 * Cloudflare Pages Function: /api/contact
 *
 * Accepts application/x-www-form-urlencoded POSTs from the contact form.
 * Forwards the request to a Discord webhook.
 */

export async function onRequestPost({ request, env }) {
  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return new Response('DISCORD_WEBHOOK_URL not configured', { status: 500 });
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
    return Response.redirect(new URL('/thanks.html', request.url).toString(), 302);
  }

  const name = (params.get('name') || '').trim();
  const email = (params.get('email') || '').trim();
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

  const payload = {
    content: [
      '**New Stewardship Spot request**',
      `**Name:** ${name}`,
      `**Email:** ${email}`,
      `**Church:** ${church}`,
      `**Message:** ${message}`,
      `**Page:** ${page}`,
    ].join('\n')
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return new Response(`Discord webhook failed: ${res.status} ${text}`, { status: 502 });
  }

  return Response.redirect(new URL('/thanks.html', request.url).toString(), 302);
}
