// State
let habits = [];
let currentWeekStart = new Date();
let editingHabitId = null;
let tenant = null;

// Set to start of week (Sunday)
currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
currentWeekStart.setHours(0, 0, 0, 0);

// Get tenant from URL
function getTenant() {
  const params = new URLSearchParams(window.location.search);
  return params.get('tenant');
}

// Redirect to landing page if no tenant
function checkTenant() {
  tenant = getTenant();
  if (!tenant) {
    window.location.href = '/landing.html';
    return false;
  }
  return true;
}

// Format date as YYYY-MM-DD (local timezone)
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get date for days ago
function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

// Get array of dates for the grid (6 past days + today)
function getGridDates() {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Add 6 past days
  for (let i = 6; i >= 1; i--) {
    dates.push(getDaysAgo(i));
  }

  // Add today
  dates.push(today);

  return dates;
}

// Format header date
function formatHeaderDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${days[date.getDay()]}\n${month}/${day}`;
}

// API calls
async function fetchHabits() {
  const response = await fetch(`/api/habits?tenant=${tenant}`);
  return response.json();
}

async function createHabit(name) {
  const response = await fetch(`/api/habits?tenant=${tenant}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: '', tenant })
  });
  return response.json();
}

async function updateHabit(id, name) {
  const response = await fetch(`/api/habits/${id}?tenant=${tenant}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: '', tenant })
  });
  return response.json();
}

async function deleteHabit(id) {
  const response = await fetch(`/api/habits/${id}?tenant=${tenant}`, {
    method: 'DELETE'
  });
  return response.json();
}

async function toggleHabitLog(habitId, date) {
  const response = await fetch(`/api/logs/toggle?tenant=${tenant}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ habit_id: habitId, date, tenant })
  });
  return response.json();
}

async function fetchHabitWithLogs(id) {
  const response = await fetch(`/api/habits/${id}?tenant=${tenant}`);
  return response.json();
}

// Check if habit is completed for a specific date
function isCompletedOnDate(logs, date) {
  const dateStr = formatDate(date);
  const log = logs.find(l => l.date === dateStr);
  return log && log.completed;
}

// Render grid header
function renderGridHeader() {
  const header = document.getElementById('grid-header');
  const dates = getGridDates();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = '<div class="grid-header-cell">Habit Name</div>';

  dates.forEach((date, idx) => {
    const isToday = idx === dates.length - 1;
    const dateStr = formatHeaderDate(date);
    const todayClass = isToday ? 'today' : '';
    html += `<div class="grid-header-cell ${todayClass}">${dateStr}</div>`;
  });

  html += '<div class="grid-header-cell">✓</div>';

  header.innerHTML = html;
}

// Calculate streak for display
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

// Render habits grid
async function renderHabitsGrid() {
  const gridBody = document.getElementById('grid-body');
  const dates = getGridDates();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (habits.length === 0) {
    gridBody.innerHTML = `
      <div class="empty-state">
        <h2>No habits yet</h2>
        <p>Click "+ Add" to create your first habit</p>
      </div>
    `;
    return;
  }

  const habitsWithLogs = await Promise.all(
    habits.map(h => fetchHabitWithLogs(h.id))
  );

  let html = '';

  habitsWithLogs.forEach(habit => {
    const streak = calculateCurrentStreak(habit.logs);

    html += `<div class="habit-row">`;
    html += `<div class="habit-name-cell" data-edit-habit="${habit.id}">${habit.name}</div>`;

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

  gridBody.innerHTML = html;

  // Add click handlers for toggle
  document.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const habitId = el.dataset.toggle;
      const date = el.dataset.date;
      await toggleHabitLog(habitId, date);
      await renderHabitsGrid();
    });
  });

  // Add click handlers for edit
  document.querySelectorAll('[data-edit-habit]').forEach(el => {
    el.addEventListener('click', () => {
      const habitId = el.dataset.editHabit;
      openEditModal(habitId);
    });
  });
}

// Modal functions
function openAddModal() {
  editingHabitId = null;
  document.getElementById('modal-title').textContent = 'Add Habit';
  document.getElementById('habit-name').value = '';
  document.getElementById('delete-habit-btn').style.display = 'none';
  document.getElementById('habit-modal').classList.add('active');
  document.getElementById('habit-name').focus();
}

async function openEditModal(habitId) {
  editingHabitId = habitId;
  const habit = habits.find(h => h.id == habitId);

  document.getElementById('modal-title').textContent = 'Edit Habit';
  document.getElementById('habit-name').value = habit.name;
  document.getElementById('delete-habit-btn').style.display = 'block';
  document.getElementById('habit-modal').classList.add('active');
  document.getElementById('habit-name').focus();
}

function closeModal() {
  document.getElementById('habit-modal').classList.remove('active');
}

async function saveHabit() {
  const name = document.getElementById('habit-name').value.trim();

  if (!name) {
    alert('Please enter a habit name');
    return;
  }

  if (editingHabitId) {
    await updateHabit(editingHabitId, name);
  } else {
    await createHabit(name);
  }

  closeModal();
  await loadHabits();
}

async function handleDelete() {
  if (!editingHabitId) return;

  if (confirm('Delete this habit? This cannot be undone.')) {
    await deleteHabit(editingHabitId);
    closeModal();
    await loadHabits();
  }
}

// Load and refresh
async function loadHabits() {
  habits = await fetchHabits();
  renderGridHeader();
  await renderHabitsGrid();
}

// Week navigation (for future use)
function previousWeek() {
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  renderGridHeader();
  renderHabitsGrid();
}

function nextWeek() {
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  renderGridHeader();
  renderHabitsGrid();
}

// Night mode toggle
function toggleNightMode() {
  const viewport = document.getElementById('viewport');
  const isNightMode = viewport.classList.toggle('night-mode');

  // Save preference to localStorage
  localStorage.setItem('nightMode', isNightMode ? 'true' : 'false');

  // Update button icon
  const button = document.getElementById('night-mode-toggle');
  button.textContent = isNightMode ? '☀' : '☾';
}

// Load night mode preference
function loadNightModePreference() {
  const savedMode = localStorage.getItem('nightMode');
  if (savedMode === 'true') {
    const viewport = document.getElementById('viewport');
    viewport.classList.add('night-mode');
    const button = document.getElementById('night-mode-toggle');
    button.textContent = '☀';
  }
}

// Initialize
async function init() {
  // Check for tenant parameter
  if (!checkTenant()) {
    return;
  }

  // Load night mode preference
  loadNightModePreference();

  await loadHabits();

  // Event listeners
  document.getElementById('add-habit-btn').addEventListener('click', openAddModal);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('save-habit-btn').addEventListener('click', saveHabit);
  document.getElementById('delete-habit-btn').addEventListener('click', handleDelete);
  document.getElementById('prev-week').addEventListener('click', previousWeek);
  document.getElementById('next-week').addEventListener('click', nextWeek);
  document.getElementById('night-mode-toggle').addEventListener('click', toggleNightMode);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('habit-modal').classList.contains('active')) {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Enter') saveHabit();
    } else {
      if (e.key === 'n' || e.key === 'N') openAddModal();
      if (e.key === 'ArrowLeft') previousWeek();
      if (e.key === 'ArrowRight') nextWeek();
      if (e.key === 'd' || e.key === 'D') toggleNightMode();
    }
  });
}

init();
