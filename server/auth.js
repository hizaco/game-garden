// Minimal dev auth: accept any Bearer token as user id/username.
// In prod, replace with your real JWT verification.
function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ message: 'Unauthorized' });

  const token = m[1];
  // Fake user from token
  req.user = {
    id: token,
    username: `user_${token.slice(0, 6)}`
  };
  next();
}

module.exports = { authMiddleware };
