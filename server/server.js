const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { WebSocketServer } = require('ws');
const http = require('http');

const db = require('./db');
const { explainCommand } = require('./openai');

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'promptly-secret',
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// GitHub OAuth routes
app.get('/auth/github', (req, res) => {
  const redirect = encodeURIComponent(process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback');
  res.redirect(`https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${redirect}`);
});

app.get('/auth/github/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code
    }, { headers: { Accept: 'application/json' } });

    const accessToken = tokenRes.data.access_token;
    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${accessToken}` }
    });
    const username = userRes.data.login;

    const row = db.prepare('SELECT role FROM authorized_users WHERE username = ?').get(username);
    if (!row) {
      return res.status(403).send('User not authorized');
    }
    req.session.user = { username, role: row.role };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('GitHub authentication failed');
  }
});

// Middleware to ensure authenticated
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).send('Unauthorized');
  next();
}

app.get('/api/me', (req, res) => {
  res.json(req.session.user || null);
});

// Create a new class session (professor only)
app.post('/api/session', requireAuth, (req, res) => {
  if (req.session.user.role !== 'professor') return res.status(403).send('Forbidden');
  const token = crypto.randomBytes(16).toString('hex');
  const info = db.prepare('INSERT INTO sessions (token) VALUES (?)').run(token);
  res.json({ id: info.lastInsertRowid, token });
});

app.get('/api/sessions', requireAuth, (req, res) => {
  if (req.session.user.role !== 'professor') return res.status(403).send('Forbidden');
  const sessions = db.prepare('SELECT id, token, active, created_at FROM sessions ORDER BY id DESC').all();
  res.json(sessions);
});

// Fetch existing commands for a session by token
app.get('/api/session/:token', (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE token = ?').get(req.params.token);
  if (!session) return res.status(404).send('Session not found');
  const cmds = db.prepare('SELECT id, command, output, explanation FROM commands WHERE session_id = ? ORDER BY id').all(session.id);
  const sections = db.prepare('SELECT id, title FROM sections WHERE session_id = ? ORDER BY id').all(session.id);
  res.json({ commands: cmds, sections });
});

// Receive command from CLI
app.post('/api/command', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).send('Missing token');
  const session = db.prepare('SELECT id FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).send('Invalid token');

  const { command, output, exit_code, username } = req.body;
  const userRow = db.prepare('SELECT role FROM authorized_users WHERE username = ?').get(username);
  if (!userRow || !['professor', 'ta'].includes(userRow.role)) {
    return res.status(403).send('Forbidden');
  }
  const explanation = await explainCommand(session.id, command, output);
  const info = db.prepare('INSERT INTO commands (session_id, username, command, output, explanation) VALUES (?, ?, ?, ?, ?)')
    .run(session.id, username || null, command, output, explanation);
  const entry = { id: info.lastInsertRowid, command, output, explanation };
  broadcast(session.id, { type: 'command', data: entry });
  res.json(entry);
});

// Add a section header (TA or professor)
app.post('/api/section', requireAuth, (req, res) => {
  if (!['ta', 'professor'].includes(req.session.user.role)) return res.status(403).send('Forbidden');
  const { sessionToken, title } = req.body;
  const sessionRow = db.prepare('SELECT id FROM sessions WHERE token = ?').get(sessionToken);
  if (!sessionRow) return res.status(404).send('Session not found');
  const info = db.prepare('INSERT INTO sections (session_id, title) VALUES (?, ?)').run(sessionRow.id, title);
  const section = { id: info.lastInsertRowid, title };
  broadcast(sessionRow.id, { type: 'section', data: section });
  res.json(section);
});

app.put('/api/section/:id', requireAuth, (req, res) => {
  if (!['ta', 'professor'].includes(req.session.user.role)) return res.status(403).send('Forbidden');
  const { title } = req.body;
  db.prepare('UPDATE sections SET title = ? WHERE id = ?').run(title, req.params.id);
  const sec = db.prepare('SELECT session_id FROM sections WHERE id = ?').get(req.params.id);
  if (sec) broadcast(sec.session_id, { type: 'sectionUpdate', data: { id: req.params.id, title } });
  res.json({ id: req.params.id, title });
});

app.delete('/api/section/:id', requireAuth, (req, res) => {
  if (!['ta', 'professor'].includes(req.session.user.role)) return res.status(403).send('Forbidden');
  const sec = db.prepare('SELECT session_id FROM sections WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM sections WHERE id = ?').run(req.params.id);
  if (sec) broadcast(sec.session_id, { type: 'deleteSection', data: { id: req.params.id } });
  res.json({ id: req.params.id });
});

// User management
app.get('/api/users', requireAuth, (req, res) => {
  if (req.session.user.role !== 'professor') return res.status(403).send('Forbidden');
  const users = db.prepare('SELECT username, role FROM authorized_users ORDER BY username').all();
  res.json(users);
});

app.post('/api/users', requireAuth, (req, res) => {
  if (req.session.user.role !== 'professor') return res.status(403).send('Forbidden');
  const { username, role } = req.body;
  db.prepare('INSERT OR REPLACE INTO authorized_users (username, role) VALUES (?, ?)').run(username, role);
  res.json({ username, role });
});

app.put('/api/users/:username', requireAuth, (req, res) => {
  if (req.session.user.role !== 'professor') return res.status(403).send('Forbidden');
  const { role } = req.body;
  db.prepare('UPDATE authorized_users SET role = ? WHERE username = ?').run(role, req.params.username);
  res.json({ username: req.params.username, role });
});

app.delete('/api/users/:username', requireAuth, (req, res) => {
  if (req.session.user.role !== 'professor') return res.status(403).send('Forbidden');
  db.prepare('DELETE FROM authorized_users WHERE username = ?').run(req.params.username);
  res.json({ username: req.params.username });
});

// Update explanation (TA or professor)
app.put('/api/command/:id', requireAuth, (req, res) => {
  if (!['ta', 'professor'].includes(req.session.user.role)) return res.status(403).send('Forbidden');
  const { explanation } = req.body;
  db.prepare('UPDATE commands SET explanation = ? WHERE id = ?').run(explanation, req.params.id);
  // We need session id to broadcast
  const cmd = db.prepare('SELECT session_id, command, output, explanation FROM commands WHERE id = ?').get(req.params.id);
  broadcast(cmd.session_id, { type: 'commandUpdate', data: { id: req.params.id, command: cmd.command, output: cmd.output, explanation } });
  res.json({ id: req.params.id, explanation });
});

app.delete('/api/command/:id', requireAuth, (req, res) => {
  if (!['ta', 'professor'].includes(req.session.user.role)) return res.status(403).send('Forbidden');
  const cmd = db.prepare('SELECT session_id FROM commands WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM commands WHERE id = ?').run(req.params.id);
  if (cmd) broadcast(cmd.session_id, { type: 'deleteCommand', data: { id: req.params.id } });
  res.json({ id: req.params.id });
});

// Setup server and WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Map(); // ws -> sessionId

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.replace('/?', ''));
  const token = params.get('token');
  const session = db.prepare('SELECT id FROM sessions WHERE token = ?').get(token);
  if (!session) {
    ws.close();
    return;
  }
  clients.set(ws, session.id);
  ws.on('close', () => clients.delete(ws));
});

function broadcast(sessionId, payload) {
  for (const [client, sid] of clients.entries()) {
    if (sid === sessionId && client.readyState === 1) {
      client.send(JSON.stringify(payload));
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Promptly server running on port ${PORT}`);
});
