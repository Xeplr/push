var { test } = require('node:test');
var assert = require('node:assert/strict');
var { createSender, TTL_SECONDS } = require('../lib/sender');

var VAPID = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:ops@x.com' };

function setup(devices, failWith) {
  var sent = [], removed = [], warned = [];
  var store = {
    devicesOf: async function(target) { return devices.filter(function(d) { return (target.userIds || []).indexOf(d.userId) !== -1 || (target.emails || []).indexOf(d.email) !== -1; }); },
    sent: async function() {},
    removeEndpoint: async function(e) { removed.push(e); }
  };
  var webPush = { sendNotification: async function(sub, payload, opts) {
    var code = failWith && failWith[sub.endpoint];
    if (code) { var e = new Error('push service said ' + code); e.statusCode = code; throw e; }
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), opts: opts });
  } };
  var sender = createSender({ store: store, webPush: webPush, vapid: function() { return VAPID; }, log: { warn: function(m) { warned.push(m); } } });
  return { send: sender.send, sent: sent, removed: removed, warned: warned };
}

var D = function(n, userId, email) { return { endpoint: 'https://push.example/' + n, p256dh: 'k' + n, auth: 'a' + n, userId: userId, email: email }; };

test('every device of these people, by id or email, each once; never whoever did it', async function() {
  var w = setup([D(1, 'u1', 'neha@x.com'), D(2, 'u1', 'neha@x.com'), D(3, 'u2', 'riya@x.com'), D(4, 'u3', 'amit@x.com')]);
  var out = await w.send({ userIds: ['u1'], emails: ['neha@x.com', 'riya@x.com'] }, { title: 'Overdue: Pack', url: '/orders/1' }, { except: { emails: ['riya@x.com'] } });
  assert.deepEqual(out, { devices: 2, sent: 2, removed: 0, failed: 0 });
  assert.deepEqual(w.sent.map(function(s) { return s.endpoint; }).sort(), ['https://push.example/1', 'https://push.example/2']);
  assert.deepEqual(w.sent[0].payload, { title: 'Overdue: Pack', body: '', url: '/orders/1' });
  assert.deepEqual(w.sent[0].opts, { TTL: TTL_SECONDS, urgency: 'high', vapidDetails: VAPID });
});

test('a device the push service says is gone is removed; another failure is logged; the rest still go', async function() {
  var w = setup([D(1, 'u1'), D(2, 'u1'), D(3, 'u1')], { 'https://push.example/1': 410, 'https://push.example/2': 500 });
  var out = await w.send({ userIds: ['u1'] }, { title: 'T' });
  assert.deepEqual(out, { devices: 3, sent: 1, removed: 1, failed: 1 });
  assert.deepEqual(w.removed, ['https://push.example/1']);
  assert.match(w.warned[0], /500/);
});

test('no keys: nothing sent, and why; no one to send to: nothing', async function() {
  var off = createSender({ store: { devicesOf: async function() { throw new Error('not asked'); } }, webPush: {}, vapid: function() { return null; } });
  assert.match((await off.send({ userIds: ['u1'] }, { title: 'T' })).skipped, /not set up/);
  var w = setup([D(1, 'u1')]);
  assert.deepEqual(await w.send({}, { title: 'T' }), { devices: 0, sent: 0, removed: 0, failed: 0 });
  await assert.rejects(w.send({ userIds: ['u1'] }, {}), /needs a title/);
});
