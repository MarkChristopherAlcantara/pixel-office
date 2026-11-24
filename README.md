# PIXEL OFFICE

A tiny pixel-art office that visualizes your local [opencode](https://opencode.ai) sessions in real time. Every project becomes a room, every session becomes a character sitting at a desk. Working agents type, idle agents wander to the lounge, and sessions that need an answer raise a hand.

Everything runs on your machine. The server opens opencode's SQLite database **read-only** — no API keys, no HTTP calls to opencode, no telemetry.

```
┌─ PIXEL OFFICE ─────────────────────────────────────┐
│  website       3D VIDEO                            │
│  ┌────────┐    ┌────────┐                          │
│  │ Nena ▮ │    │ Nio  ▮ │   ← working (typing)     │
│  │ Rei  ☕│    │        │   ← idle (lounge)        │
│  └────────┘    └────────┘                          │
└────────────────────────────────────────────────────┘
```

## Requirements

- **Node.js ≥ 22.5** — the server uses the built-in `node:sqlite` module, so there are **no dependencies** and no install step.
- A local opencode installation with an existing database at `~/.local/share/opencode/opencode.db` (the server also checks a few common locations; see [Database](#database)).

## Quick start

```sh
cd "PIXEL OFFICE"
npm start
```

Then open **http://127.0.0.1:4777**.

No opencode history yet, or want to see the office fully populated? Open the demo:

**http://127.0.0.1:4777/?demo=1**

The demo is sample data only and never touches your database.

> If port 4777 is busy (and you didn't set `PIXEL_OFFICE_PORT`), the server automatically tries 4778, 4779, … and prints the URL it settled on.

## What you're looking at

- **Rooms** are opencode projects. The room plaque shows the project name and how many agents are inside.
- **Characters** are sessions. Their name, status bubble, and desk activity reflect the session's latest message and tool calls.
- **Statuses**
  - `working` — the session is busy; the character types at a desk.
  - `needs you` — the session is running a `question` tool, or its last turn ended with an error. The character raises a hand.
  - `at ease` — the session is idle. After a couple of minutes the character walks down to the lounge.
- **Office feed** (bottom) shows arrivals, tool activity, finished turns, and attention events as they happen.
- **Session file** (right drawer) shows the session's recent conversation and tool calls. Click any character or room-list row to open it.

### Controls

| Action | Result |
| --- | --- |
| Click a character | Open its session file |
| Click a room plaque / room row | Focus that room (dims the others) |
| `Esc` | Close the drawer / help / clear focus |
| `/` | Focus the search box |
| Search box | Filter rooms and agents by name |
| `?` (top right) | Help & legend |
| On narrow screens | Swipe / scroll the stage sideways to pan the office |

The office is **monitoring only** — it never sends approvals, messages, or commands back to opencode.

## Configuration

Set environment variables before `npm start` (PowerShell: `$env:NAME="value"`).

| Variable | Default | Meaning |
| --- | --- | --- |
| `PIXEL_OFFICE_PORT` | `4777` | HTTP port. Falls back to the next free port if taken. |
| `PIXEL_OFFICE_HOST` | `127.0.0.1` | Bind address. Keep it on loopback unless you know what you're doing. |
| `PIXEL_OFFICE_DB` | auto-detected | Explicit path to `opencode.db`. |
| `PIXEL_OFFICE_WINDOW_MINUTES` | `20` | Only sessions updated within this window appear in the office. |
| `PIXEL_OFFICE_POLL_MS` | `1500` | How often the database is re-read (minimum 500). |
| `PIXEL_OFFICE_DEMO` | off | `1`/`true` starts the server in demo mode by default. |

`OPENCODE_DB` is also accepted as a database path override.

## Database

The server looks for opencode's SQLite database in this order:

1. `PIXEL_OFFICE_DB`
2. `OPENCODE_DB`
3. `$XDG_DATA_HOME/opencode/opencode.db`
4. `~/.local/share/opencode/opencode.db`
5. `%LOCALAPPDATA%\opencode\opencode.db` (Windows)
6. `~/.opencode/opencode.db`

The database is opened with SQLite's read-only flag. PIXEL OFFICE only runs `SELECT` queries; it never writes, migrates, or locks the file for writing. If the database is missing or unreadable, the office shows a clear error panel with **Retry** and **View the demo office** actions.

## HTTP API

The frontend talks to the server over a small read-only API:

- `GET /api/health` — version, resolved DB path, uptime, connected clients.
- `GET /api/state` — current office snapshot (add `?demo=1` for demo data).
- `GET /api/events` — Server-Sent Events stream: `hello` plus `state` on every change.
- `GET /api/session/:id` — recent messages and tool calls for one session.

## Limitations

- **Read-only and local.** No approvals, replies, or session control from the office; it is a window, not a remote control.
- **"Needs you" is inferred.** opencode's database has no explicit permission-prompt flag, so attention comes from a running `question` tool or an error/idle outcome. A session blocked on a plain permission prompt may still look busy until it records a message.
- **Recent sessions only.** Sessions outside `PIXEL_OFFICE_WINDOW_MINUTES` are hidden to keep the floor readable.
- **Caps for readability.** At most 9 rooms and 6 agents per room are drawn; extra sessions are counted but not seated.
- **No build step, no framework.** Vanilla ES modules and Canvas 2D; the local fonts ship with the app.
- **Narrow screens pan instead of shrinking.** The canvas keeps a legible 1:1 pixel scale, so on phones the stage scrolls horizontally rather than rendering microscopic text.

## Fonts

- **Silkscreen** — Copyright 2001 The Silkscreen Project Authors, SIL Open Font License 1.1.
- **VT323** — Copyright The VT323 Project Authors, SIL Open Font License 1.1.

Both are bundled locally in `web/assets/fonts/`; the full license text is in [`web/assets/fonts/OFL.txt`](web/assets/fonts/OFL.txt).

## License

MIT (application code). Bundled fonts remain under the SIL Open Font License.
