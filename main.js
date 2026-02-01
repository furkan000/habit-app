// Desktop version with 7-day grid
import * as common from './common.js';

// Desktop-specific: Get array of dates for the grid (6 past days + today)
function getGridDates() {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Add 6 past days
  for (let i = 6; i >= 1; i--) {
    dates.push(common.getDaysAgo(i));
  }

  // Add today
  dates.push(today);

  return dates;
}

// Desktop-specific: Format header date (full day name + month/day)
function formatHeaderDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${days[date.getDay()]}\n${month}/${day}`;
}

// Desktop-specific: Render grid header (includes streak column)
function renderGridHeader(skipIfRendered = false) {
  const header = document.getElementById('grid-header');

  // Skip rendering if already rendered by server
  if (skipIfRendered && header.children.length > 0) {
    return;
  }

  const dates = getGridDates();

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

// Attach event listeners to already-rendered grid (hydration)
function attachGridEventListeners() {
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
    el.addEventListener('click', (e) => {
      // Don't trigger edit when clicking drag handle
      if (e.target.classList.contains('drag-handle')) return;
      const habitId = el.dataset.editHabit;
      common.openEditModal(habitId);
    });
  });

  // Add drag-and-drop handlers
  setupDragAndDrop();
}

// Desktop-specific: Render habits grid (includes streak column)
async function renderHabitsGrid(skipIfRendered = false) {
  const gridBody = document.getElementById('grid-body');

  // If already rendered by server, just attach event listeners
  if (skipIfRendered && gridBody.children.length > 0) {
    attachGridEventListeners();
    return;
  }

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

  // Check if habits already have logs (from SSR) or need to fetch them
  const habitsWithLogs = await Promise.all(
    common.habits.map(h => {
      // If habit already has logs property, use it (SSR data)
      if (h.logs) {
        return Promise.resolve(h);
      }
      // Otherwise fetch logs from API
      return common.fetchHabitWithLogs(h.id);
    })
  );

  let html = '';

  habitsWithLogs.forEach(habit => {
    const streak = common.calculateCurrentStreak(habit.logs);

    html += `<div class="habit-row" draggable="true" data-habit-id="${habit.id}">`;
    html += `<div class="habit-name-cell" data-edit-habit="${habit.id}">
      <span class="drag-handle">⋮⋮</span>
      <span>${habit.name}</span>
    </div>`;

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

    html += `<div class="day-cell" style="border: none; cursor: default; font-size: 12px;">${streak > 0 ? streak : ''}</div>`;
    html += `</div>`;
  });

  gridBody.innerHTML = html;

  attachGridEventListeners();
}

// Setup drag-and-drop for habit reordering
function setupDragAndDrop() {
  let draggedElement = null;
  let placeholder = null;

  const habitRows = document.querySelectorAll('.habit-row');

  habitRows.forEach(row => {
    row.addEventListener('dragstart', (e) => {
      draggedElement = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', row.innerHTML);

      // Create placeholder
      placeholder = document.createElement('div');
      placeholder.className = 'habit-row-placeholder';
      placeholder.style.height = row.offsetHeight + 'px';
    });

    row.addEventListener('dragend', (e) => {
      row.classList.remove('dragging');
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder);
      }
      draggedElement = null;

      // Save new order
      saveHabitOrder();
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (!draggedElement || draggedElement === row) return;

      const gridBody = document.getElementById('grid-body');
      const allRows = [...gridBody.querySelectorAll('.habit-row')];
      const draggedIndex = allRows.indexOf(draggedElement);
      const targetIndex = allRows.indexOf(row);

      if (draggedIndex < targetIndex) {
        row.parentNode.insertBefore(draggedElement, row.nextSibling);
      } else {
        row.parentNode.insertBefore(draggedElement, row);
      }
    });

    row.addEventListener('drop', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
  });
}

// Save the new habit order to the backend
async function saveHabitOrder() {
  const gridBody = document.getElementById('grid-body');
  const habitRows = gridBody.querySelectorAll('.habit-row');

  const habitOrders = [];
  habitRows.forEach((row, index) => {
    const habitId = row.dataset.habitId;
    habitOrders.push({ id: parseInt(habitId), order_position: index });
  });

  try {
    await common.reorderHabits(habitOrders);
    // Reload to ensure consistency
    await loadHabits();
  } catch (error) {
    console.error('Failed to save habit order:', error);
  }
}

// Load and refresh
async function loadHabits(useSSRData = false) {
  let fetchedHabits;
  let isServerRendered = false;

  // Check if we should use SSR data
  if (useSSRData && window.__SSR_DATA__ && window.__SSR_DATA__.habits) {
    // Use server-side rendered data (already includes logs)
    fetchedHabits = window.__SSR_DATA__.habits;
    isServerRendered = window.__SSR_DATA__.rendered || false;
    // Clear the SSR data after using it once
    delete window.__SSR_DATA__;
  } else {
    // Fetch from API
    fetchedHabits = await common.fetchHabits();
  }

  common.setHabits(fetchedHabits);
  renderGridHeader(isServerRendered);
  await renderHabitsGrid(isServerRendered);
}

// Week navigation (for future use)
function previousWeek() {
  common.currentWeekStart.setDate(common.currentWeekStart.getDate() - 7);
  renderGridHeader();
  renderHabitsGrid();
}

function nextWeek() {
  common.currentWeekStart.setDate(common.currentWeekStart.getDate() + 7);
  renderGridHeader();
  renderHabitsGrid();
}

// Initialize
async function init() {
  // Check for tenant parameter
  if (!common.checkTenant()) {
    return;
  }

  // Load night mode preference (desktop uses viewport element)
  common.loadNightModePreference('viewport');

  // Load habits (try SSR data first)
  await loadHabits(true);

  // Event listeners
  document.getElementById('add-habit-btn').addEventListener('click', common.openAddModal);
  document.getElementById('close-modal').addEventListener('click', common.closeModal);
  document.getElementById('cancel-btn').addEventListener('click', common.closeModal);
  document.getElementById('save-habit-btn').addEventListener('click', () => common.saveHabit(loadHabits));
  document.getElementById('delete-habit-btn').addEventListener('click', () => common.handleDelete(loadHabits));
  document.getElementById('prev-week').addEventListener('click', previousWeek);
  document.getElementById('next-week').addEventListener('click', nextWeek);
  document.getElementById('night-mode-toggle').addEventListener('click', () => common.toggleNightMode('viewport'));

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('habit-modal').classList.contains('active')) {
      if (e.key === 'Escape') common.closeModal();
      if (e.key === 'Enter') common.saveHabit(loadHabits);
    } else {
      if (e.key === 'n' || e.key === 'N') common.openAddModal();
      if (e.key === 'ArrowLeft') previousWeek();
      if (e.key === 'ArrowRight') nextWeek();
      if (e.key === 'd' || e.key === 'D') common.toggleNightMode('viewport');
    }
  });
}

init();
