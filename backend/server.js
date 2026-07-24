const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/coa', require('./routes/coa'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/departments', require('./routes/departments-import'));
app.use('/api/subdepartments', require('./routes/subdepartments'));
app.use('/api/journal', require('./routes/journal'));
app.use('/api/closing', require('./routes/closing'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/roles', require('./routes/roles'));

// Serve frontend (static)
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GL App berjalan di http://localhost:${PORT}`);
  console.log('Login default -> username: admin / password: admin123');
});
