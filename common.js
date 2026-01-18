// Common shared functionality between main.js and mobile.js

// State
export let habits = [];
export let currentWeekStart = new Date();
export let editingHabitId = null;
export let tenant = null;

// Set to start of week (Sunday)
currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
currentWeekStart.setHours(0, 0, 0, 0);

// Get tenant from URL
export function getTenant() {
  const params = new URLSearchParams(window.location.search);
  return params.get('tenant');
}

// Redirect to landing page if no tenant
export function checkTenant() {
  tenant = getTenant();
  if (!tenant) {
    window.location.href = '/landing.html';
    return false;
  }
  return true;
}

// Format date as YYYY-MM-DD (local timezone)
export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get date for days ago
export function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

// API calls
export async function fetchHabits() {
  const response = await fetch(`/api/habits?tenant=${tenant}`);
  return response.json();
}

export async function createHabit(name) {
  const response = await fetch(`/api/habits?tenant=${tenant}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: '', tenant })
  });
  return response.json();
}

export async function updateHabit(id, name) {
  const response = await fetch(`/api/habits/${id}?tenant=${tenant}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: '', tenant })
  });
  return response.json();
}

export async function deleteHabit(id) {
  const response = await fetch(`/api/habits/${id}?tenant=${tenant}`, {
    method: 'DELETE'
  });
  return response.json();
}

export async function toggleHabitLog(habitId, date) {
  const response = await fetch(`/api/logs/toggle?tenant=${tenant}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ habit_id: habitId, date, tenant })
  });
  return response.json();
}

export async function fetchHabitWithLogs(id) {
  const response = await fetch(`/api/habits/${id}?tenant=${tenant}`);
  return response.json();
}

// Check if habit is completed for a specific date
export function isCompletedOnDate(logs, date) {
  const dateStr = formatDate(date);
  const log = logs.find(l => l.date === dateStr);
  return log && log.completed;
}

// Calculate streak for display
export function calculateCurrentStreak(logs) {
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

// Modal functions
export function openAddModal() {
  editingHabitId = null;
  document.getElementById('modal-title').textContent = 'Add Habit';
  document.getElementById('habit-name').value = '';
  document.getElementById('delete-habit-btn').style.display = 'none';
  document.getElementById('habit-modal').classList.add('active');
  document.getElementById('habit-name').focus();
}

export async function openEditModal(habitId) {
  editingHabitId = habitId;
  const habit = habits.find(h => h.id == habitId);

  document.getElementById('modal-title').textContent = 'Edit Habit';
  document.getElementById('habit-name').value = habit.name;
  document.getElementById('delete-habit-btn').style.display = 'block';
  document.getElementById('habit-modal').classList.add('active');
  document.getElementById('habit-name').focus();
}

export function closeModal() {
  document.getElementById('habit-modal').classList.remove('active');
}

export async function saveHabit(loadHabits) {
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

export async function handleDelete(loadHabits) {
  if (!editingHabitId) return;

  if (confirm('Delete this habit? This cannot be undone.')) {
    await deleteHabit(editingHabitId);
    closeModal();
    await loadHabits();
  }
}

// Night mode toggle (accepts element selector for different layouts)
export function toggleNightMode(elementSelector = 'viewport') {
  const element = document.getElementById(elementSelector) || document.body;
  const isNightMode = element.classList.toggle('night-mode');

  // Save preference to localStorage
  localStorage.setItem('nightMode', isNightMode ? 'true' : 'false');

  // Update button icon
  const button = document.getElementById('night-mode-toggle');
  button.textContent = isNightMode ? '☀' : '☾';
}

// Load night mode preference
export function loadNightModePreference(elementSelector = 'viewport') {
  const savedMode = localStorage.getItem('nightMode');
  if (savedMode === 'true') {
    const element = document.getElementById(elementSelector) || document.body;
    element.classList.add('night-mode');
    const button = document.getElementById('night-mode-toggle');
    button.textContent = '☀';
  }
}

// Helper to set up habit state
export function setHabits(newHabits) {
  habits = newHabits;
}

export function setEditingHabitId(id) {
  editingHabitId = id;
}
