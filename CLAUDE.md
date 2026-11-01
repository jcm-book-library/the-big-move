# Ballarat (the-big-move): notes for Claude

**Read the house rules first:** [HOUSE-RULES.md](https://github.com/jcm-book-library/control-room/blob/main/HOUSE-RULES.md) in `control-room` (plain text: https://raw.githubusercontent.com/jcm-book-library/control-room/main/HOUSE-RULES.md). The notes below are this repo's own; where they are more specific, they win.

## This repo
- `app.html` is the only source. `python3 tools/build-pages.py` builds `index.html` for GitHub Pages. Commit both.
- Tests: `node tests/run.js` (fake in-memory sheet, fake data only; screenshots go to `tests/shots/`, which is gitignored).
- Live: https://jcm-book-library.github.io/the-big-move/

## The sheet
- Its own Google Sheet called **Ballarat**, in the owner's main Google account. The link is not in the code: the app asks for it once and keeps it in the browser (`bm_config.sheetId`).
- The app owns every tab in it: `Lists`, `Items`, `Dates`. Columns are read by header name.
  - `Lists`: `id, tab, name, order, archived, notes` (`tab` is `Prep`, `Settle` or `Ballarat`)
  - `Items`: `id, listId, order, title, status, priority, due, notes, link, cost, added, doneOn` (`status` is Not started / Stalled / Done; `priority` is High / Medium / Low / blank)
  - `Dates`: `id, label, date, notes` (key-date countdowns)
- `order` is fractional: a drag writes one cell (the midpoint between neighbours). Deleting clears a row's cells; rows are never removed. New rows go below the last used row with an explicit range.
- The sheet holds private things (the home address, links). Keep them out of the repo, tests and screenshots.

## Owner context
- Moving gradually from their parents' house (Dec 2026 to Jan 2027) to a rental from their parents; overseas 5 Feb to 15 Mar 2027; remote 4 days, commute 1. PO box near the new place.
- After March: archive the move lists and turn the app into "life in Ballarat". Ideas for that live in the sheet's "Ideas for this app" list.
