export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return { statusCode: 500, body: 'DISCORD_WEBHOOK_URL not configured' };
  }

  // Parse form-encoded body
  const params = new URLSearchParams(event.body || '');
  const botField = (params.get('bot-field') || '').trim();
  const name = (params.get('name') || '').trim();
  const email = (params.get('email') || '').trim();
  const church = (params.get('church') || '').trim();
  const message = (params.get('message') || '').trim();

  // Honeypot: if filled, treat as spam and silently succeed.
  if (botField) {
    return {
      statusCode: 302,
      headers: { Location: '/thanks.html' },
      body: ''
    };
  }

  const missing = [];
  if (!name) missing.push('name');
  if (!email) missing.push('email');
  if (!church) missing.push('church');
  if (!message) missing.push('message');

  if (missing.length) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'text/plain' },
      body: `Missing: ${missing.join(', ')}`
    };
  }

  const content = [
    '**New Stewardship Spot request**',
    `**Name:** ${name}`,
    `**Email:** ${email}`,
    `**Church:** ${church}`,
    `**Message:** ${message}`,
    `**Page:** ${event.headers?.referer || 'unknown'}`,
  ].join('\n');

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { statusCode: 502, body: `Discord webhook failed: ${res.status} ${text}` };
  }

  // Redirect to existing thanks page
  return {
    statusCode: 302,
    headers: {
      Location: '/thanks.html'
    },
    body: ''
  };
}
