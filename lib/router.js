// THE ROUTES — a device switched on or off, by the person signed in on it.
// Mounted by the app behind its own sign-in, e.g. at /api/push:
//
//   GET  /key              { enabled, publicKey }      what the browser subscribes with
//   GET  /device?endpoint= { on }                      whether this device is on, for this person
//   POST /subscribe        { subscription }            switch this device on (PushSubscription.toJSON())
//   POST /unsubscribe      { endpoint }                switch it off — on sign-out too
//
// Answers in xeplr's shape: { code, message, dataArray }.
var { subscriptionOf } = require('./payload');

function answer(res, status, code, message, data) {
  res.status(status).json({ code: code, message: message, dataArray: data === undefined ? [] : [data] });
}

/**
 * @param {{
 *   store: ReturnType<typeof import('./store').createStore>,
 *   publicKey: () => string|null,
 *   userOf: (req) => ({ id: string, email?: string })|null,   who is signed in
 *   express: typeof import('express')
 * }} deps
 */
function createRouter(deps) {
  var router = deps.express.Router();
  router.use(deps.express.json({ limit: '8kb' }));

  function signedIn(req, res) {
    var user = deps.userOf(req);
    if (!user || user.id === undefined || user.id === null || user.id === '') { answer(res, 401, 'UNAUTHORIZED', 'Sign in first'); return null; }
    return user;
  }

  function handle(fn) {
    return function(req, res, next) {
      Promise.resolve(fn(req, res)).catch(next);
    };
  }

  router.get('/key', function(req, res) {
    if (!signedIn(req, res)) return;
    var key = deps.publicKey();
    answer(res, 200, 'SUCCESS', 'success', { enabled: Boolean(key), publicKey: key || null });
  });

  router.get('/device', handle(async function(req, res) {
    var user = signedIn(req, res);
    if (!user) return;
    answer(res, 200, 'SUCCESS', 'success', { on: await deps.store.has(user, req.query.endpoint) });
  }));

  router.post('/subscribe', handle(async function(req, res) {
    var user = signedIn(req, res);
    if (!user) return;
    if (!deps.publicKey()) return answer(res, 409, 'CONFLICT', 'Notifications are not set up on this server');
    var sub = subscriptionOf(req.body && req.body.subscription);
    if (!sub) return answer(res, 400, 'BAD_REQUEST', 'That is not a push subscription: { endpoint, keys: { p256dh, auth } }');
    await deps.store.save(user, sub, req.get('user-agent'));
    answer(res, 200, 'SUCCESS', 'success', { on: true });
  }));

  router.post('/unsubscribe', handle(async function(req, res) {
    var user = signedIn(req, res);
    if (!user) return;
    var endpoint = req.body && req.body.endpoint;
    if (!endpoint) return answer(res, 400, 'BAD_REQUEST', 'Which device? Send its endpoint');
    await deps.store.remove(user, endpoint);
    answer(res, 200, 'SUCCESS', 'success', { on: false });
  }));

  return router;
}

module.exports = { createRouter: createRouter };
