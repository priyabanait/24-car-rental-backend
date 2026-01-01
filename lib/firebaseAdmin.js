import admin from 'firebase-admin';

let initialized = false;

function initFirebase() {
  if (initialized) return admin;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.warn('FIREBASE_SERVICE_ACCOUNT_JSON not set - Firebase admin will not be initialized');
    return null;
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (err) {
    // If it's already an object in some env setups
    serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  initialized = true;
  return admin;
}

export async function sendToToken(token, notification = {}, data = {}) {
  const adm = initFirebase();
  if (!adm) throw new Error('Firebase admin not initialized');

  const message = {
    token,
    notification,
    data,
    android: { priority: 'high' },
    apns: { headers: { 'apns-priority': '10' } }
  };
  return adm.messaging().send(message);
}

export async function sendToTokens(tokens, notification = {}, data = {}) {
  const adm = initFirebase();
  if (!adm) throw new Error('Firebase admin not initialized');

  const message = {
    notification,
    data,
    tokens,
    android: { priority: 'high' },
    apns: { headers: { 'apns-priority': '10' } }
  };
  return adm.messaging().sendMulticast(message);
}

export default initFirebase;