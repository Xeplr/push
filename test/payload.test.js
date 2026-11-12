var { test } = require('node:test');
var assert = require('node:assert/strict');
var { payloadOf, subscriptionOf, safePath } = require('../lib/payload');

test('a message: a title is required; text is tidied and kept short', function() {
  assert.throws(function() { payloadOf({ body: 'x' }); }, /needs a title/);
  var p = payloadOf({ title: '  Overdue:\n Pack the frame ', body: '#GA1023 ·  Neha', url: '/orders/abc', tag: 'task-1' });
  assert.deepEqual(p, { title: 'Overdue: Pack the frame', body: '#GA1023 · Neha', url: '/orders/abc', tag: 'task-1' });
  assert.equal(payloadOf({ title: 'x'.repeat(500) }).title.length, 120);
  assert.equal(payloadOf({ title: 'T' }).tag, undefined, 'no tag: none sent');
});

test('a tap only ever opens a page of the app, never another site', function() {
  assert.equal(safePath('/tasks/9'), '/tasks/9');
  ['https://evil.example', '//evil.example', 'javascript:alert(1)', '', null].forEach(function(u) { assert.equal(safePath(u), '/', String(u)); });
});

test('a subscription: an https endpoint and both keys, or nothing', function() {
  var good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BPk', auth: 'xyz' }, expirationTime: null };
  assert.deepEqual(subscriptionOf(good), { endpoint: good.endpoint, p256dh: 'BPk', auth: 'xyz' });
  assert.equal(subscriptionOf({ endpoint: 'http://x', keys: good.keys }), null, 'not https');
  assert.equal(subscriptionOf({ endpoint: good.endpoint, keys: { p256dh: 'BPk' } }), null, 'no auth key');
  assert.equal(subscriptionOf('nope'), null);
});
