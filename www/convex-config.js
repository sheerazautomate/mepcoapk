// Convex deployment used by the app.
//
// Deployment: dev:determined-dotterel-142
//
// This URL is public by design — it is the same value Convex embeds in any web
// client. Access control lives in the Convex functions themselves, never in the
// bundle. The deploy key (CONVEX_DEPLOY_KEY) is a SECRET and must never appear
// in this file; keep it in .env.local / CI secrets only.
window.CONVEX_URL = "https://determined-dotterel-142.convex.cloud";
