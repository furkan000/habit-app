// Mobile-specific version with 3-day grid
import * as common from './common.js';

// Mobile-specific: Get array of dates for the mobile grid (2 past days + today = 3 days)
function getGridDates() {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Add 2 past days
  for (let i = 2; i >= 1; i--) {
    dates.push(common.getDaysAgo(i));
  }

  // Add today
  dates.push(today);

  return dates;
}

// Mobile-specific: Format header date (short day name + day number)
function formatHeaderDate(date) {
  const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const day = date.getDate();

  return `${days[date.getDay()]}\n${day}`;
}

// Mobile-specific: Render grid header (no streak column)
function renderGridHeader() {
  const header = document.getElementById('grid-header');
  const dates = getGridDates();

  let html = '<div class="grid-header-cell">Habit</div>';

  dates.forEach((date, idx) => {
    const isToday = idx === dates.length - 1;
    const dateStr = formatHeaderDate(date);
    const todayClass = isToday ? 'today' : '';
    html += `<div class="grid-header-cell ${todayClass}">${dateStr}</div>`;
  });

  header.innerHTML = html;
}

// Mobile-specific: Render habits grid (no streak column)
async function renderHabitsGrid() {
  const gridBody = document.getElementById('grid-body');
  const dates = getGridDates();

  if (common.habits.length === 0) {
    gridBody.innerHTML = `
      <div class="empty-state">
        <h2>No habits yet</h2>
        <p>Click "+ Add" to create your first habit</p>
      </div>
    `;
    return;
  }

  const habitsWithLogs = await Promise.all(
    common.habits.map(h => common.fetchHabitWithLogs(h.id))
  );

  let html = '';

  habitsWithLogs.forEach(habit => {
    html += `<div class="habit-row">`;
    html += `<div class="habit-name-cell" data-edit-habit="${habit.id}">${habit.name}</div>`;

    dates.forEach((date, idx) => {
      const isToday = idx === dates.length - 1;
      const completed = common.isCompletedOnDate(habit.logs, date);
      const todayClass = isToday ? 'today' : '';
      const completedClass = completed ? 'completed' : '';
      const dateStr = common.formatDate(date);

      html += `<div class="day-cell ${todayClass} ${completedClass}" data-toggle="${habit.id}" data-date="${dateStr}">`;
      if (completed) {
        html += '✓';
      }
      html += `</div>`;
    });

    html += `</div>`;
  });

  gridBody.innerHTML = html;

  // Add click handlers for toggle
  document.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const habitId = el.dataset.toggle;
      const date = el.dataset.date;
      await common.toggleHabitLog(habitId, date);
      await renderHabitsGrid();
    });
  });

  // Add click handlers for edit
  document.querySelectorAll('[data-edit-habit]').forEach(el => {
    el.addEventListener('click', () => {
      const habitId = el.dataset.editHabit;
      common.openEditModal(habitId);
    });
  });
}

// Load and refresh
async function loadHabits() {
  const fetchedHabits = await common.fetchHabits();
  common.setHabits(fetchedHabits);
  renderGridHeader();
  await renderHabitsGrid();
}

// Initialize
async function init() {
  // Check for tenant parameter
  if (!common.checkTenant()) {
    return;
  }

  // Load night mode preference (mobile uses body element)
  common.loadNightModePreference('body');

  await loadHabits();

  // Event listeners
  document.getElementById('add-habit-btn').addEventListener('click', common.openAddModal);
  document.getElementById('close-modal').addEventListener('click', common.closeModal);
  document.getElementById('cancel-btn').addEventListener('click', common.closeModal);
  document.getElementById('save-habit-btn').addEventListener('click', () => common.saveHabit(loadHabits));
  document.getElementById('delete-habit-btn').addEventListener('click', () => common.handleDelete(loadHabits));
  document.getElementById('night-mode-toggle').addEventListener('click', () => common.toggleNightMode('body'));

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('habit-modal').classList.contains('active')) {
      if (e.key === 'Escape') common.closeModal();
      if (e.key === 'Enter') common.saveHabit(loadHabits);
    } else {
      if (e.key === 'n' || e.key === 'N') common.openAddModal();
      if (e.key === 'd' || e.key === 'D') common.toggleNightMode('body');
    }
  });
}

init();
