/**
 * Retired Stewardship Spot contact route.
 * Existing leads and the shared Discord webhook remain untouched.
 * Do not parse, persist, forward, or notify on new legacy submissions.
 */
export async function onRequestPost() {
  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Contact has moved to Leading Sharp</title>
</head>
<body>
  <main>
    <h1>Stewardship Spot is becoming Leading Sharp.</h1>
    <p>This contact form has moved. Your message was not submitted.</p>
    <p>For help with your church’s stewardship, project, or leadership questions,
      <a href="https://leadingsharp.com/contact">start a conversation with Frank at Leading Sharp</a>.</p>
    <p>Please enter your message there. We have not forwarded your personal information.</p>
    <p><a href="/articles/">Read the Stewardship Spot articles</a>.</p>
  </main>
</body>
</html>`, {
    status: 410,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
    },
  });
}
