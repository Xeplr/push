#!/usr/bin/env node
// npx xeplr-push keys — make the app's VAPID key pair, once, and print the
// lines for its .env. Keep the private key secret, like a database password;
// changing the keys later switches every device off (each must switch on again).
var cmd = process.argv[2];
if (cmd !== 'keys') {
  console.log('Usage: npx xeplr-push keys    make the VAPID keys for PUSH_VAPID_PUBLIC_KEY / PUSH_VAPID_PRIVATE_KEY');
  process.exit(cmd ? 1 : 0);
}
var keys = require('web-push').generateVAPIDKeys();
console.log('# Web Push (@xeplr/push) — the private key is a secret; keep it out of git.');
console.log('PUSH_VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('PUSH_VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('PUSH_VAPID_SUBJECT=mailto:you@your-domain.com');
