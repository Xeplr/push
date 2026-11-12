// WHAT ONE NOTIFICATION SAYS — pure: the app's words in, the JSON the service
// worker (@xeplr/ui-account's xeplr-push-sw.js) reads out.
//
//   { title, body, url, tag }
//
// title   the first line, required — "Overdue: Pack the frame"
// body    under it — "#GA1023 · Neha"
// url     where a tap opens, inside the app: "/orders/abc" (never another site)
// tag     the same tag replaces the one shown before, so one task's alerts
//         stack as one notification instead of five
//
// Push services refuse a payload over about 4 KB; these limits keep every
// message well under that, whatever the app passes.
var TITLE_MAX = 120;
var BODY_MAX = 300;
var URL_MAX = 500;
var TAG_MAX = 100;

function clip(v, max) {
  var s = v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** A path inside the app ("/orders/1"), or "/" — a full URL to another site is never opened. */
function safePath(url) {
  var s = url == null ? '' : String(url).trim();
  if (!s || s.charAt(0) !== '/' || s.charAt(1) === '/') return '/';
  return s.slice(0, URL_MAX);
}

/**
 * @param {{ title: string, body?: string, url?: string, tag?: string }} message
 * @returns {{ title: string, body: string, url: string, tag?: string }}
 */
function payloadOf(message) {
  var m = message || {};
  var title = clip(m.title, TITLE_MAX);
  if (!title) throw new Error('A push needs a title');
  var out = { title: title, body: clip(m.body, BODY_MAX), url: safePath(m.url) };
  var tag = clip(m.tag, TAG_MAX);
  if (tag) out.tag = tag;
  return out;
}

/** A browser's subscription (PushSubscription.toJSON()) as the store keeps it, or null when it is not one. */
function subscriptionOf(sub) {
  if (!sub || typeof sub !== 'object') return null;
  var endpoint = typeof sub.endpoint === 'string' ? sub.endpoint.trim() : '';
  var keys = sub.keys && typeof sub.keys === 'object' ? sub.keys : {};
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) return null;
  if (typeof keys.p256dh !== 'string' || !keys.p256dh || typeof keys.auth !== 'string' || !keys.auth) return null;
  if (keys.p256dh.length > 200 || keys.auth.length > 100) return null;
  return { endpoint: endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

module.exports = { payloadOf: payloadOf, subscriptionOf: subscriptionOf, safePath: safePath };
