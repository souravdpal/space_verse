// firebaseAdmin.js
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('../serviceAccountKey.json')),
  });
  console.log('✅ Firebase Admin SDK initialized');
} else {
  console.log('⚠️ Firebase Admin SDK already initialized');
}

module.exports = admin;