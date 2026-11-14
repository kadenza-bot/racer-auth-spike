// The only place the two sides are named. Copied unchanged to both deploys.
// kadenzaOrigin: serves kadenza/ (iframe, popup, top-level seed page).
// hostOrigins: every "organizer site" origin that serves host/. Add a second
// one on another registrable domain to test cross-site partitioning (Q2b),
// and add it to frame-ancestors in k8s/nginx.conf too.
window.SPIKE_CONFIG = {
	version: "2026-11-14.1",
	kadenzaOrigin: "https://spike.demo.kadenza.pro",
	hostOrigins: ["https://kadenza-bot.github.io"],
	hostPageUrls: ["https://kadenza-bot.github.io/racer-auth-spike/"],
};
