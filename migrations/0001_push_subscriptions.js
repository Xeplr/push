// PUSH SUBSCRIPTIONS — one row per device a person switched notifications on
// for: the browser's endpoint and keys, and whose it is. In the APP's own
// database (the knex the app hands init()), like any of its tables.
//
//   endpoint     the push service's address for that device — unique: a device
//                switched on twice is one row, and moves to whoever is signed in
//   userId       the signed-in person, from the app's sign-in
//   email        theirs too, so an app can send by email when that is what it
//                knows (a staff member's email, not their account id)
//   lastSentAt   the last push that reached it
exports.up = function(knex) {
  return knex.schema.createTable('push_subscriptions', function(table) {
    table.string('id', 25).primary();
    table.string('userId', 100).notNullable();
    table.string('email', 320);
    table.text('endpoint').notNullable().unique();
    table.string('p256dh', 200).notNullable();
    table.string('auth', 100).notNullable();
    table.string('userAgent', 300);
    table.timestamp('createdAt').defaultTo(knex.fn.now());
    table.timestamp('lastSentAt');
    table.index('userId');
    table.index('email');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('push_subscriptions');
};
