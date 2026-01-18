# Habit Tracker for E-Ink Displays

A minimalist habit tracking application optimized for 800x480 black and white e-ink devices. Features server-side data storage with SQLite and a view-first design philosophy.

## Features

- **E-Ink Optimized**: Designed for 800x480 resolution with high contrast black and white UI
- **View-First Design**: Prioritizes viewing habits over editing
- **Daily Tracking**: Check off habits for each day with streak tracking
- **Server-Side Storage**: All data persisted in SQLite database
- **Minimal Redraws**: Optimized for e-ink refresh characteristics
- **Keyboard Navigation**: Arrow keys for date navigation, 'N' to add habit

## Design Principles

1. **High Contrast**: Pure black (#000) on white (#fff) for maximum readability
2. **No Animations**: Instant state changes to avoid e-ink ghosting
3. **Large Touch Targets**: Generous button and checkbox sizes
4. **Monospace Font**: Courier New for crisp rendering
5. **Fixed Viewport**: Exactly 800x480px with no scrolling main view

## Installation

```bash
npm install
```

## Running the App

```bash
npm run dev
```

This starts:
- Frontend dev server on http://localhost:3000
- Backend API server on http://localhost:3001

## Usage

### Main View
- View all habits for the current date
- Tap checkbox to toggle habit completion
- See current streak for each habit
- Use ◄ ► buttons or arrow keys to change dates

### Adding Habits
- Tap the + button or press 'N'
- Enter habit name (required)
- Optionally add description
- Tap Save

### Editing Habits
- Tap on any habit (not the checkbox)
- Modify name or description
- Delete habit if needed

## API Endpoints

- `GET /api/habits` - Get all habits
- `GET /api/habits/:id` - Get habit with logs
- `POST /api/habits` - Create new habit
- `PUT /api/habits/:id` - Update habit
- `DELETE /api/habits/:id` - Delete habit
- `POST /api/logs/toggle` - Toggle habit completion for a date
- `GET /api/logs` - Get logs for date range

## Database Schema

### habits
- id: INTEGER PRIMARY KEY
- name: TEXT NOT NULL
- description: TEXT
- created_at: INTEGER NOT NULL

### habit_logs
- id: INTEGER PRIMARY KEY
- habit_id: INTEGER (foreign key)
- date: TEXT (YYYY-MM-DD format)
- completed: INTEGER (0 or 1)
- notes: TEXT

## Building for Production

```bash
npm run build
npm run preview
```

## E-Ink Device Deployment

For optimal performance on e-ink devices:

1. Build the production version
2. Serve the `dist` folder with the backend
3. Configure device to open http://localhost:3000 (or your server URL)
4. Disable any browser animations or transitions in device settings
5. Set display to monochrome mode if available

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Backend**: Express.js
- **Database**: SQLite (better-sqlite3)
- **Build Tool**: Vite

## License

MIT
