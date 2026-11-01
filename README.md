# Ballarat

A planner for the move to Ballarat, and then a home base for life there.

**Live:** https://jcm-book-library.github.io/the-big-move/

## What it does
- **Next up:** overdue items, the next 14 days, high-priority items with no date, and anything stalled (with its reason).
- **Move prep / Settle in / Ballarat:** lists you can drag up and down, with items you can drag within and between lists.
- Each item has a box: empty = not started, dash = stalled, tick = done. Items can also have a priority (High / Medium / Low), a due date, notes (for example why it's stalled), a link and a cost.
- Key dates show as countdowns at the top.
- Lists can be archived; the Archive view brings them back.

## Data
A Google Sheet called **Ballarat** with three tabs: `Lists`, `Items`, `Dates`. The app asks for the sheet link the first time and remembers it in this browser. Sign-in uses the same Google Client ID as The Library.

## Files
| File | What it is |
|---|---|
| `app.html` | The only source (no `<head>`, so it also works as a claude.ai artifact) |
| `index.html` | Built from `app.html` by `python3 tools/build-pages.py`; don't edit by hand |
| `manifest.webmanifest`, `icons/` | Home-screen install |
| `tests/` | `node tests/run.js`: flow tests against a fake sheet, plus screenshots at 390px and 1280px |
| `project.json` | Charter for the Control Room |
