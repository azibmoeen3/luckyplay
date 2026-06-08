const { readDb, publicUser } = require('./db');

function attachLocals(req, res, next) {
  const db = readDb();
  const user = req.session.userId ? db.users.find(u => u.id === req.session.userId) : null;
  req.currentUser = user || null;
  res.locals.user = publicUser(user);
  res.locals.settings = db.settings;
  res.locals.flash = req.flash ? req.flash() : {};
  res.locals.path = req.path;
  next();
}

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    req.flash('error', 'Please login first.');
    return res.redirect('/login');
  }
  if (req.currentUser.isBlocked) {
    req.session.destroy(() => res.redirect('/login'));
    return;
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.currentUser || req.currentUser.role !== 'admin') {
    req.flash('error', 'Admin access required.');
    return res.redirect('/admin/login');
  }
  next();
}

module.exports = { attachLocals, requireAuth, requireAdmin };
