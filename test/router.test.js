var { test } = require('node:test');
var assert = require('node:assert/strict');
var express = require('express');
var { createRouter } = require('../lib/router');

function serve(opts) {
  var rows = [];
  var store = {
    save: async function(user, sub) { rows = rows.filter(function(r) { return r.endpoint !== sub.endpoint; }); rows.push(Object.assign({ userId: user.id }, sub)); },
    remove: async function(user, endpoint) { rows = rows.filter(function(r) { return !(r.endpoint === endpoint && r.userId === user.id); }); },
    has: async function(user, endpoint) { return rows.some(function(r) { return r.endpoint === endpoint && r.userId === user.id; }); }
  };
  var app = express();
  app.use(function(req, res, next) { req.user = req.get('x-user') ? { id: req.get('x-user') } : null; next(); });
  app.use('/push', createRouter({ store: store, publicKey: function() { return opts.key; }, userOf: function(req) { return req.user; }, express: express }));
  return new Promise(function(resolve) {
    var server = app.listen(0, function() {
      var base = 'http://127.0.0.1:' + server.address().port + '/push';
      var call = async function(method, path, body, user) {
        var res = await fetch(base + path, { method: method, headers: Object.assign({ 'content-type': 'application/json' }, user ? { 'x-user': user } : {}), body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json() };
      };
      resolve({ call: call, rows: function() { return rows; }, close: function() { server.close(); } });
    });
  });
}

var SUB = { endpoint: 'https://push.example/1', keys: { p256dh: 'BPk', auth: 'xyz' } };

test('switch a device on, see it on, switch it off — signed in only', async function() {
  var s = await serve({ key: 'PUBKEY' });
  try {
    assert.equal((await s.call('GET', '/key')).status, 401);
    assert.deepEqual((await s.call('GET', '/key', null, 'u1')).body.dataArray[0], { enabled: true, publicKey: 'PUBKEY' });
    assert.equal((await s.call('POST', '/subscribe', { subscription: { endpoint: 'http://x' } }, 'u1')).status, 400);
    assert.equal((await s.call('POST', '/subscribe', { subscription: SUB }, 'u1')).status, 200);
    assert.deepEqual((await s.call('GET', '/device?endpoint=' + encodeURIComponent(SUB.endpoint), null, 'u1')).body.dataArray[0], { on: true });
    assert.deepEqual((await s.call('GET', '/device?endpoint=' + encodeURIComponent(SUB.endpoint), null, 'u2')).body.dataArray[0], { on: false }, 'someone else: not theirs');
    assert.equal((await s.call('POST', '/unsubscribe', {}, 'u1')).status, 400);
    assert.equal((await s.call('POST', '/unsubscribe', { endpoint: SUB.endpoint }, 'u1')).status, 200);
    assert.equal(s.rows().length, 0);
  } finally { s.close(); }
});

test('no keys on the server: the key says so, and a device cannot switch on', async function() {
  var s = await serve({ key: null });
  try {
    assert.deepEqual((await s.call('GET', '/key', null, 'u1')).body.dataArray[0], { enabled: false, publicKey: null });
    assert.equal((await s.call('POST', '/subscribe', { subscription: SUB }, 'u1')).status, 409);
  } finally { s.close(); }
});
