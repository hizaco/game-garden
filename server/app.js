const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const { initSockets } = require('./socket');
const { authMiddleware } = require('./auth');
const { usersRouter } = require('./routes/users');
const { statsRouter } = require('./routes/stats');

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "manifest-src": ["'self'"],
      "worker-src": ["'self'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"]
    }
  }
}));
app.use(cors());
app.use(express.json());

// Static frontend
const publicDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(publicDir));

// Auth verify (dev stub)
app.get('/api/auth/verify', authMiddleware, (req, res) => {
  return res.json({ user: req.user });
});

// Profile + stats
app.use('/api/users', usersRouter);
app.use('/api/users', statsRouter);

// Fallback to index
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const server = http.createServer(app);
initSockets(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Laser Game server listening on http://localhost:${PORT}`);
});
