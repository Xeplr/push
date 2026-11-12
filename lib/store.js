// THE DEVICES — push_subscriptions, through the app's knex.
var crypto = require('crypto');
var TABLE = 'push_subscriptions';

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

/** @param {() => import('knex').Knex} knexOf  the app's knex, resolved on use */
function createStore(knexOf) {
  var t = function() { return knexOf()(TABLE); };
  return {
    /** Switched on: one row per endpoint, now this person's. */
    save: async function(user, sub, userAgent) {
      var row = { userId: String(user.id), email: user.email ? String(user.email).toLowerCase() : null, p256dh: sub.p256dh, auth: sub.auth, userAgent: userAgent ? String(userAgent).slice(0, 300) : null };
      var existing = await t().where({ endpoint: sub.endpoint }).first('id');
      if (existing) {
        await t().where({ id: existing.id }).update(row);
        return existing.id;
      }
      var id = newId();
      await t().insert(Object.assign({ id: id, endpoint: sub.endpoint }, row));
      return id;
    },

    /** Switched off (or signed out): this person's row for that endpoint. */
    remove: function(user, endpoint) {
      return t().where({ endpoint: String(endpoint || ''), userId: String(user.id) }).delete();
    },

    /** Gone for good (the push service said 404 / 410). */
    removeEndpoint: function(endpoint) {
      return t().where({ endpoint: endpoint }).delete();
    },

    sent: function(endpoint) {
      return t().where({ endpoint: endpoint }).update({ lastSentAt: knexOf().fn.now() });
    },

    /** Whether this person has this endpoint switched on. */
    has: async function(user, endpoint) {
      return Boolean(await t().where({ endpoint: String(endpoint || ''), userId: String(user.id) }).first('id'));
    },

    /** The devices of these people — by account id and/or by email. */
    devicesOf: function(target) {
      var ids = (target.userIds || []).filter(Boolean).map(String);
      var emails = (target.emails || []).filter(Boolean).map(function(e) { return String(e).toLowerCase(); });
      if (!ids.length && !emails.length) return Promise.resolve([]);
      return t().where(function() {
        if (ids.length) this.whereIn('userId', ids);
        if (emails.length) this.orWhereIn('email', emails);
      }).select('endpoint', 'p256dh', 'auth', 'userId', 'email');
    }
  };
}

module.exports = { createStore: createStore, TABLE: TABLE };
