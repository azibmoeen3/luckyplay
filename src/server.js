require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const compression = require('compression');
const helmet = require('helmet');
const { Server } = require('socket.io');
const { ensureDb } = require('./services/db');
const { attachLocals } = require('./services/middleware');
const { createAviatorSocket } = require('./services/aviatorSocket');

ensureDb();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, '../public'), { maxAge: '7d' }));

app.use(session({
  name: 'kap.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());
app.use(attachLocals);

app.use('/', require('./routes/public'));
app.use('/', require('./routes/auth'));
app.use('/app', require('./routes/app'));
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

createAviatorSocket(io);

app.use((req, res) => {
  res.status(404).render('404', { title: 'Page not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('500', { title: 'Server error', error: process.env.NODE_ENV === 'production' ? null : err });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Gaming platform running on http://localhost:${port}`);
});
