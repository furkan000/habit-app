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
      created_at INTEGER NOT NULL,
      order_position INTEGER
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

  // Migrate existing databases: add order_position column if it doesn't exist
  try {
    const tableInfo = db.exec("PRAGMA table_info(habits)");
    const columns = tableInfo.length > 0 ? tableInfo[0].values.map(col => col[1]) : [];

    if (!columns.includes('order_position')) {
      db.run('ALTER TABLE habits ADD COLUMN order_position INTEGER');
      // Set initial order based on created_at
      const habits = db.exec('SELECT id FROM habits ORDER BY created_at ASC');
      if (habits.length > 0) {
        habits[0].values.forEach((row, index) => {
          db.run('UPDATE habits SET order_position = ? WHERE id = ?', [index, row[0]]);
        });
      }
    }
  } catch (e) {
    // Column might already exist, continue
  }

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

// Serve static files in production (but not HTML files - those need SSR)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../dist'), {
    index: false, // Don't serve index.html automatically
    setHeaders: (res, path) => {
      // Don't cache HTML files
      if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));
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
    const result = db.exec('SELECT * FROM habits ORDER BY order_position ASC, created_at DESC');
    const habits = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      name: row[1],
      description: row[2],
      created_at: row[3],
      order_position: row[4]
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
      created_at: habitRow[3],
      order_position: habitRow[4]
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

    // Get the max order_position to add new habit at the end
    const maxOrderResult = db.exec('SELECT MAX(order_position) FROM habits');
    const maxOrder = maxOrderResult.length > 0 && maxOrderResult[0].values.length > 0
      ? maxOrderResult[0].values[0][0]
      : -1;
    const newOrder = maxOrder === null ? 0 : maxOrder + 1;

    db.run(
      'INSERT INTO habits (name, description, created_at, order_position) VALUES (?, ?, ?, ?)',
      [name, description || '', Date.now(), newOrder]
    );

    const result = db.exec('SELECT last_insert_rowid()');
    const id = result[0].values[0][0];

    saveTenantDB(req.tenant);
    res.json({ id, name, description, order_position: newOrder });
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

// Update habit order
app.post('/api/habits/reorder', requireTenant, async (req, res) => {
  try {
    const { habitOrders } = req.body; // Array of { id, order_position }

    if (!Array.isArray(habitOrders)) {
      return res.status(400).json({ error: 'habitOrders must be an array' });
    }

    const { db } = await getTenantDB(req.tenant);

    // Update each habit's order_position
    for (const { id, order_position } of habitOrders) {
      db.run('UPDATE habits SET order_position = ? WHERE id = ?', [order_position, id]);
    }

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

// Helper functions for SSR
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getGridDates() {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Add 6 past days
  for (let i = 6; i >= 1; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date);
  }

  // Add today
  dates.push(today);

  return dates;
}

function formatHeaderDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${days[date.getDay()]}\n${month}/${day}`;
}

function isCompletedOnDate(logs, date) {
  const dateStr = formatDate(date);
  const log = logs.find(l => l.date === dateStr);
  return log && log.completed;
}

function calculateCurrentStreak(logs) {
  if (!logs || logs.length === 0) return 0;

  const sortedLogs = logs
    .filter(log => log.completed)
    .sort((a, b) => b.date.localeCompare(a.date));

  let streak = 0;
  let checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);

  for (let i = 0; i < 90; i++) {
    const dateStr = formatDate(checkDate);
    const log = sortedLogs.find(l => l.date === dateStr);

    if (log && log.completed) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function renderGridHeaderHTML() {
  const dates = getGridDates();
  let html = '<div class="grid-header-cell">Habit Name</div>';

  dates.forEach((date, idx) => {
    const isToday = idx === dates.length - 1;
    const dateStr = formatHeaderDate(date);
    const todayClass = isToday ? 'today' : '';
    html += `<div class="grid-header-cell ${todayClass}">${dateStr}</div>`;
  });

  html += '<div class="grid-header-cell">✓</div>';

  return html;
}

function renderHabitsGridHTML(habitsWithLogs) {
  if (habitsWithLogs.length === 0) {
    return `
      <div class="empty-state">
        <h2>No habits yet</h2>
        <p>Click "+ Add" to create your first habit</p>
      </div>
    `;
  }

  const dates = getGridDates();
  let html = '';

  habitsWithLogs.forEach(habit => {
    const streak = calculateCurrentStreak(habit.logs);

    html += `<div class="habit-row" draggable="true" data-habit-id="${habit.id}">`;
    html += `<div class="habit-name-cell" data-edit-habit="${habit.id}">
      <span class="drag-handle">⋮⋮</span>
      <div class="habit-info">
        <span class="habit-title">${habit.name}</span>
        ${habit.description ? `<span class="habit-description">${habit.description}</span>` : ''}
      </div>
    </div>`;

    dates.forEach((date, idx) => {
      const isToday = idx === dates.length - 1;
      const completed = isCompletedOnDate(habit.logs, date);
      const todayClass = isToday ? 'today' : '';
      const completedClass = completed ? 'completed' : '';
      const dateStr = formatDate(date);

      html += `<div class="day-cell ${todayClass} ${completedClass}" data-toggle="${habit.id}" data-date="${dateStr}">`;
      if (completed) {
        html += '✓';
      }
      html += `</div>`;
    });

    html += `<div class="day-cell" style="border: none; cursor: default; font-size: 12px;">${streak > 0 ? streak : ''}</div>`;
    html += `</div>`;
  });

  return html;
}

// SSR handler function
async function handleSSR(req, res, htmlPath) {
  const tenant = req.query.tenant;

  if (!tenant) {
    // No tenant, serve without SSR
    res.sendFile(htmlPath);
    return;
  }

  try {
    // Fetch habits data for this tenant
    const { db } = await getTenantDB(tenant);
    const result = db.exec('SELECT * FROM habits ORDER BY order_position ASC, created_at DESC');
    const habits = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      name: row[1],
      description: row[2],
      created_at: row[3],
      order_position: row[4]
    })) : [];

    // Fetch logs for all habits
    const habitsWithLogs = await Promise.all(
      habits.map(async (habit) => {
        const logsResult = db.exec(
          'SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY date DESC LIMIT 90',
          [habit.id]
        );
        const logs = logsResult.length > 0 ? logsResult[0].values.map(row => ({
          id: row[0],
          habit_id: row[1],
          date: row[2],
          completed: row[3],
          notes: row[4]
        })) : [];
        return { ...habit, logs };
      })
    );

    // Read the HTML file
    let html = readFileSync(htmlPath, 'utf-8');

    // Render the grid header and body
    const gridHeaderHTML = renderGridHeaderHTML();
    const gridBodyHTML = renderHabitsGridHTML(habitsWithLogs);

    // Inject the rendered HTML into the page
    html = html.replace('<div class="grid-header" id="grid-header"></div>',
                       `<div class="grid-header" id="grid-header">${gridHeaderHTML}</div>`);
    html = html.replace('<div class="grid-body" id="grid-body"></div>',
                       `<div class="grid-body" id="grid-body">${gridBodyHTML}</div>`);

    // Also inject the data for JavaScript hydration
    const ssrData = `<script>window.__SSR_DATA__ = ${JSON.stringify({ habits: habitsWithLogs, rendered: true })};</script>`;
    html = html.replace('</body>', `${ssrData}</body>`);

    res.send(html);
  } catch (error) {
    console.error('SSR error:', error);
    // Fallback to client-side rendering on error
    res.sendFile(htmlPath);
  }
}

// Serve HTML files for production (must be after API routes)
if (process.env.NODE_ENV === 'production') {
  app.get('*', async (req, res) => {
    // Check if mobile parameter is present
    if (req.query.mobile === 'true' || req.query.mobile === '1') {
      res.sendFile(join(__dirname, '../dist/mobile.html'));
    } else {
      // Server-side render for desktop version
      await handleSSR(req, res, join(__dirname, '../dist/index.html'));
    }
  });
} else {
  // Development mode - serve index.html with SSR
  app.get('/', async (req, res) => {
    // Check if mobile parameter is present
    if (req.query.mobile === 'true' || req.query.mobile === '1') {
      res.sendFile(join(__dirname, '../mobile.html'));
    } else {
      await handleSSR(req, res, join(__dirname, '../index.html'));
    }
  });
}

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
