// HTTPS landing for Stripe Connect Account Link return/refresh (live mode requires HTTPS).
// Redirects creators back into the Noni app Balance screen.

const APP_SCHEME_URL = Deno.env.get('APP_DEEP_LINK') ?? 'noni://balance';

function html(deepLink: string, refresh: boolean): string {
  const title = refresh ? 'Continue payout setup' : 'Payout setup saved';
  const body = refresh
    ? 'Your Stripe link expired. Open Noni to continue.'
    : 'You can close this tab and return to Noni.';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta http-equiv="refresh" content="0;url=${deepLink}" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 48px 24px; color: #0B0B0F; background: #F7F5F2; }
    a { color: #0B0B0F; font-weight: 700; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>${body}</p>
  <p><a href="${deepLink}">Open Noni Balance</a></p>
  <script>window.location.replace(${JSON.stringify(deepLink)});</script>
</body>
</html>`;
}

Deno.serve((req) => {
  const url = new URL(req.url);
  const refresh = url.searchParams.get('connect') === 'refresh';
  const deepLink = refresh
    ? `${APP_SCHEME_URL}${APP_SCHEME_URL.includes('?') ? '&' : '?'}connect=refresh`
    : APP_SCHEME_URL;
  return new Response(html(deepLink, refresh), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
