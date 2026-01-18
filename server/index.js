import express from 'express';
import cors from 'cors';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const dbDir = join(__dirname, 'databases');

// Ensure databases directory exists
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Store database instances per tenant
const databases = new Map();

// Get or create database for tenant
async function getTenantDB(tenant) {
  if (!tenant || tenant.length === 0) {
    throw new Error('Invalid tenant name');
  }

  // Sanitize tenant name (alphanumeric and hyphens only)
  const safeTenant = tenant.replace(/[^a-zA-Z0-9-_]/g, '');
  if (safeTenant !== tenant) {
    throw new Error('Tenant name can only contain letters, numbers, hyphens, and underscores');
  }

  if (databases.has(safeTenant)) {
    return databases.get(safeTenant);
  }

  const SQL = await initSqlJs();
  const dbPath = join(dbDir, `${safeTenant}.db`);

  let db;
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
      UNIQUE(habit_id, date)
    );
  `);

  const dbInfo = { db, path: dbPath };
  databases.set(safeTenant, dbInfo);
  saveTenantDB(safeTenant);

  return dbInfo;
}

// Save tenant database to disk
function saveTenantDB(tenant) {
  const dbInfo = databases.get(tenant);
  if (!dbInfo) return;

  const data = dbInfo.db.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbInfo.path, buffer);
}

app.use(cors());
app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../dist')));
}

// Middleware to extract and validate tenant
function requireTenant(req, res, next) {
  const tenant = req.query.tenant || req.body.tenant;
  if (!tenant) {
    return res.status(400).json({ error: 'Tenant parameter is required' });
  }
  req.tenant = tenant;
  next();
}

// Get all habits
app.get('/api/habits', requireTenant, async (req, res) => {
  try {
    const { db } = await getTenantDB(req.tenant);
    const result = db.exec('SELECT * FROM habits ORDER BY created_at DESC');
    const habits = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      name: row[1],
      description: row[2],
      created_at: row[3]
    })) : [];
    res.json(habits);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get habit with logs
app.get('/api/habits/:id', requireTenant, async (req, res) => {
  try {
    const { db } = await getTenantDB(req.tenant);
    const habitResult = db.exec('SELECT * FROM habits WHERE id = ?', [req.params.id]);

    if (habitResult.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    const habitRow = habitResult[0].values[0];
    const habit = {
      id: habitRow[0],
      name: habitRow[1],
      description: habitRow[2],
      created_at: habitRow[3]
    };

    const logsResult = db.exec(
      'SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY date DESC LIMIT 90',
      [req.params.id]
    );

    const logs = logsResult.length > 0 ? logsResult[0].values.map(row => ({
      id: row[0],
      habit_id: row[1],
      date: row[2],
      completed: row[3],
      notes: row[4]
    })) : [];

    res.json({ ...habit, logs });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Create habit
app.post('/api/habits', requireTenant, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const { db } = await getTenantDB(req.tenant);
    db.run(
      'INSERT INTO habits (name, description, created_at) VALUES (?, ?, ?)',
      [name, description || '', Date.now()]
    );

    const result = db.exec('SELECT last_insert_rowid()');
    const id = result[0].values[0][0];

    saveTenantDB(req.tenant);
    res.json({ id, name, description });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update habit
app.put('/api/habits/:id', requireTenant, async (req, res) => {
  try {
    const { name, description } = req.body;

    const { db } = await getTenantDB(req.tenant);
    db.run(
      'UPDATE habits SET name = ?, description = ? WHERE id = ?',
      [name, description || '', req.params.id]
    );

    saveTenantDB(req.tenant);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete habit
app.delete('/api/habits/:id', requireTenant, async (req, res) => {
  try {
    const { db } = await getTenantDB(req.tenant);
    db.run('DELETE FROM habits WHERE id = ?', [req.params.id]);
    saveTenantDB(req.tenant);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get logs for a specific date range
app.get('/api/logs', requireTenant, async (req, res) => {
  try {
    const { start, end } = req.query;
    const query = `
      SELECT hl.*, h.name as habit_name
      FROM habit_logs hl
      JOIN habits h ON hl.habit_id = h.id
      WHERE hl.date >= ? AND hl.date <= ?
      ORDER BY hl.date DESC, h.name
    `;

    const { db } = await getTenantDB(req.tenant);
    const result = db.exec(query, [start, end]);
    const logs = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      habit_id: row[1],
      date: row[2],
      completed: row[3],
      notes: row[4],
      habit_name: row[5]
    })) : [];

    res.json(logs);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Toggle habit completion for a date
app.post('/api/logs/toggle', requireTenant, async (req, res) => {
  try {
    const { habit_id, date } = req.body;

    const { db } = await getTenantDB(req.tenant);
    const existingResult = db.exec(
      'SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?',
      [habit_id, date]
    );

    if (existingResult.length > 0) {
      const existing = existingResult[0].values[0];
      const currentCompleted = existing[3];
      const newCompleted = currentCompleted ? 0 : 1;

      db.run(
        'UPDATE habit_logs SET completed = ? WHERE habit_id = ? AND date = ?',
        [newCompleted, habit_id, date]
      );

      saveTenantDB(req.tenant);
      res.json({ completed: newCompleted });
    } else {
      db.run(
        'INSERT INTO habit_logs (habit_id, date, completed) VALUES (?, ?, 1)',
        [habit_id, date]
      );

      saveTenantDB(req.tenant);
      res.json({ completed: 1 });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update log notes
app.put('/api/logs/:id', requireTenant, async (req, res) => {
  try {
    const { notes } = req.body;
    const { db } = await getTenantDB(req.tenant);
    db.run('UPDATE habit_logs SET notes = ? WHERE id = ?', [notes || '', req.params.id]);
    saveTenantDB(req.tenant);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Serve HTML files for production (must be after API routes)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'));
  });
}

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
