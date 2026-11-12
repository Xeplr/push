// @xeplr/push — Web Push for xeplr apps: a notification on a person's phone or
// computer even when the app is closed.
//
//   var push = require('@xeplr/push')
//   await push.init({ knex })                         // its table, in the app's database
//   app.use('/api/push', gate, push.router({ userOf: (req) => req.user }))
//   await push.send({ emails: ['neha@x.com'] }, { title: 'Overdue: Pack the frame', body: '#GA1023', url: '/orders/abc' })
//
// The browser side — the "Notifications on this device" switch and the
// service worker that shows them — is @xeplr/ui-account's.
//
// Keys (VAPID: the app's identity to the push services), from the environment
// unless passed to init():
//
//   PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_PRIVATE_KEY   made once: npx xeplr-push keys
//   PUSH_VAPID_SUBJECT                              mailto:you@domain or https://domain
//
// Without them push is OFF, not broken: send() sends nothing and says why, the
// key route says enabled: false, and the app's switch does not offer itself.
var path = require('path');
var { createStore } = require('./lib/store');
var { createSender, TTL_SECONDS } = require('./lib/sender');
var { createRouter } = require('./lib/router');
var { payloadOf, subscriptionOf } = require('./lib/payload');

var MIGRATIONS_TABLE = 'xeplr_push_migrations';
var state = { knex: null, vapid: null, webPush: null, log: console };

function knexOf() {
  if (!state.knex) throw new Error('@xeplr/push: call init({ knex }) first');
  return typeof state.knex === 'function' && !state.knex.client ? state.knex() : state.knex;
}

function vapidFrom(config) {
  var v = config.vapid || {
    publicKey: process.env.PUSH_VAPID_PUBLIC_KEY,
    privateKey: process.env.PUSH_VAPID_PRIVATE_KEY,
    subject: process.env.PUSH_VAPID_SUBJECT
  };
  if (!v.publicKey || !v.privateKey) return null;
  return { publicKey: String(v.publicKey).trim(), privateKey: String(v.privateKey).trim(), subject: String(v.subject || '').trim() };
}

var store = createStore(knexOf);
var sender = createSender({
  store: store,
  webPush: { sendNotification: function() { return state.webPush.sendNotification.apply(state.webPush, arguments); } },
  vapid: function() { return state.vapid; },
  log: { warn: function(m) { state.log.warn(m); } }
});

/**
 * Set it up: the keys, and the push_subscriptions table in the app's database
 * (its own migrations, ledger xeplr_push_migrations — then XEPLR_PUSH_MIGRATIONS'
 * directories, if any). Safe to call at every start.
 *
 * @param {{ knex: import('knex').Knex | (() => import('knex').Knex), vapid?: { publicKey, privateKey, subject }, webPush?: object, log?: object, migrate?: boolean }} config
 * @returns {Promise<{ enabled: boolean, migrations: string[] }>}
 */
async function init(config) {
  config = config || {};
  if (!config.knex) throw new Error('@xeplr/push: init({ knex }) — the app\'s knex, where its table goes');
  state.knex = config.knex;
  state.log = config.log || console;
  state.webPush = config.webPush || require('web-push');
  state.vapid = vapidFrom(config);
  if (state.vapid && !/^(mailto:|https:\/\/)/.test(state.vapid.subject)) {
    throw new Error('@xeplr/push: PUSH_VAPID_SUBJECT must be mailto:you@domain or https://domain — the push services contact it about problems');
  }
  var ran = [];
  if (config.migrate !== false) {
    var dirs = [path.join(__dirname, 'migrations')].concat(String(process.env.XEPLR_PUSH_MIGRATIONS || '').split(',').map(function(d) { return d.trim(); }).filter(Boolean).map(function(d) { return path.resolve(d); }));
    var result = await knexOf().migrate.latest({ directory: dirs, tableName: MIGRATIONS_TABLE, loadExtensions: ['.js'] });
    ran = result[1] || [];
  }
  return { enabled: Boolean(state.vapid), migrations: ran };
}

/** Whether keys are set: push can go out. */
function enabled() {
  return Boolean(state.vapid);
}

/** The public key the browser subscribes with, or null when push is off. */
function publicKey() {
  return state.vapid ? state.vapid.publicKey : null;
}

/**
 * The routes a device is switched on and off with (see lib/router.js).
 * @param {{ userOf: (req) => ({ id, email? })|null, express?: object }} options  userOf: the signed-in person
 */
function router(options) {
  if (!options || typeof options.userOf !== 'function') throw new Error('@xeplr/push: router({ userOf }) — how to read the signed-in person off a request');
  return createRouter({ store: store, publicKey: publicKey, userOf: options.userOf, express: options.express || require('express') });
}

/** The environment it reads, for an app's env.required.js — only when push should be on. */
var requiredEnv = ['PUSH_VAPID_PUBLIC_KEY', 'PUSH_VAPID_PRIVATE_KEY', 'PUSH_VAPID_SUBJECT'];

module.exports = {
  init: init,
  enabled: enabled,
  publicKey: publicKey,
  router: router,
  send: sender.send,
  requiredEnv: requiredEnv,
  TTL_SECONDS: TTL_SECONDS,
  // Pure, for apps and tests.
  payloadOf: payloadOf,
  subscriptionOf: subscriptionOf,
  // The pieces, to wire by hand.
  createStore: createStore,
  createSender: createSender,
  createRouter: createRouter
};
