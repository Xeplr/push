// SENDING — one message to every device of these people, through the Web Push
// protocol (the `web-push` library) with the app's VAPID keys.
//
// A device the push service says is gone (404, 410: the person switched it off
// in the phone's settings, uninstalled, or the subscription expired) is
// removed, so it is never tried again. Any other failure is counted and
// logged, and the rest still go: one bad device never stops the others.
// Never throws for a device; only for a message that is not one (no title).
var { payloadOf } = require('./payload');

// How long a push service keeps a message for a phone that is off: a day.
// After that, an "overdue" from yesterday is noise, not news.
var TTL_SECONDS = 24 * 60 * 60;

/**
 * @param {{
 *   store: ReturnType<typeof import('./store').createStore>,
 *   webPush: { sendNotification: Function },
 *   vapid: () => ({ subject: string, publicKey: string, privateKey: string }) | null,
 *   log?: { warn: Function }
 * }} deps
 */
function createSender(deps) {
  var log = deps.log || console;

  /**
   * @param {{ userIds?: string[], emails?: string[], everyone?: boolean }} target  everyone: every device switched on, for news everyone follows (a new order)
   * @param {{ title: string, body?: string, url?: string, tag?: string }} message
   * @param {{ except?: { userIds?: string[], emails?: string[] }, ttl?: number }} [opts]  except: never these (whoever did it)
   * @returns {Promise<{ devices: number, sent: number, removed: number, failed: number, skipped?: string }>}
   */
  async function send(target, message, opts) {
    var payload = JSON.stringify(payloadOf(message));
    var vapid = deps.vapid();
    if (!vapid) return { devices: 0, sent: 0, removed: 0, failed: 0, skipped: 'push is not set up (no VAPID keys)' };
    var except = (opts && opts.except) || {};
    var noIds = (except.userIds || []).map(String);
    var noEmails = (except.emails || []).map(function(e) { return String(e).toLowerCase(); });
    var seen = {};
    var devices = (await deps.store.devicesOf(target || {})).filter(function(d) {
      if (seen[d.endpoint]) return false;
      seen[d.endpoint] = true;
      return noIds.indexOf(String(d.userId)) === -1 && !(d.email && noEmails.indexOf(d.email) !== -1);
    });
    var out = { devices: devices.length, sent: 0, removed: 0, failed: 0 };
    await Promise.all(devices.map(async function(d) {
      try {
        await deps.webPush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, {
          TTL: opts && opts.ttl !== undefined ? opts.ttl : TTL_SECONDS,
          urgency: 'high',
          vapidDetails: vapid
        });
        out.sent++;
        await deps.store.sent(d.endpoint).catch(function() {});
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          out.removed++;
          await deps.store.removeEndpoint(d.endpoint).catch(function() {});
        } else {
          out.failed++;
          log.warn('[push] could not send to a device of ' + d.userId + ': ' + (err && err.statusCode ? err.statusCode + ' ' : '') + (err && err.message ? err.message : err));
        }
      }
    }));
    return out;
  }

  return { send: send };
}

module.exports = { createSender: createSender, TTL_SECONDS: TTL_SECONDS };
