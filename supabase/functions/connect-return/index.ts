// HTTPS landing for Stripe Connect / Checkout return (live mode requires HTTPS).
// Redirects creators to Balance, admins to billing when ?to=admin-billing.

const APP_SCHEME_URL = Deno.env.get('APP_DEEP_LINK') ?? 'noni://balance';
const ADMIN_BILLING_URL =
  Deno.env.get('APP_ADMIN_BILLING_DEEP_LINK') ?? 'noni://admin-billing';

function resolveDeepLink(url: URL): { deepLink: string; refresh: boolean; label: string } {
  const to = url.searchParams.get('to');
  const refresh =
    url.searchParams.get('connect') === 'refresh' ||
    url.searchParams.get('billing') === 'cancel';

  if (to === 'admin-billing') {
    const deepLink = refresh
      ? `${ADMIN_BILLING_URL}${ADMIN_BILLING_URL.includes('?') ? '&' : '?'}billing=cancel`
      : ADMIN_BILLING_URL;
    return { deepLink, refresh, label: 'Billing' };
  }

  const deepLink = refresh
    ? `${APP_SCHEME_URL}${APP_SCHEME_URL.includes('?') ? '&' : '?'}connect=refresh`
    : APP_SCHEME_URL;
  return { deepLink, refresh, label: 'Balance' };
}

function html(deepLink: string, refresh: boolean, label: string): string {
  const title = refresh ? `Continue ${label.toLowerCase()} setup` : `${label} setup saved`;
  const body = refresh
    ? 'Your Stripe link expired or was canceled. Open Noni to continue.'
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
  <p><a href="${deepLink}">Open Noni ${label}</a></p>
  <script>window.location.replace(${JSON.stringify(deepLink)});</script>
</body>
</html>`;
}

Deno.serve((req) => {
  const url = new URL(req.url);
  const { deepLink, refresh, label } = resolveDeepLink(url);
  return new Response(html(deepLink, refresh, label), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
