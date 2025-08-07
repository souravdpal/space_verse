// middleware/verifyFirebaseToken.js
const admin = require('./firebaseAdmin'); // Adjust path as needed

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    console.log('✅ Token verified for user:', decodedToken.uid);
    next();
  } catch (err) {
    console.error('🔴 Token verification failed:', err.message);
    res.status(403).json({ error: 'Invalid token', details: err.message });
  }
};

module.exports = verifyFirebaseToken;