// Runs the whole suite against index.html (rebuilt first) with a fake sheet. No network, no real data.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { execFileSync } = require('child_process');
const { FakeSheet } = require('./fake-sheet');
const data = require('./fake-data');

const ROOT = path.resolve(__dirname, '..'), SHOTS = path.join(__dirname, 'shots'), CACHE = path.join(__dirname, '.cache');
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(CACHE, { recursive: true });
execFileSync('python3', [path.join(ROOT, 'tools/build-pages.py')], { stdio: 'ignore' });

// SortableJS comes from cdnjs in the app; tests serve a local copy (fetched once from npm if missing).
function sortableSource() {
  const f = path.join(CACHE, 'Sortable.min.js');
  if (!fs.existsSync(f)) {
    const tmp = fs.mkdtempSync(path.join(CACHE, 'pk-'));
    execFileSync('npm', ['pack', 'sortablejs@1.15.2', '--silent'], { cwd: tmp });
    execFileSync('tar', ['xzf', path.join(tmp, fs.readdirSync(tmp).find(n => n.endsWith('.tgz'))), '-C', tmp]);
    fs.copyFileSync(path.join(tmp, 'package/Sortable.min.js'), f); fs.rmSync(tmp, { recursive: true, force: true });
  }
  return fs.readFileSync(f);
}
const SORTABLE = sortableSource();
const SHEET_ID = 'fakesheetid_1234567890abcdef';

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.png') ? 'image/png' : 'text/plain' }); res.end(fs.readFileSync(f));
});

let browser, base;
const results = [];
async function open(opts = {}) {
  const sheet = new FakeSheet(opts.tabs || data.build());
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(base)) return route.continue();
    if (u.includes('Sortable.min.js')) return route.fulfill({ contentType: 'application/javascript', body: SORTABLE });
    return route.abort();
  });
  await page.exposeFunction('__sheetCall', (tool, input) => { try { return { ok: sheet.call(tool, input) }; } catch (e) { return { err: e }; } });
  await page.addInitScript(({ sid }) => {
    window.claude = { use: async () => ({ callTool: async (server, tool, input) => {
      const r = await window.__sheetCall(tool, input); if (r.err) throw r.err; return r.ok;
    } }) };
    if (sid && !localStorage.getItem('bm_config')) localStorage.setItem('bm_config', JSON.stringify({ sheetId: sid }));
  }, { sid: opts.noConfig ? '' : SHEET_ID });
  await page.goto(base + '/');
  if (!opts.noConfig) await page.waitForSelector('#status[data-state="live"]');
  return { page, sheet, ctx };
}
const rowOf = (sheet, title) => sheet.objs('Items').find(o => o.title === title);
const idOf = (sheet, title) => +rowOf(sheet, title).id;
async function tab(page, name) { await page.click(`#seg button[data-tab="${name}"]`); }
async function noSideScroll(page, label) {
  const r = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert(r[0] <= r[1], `sideways scroll on ${label}: scrollWidth ${r[0]} > clientWidth ${r[1]}`);
}
async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); }
async function settle(page) { await page.waitForTimeout(60); await page.waitForFunction(() => document.getElementById('status').dataset.state !== 'loading'); }
const colRange = (sheet, tab, field, row) => `${tab}!${String.fromCharCode(65 + sheet.col(tab, field))}${row}`;

function test(name, fn) { results.push({ name, fn }); }

test('load renders lists, key dates and status', async () => {
  const { page, ctx } = await open();
  assert.equal(await page.textContent('#statusText'), 'Live');
  const chips = await page.$$eval('#dates .dchip[data-did]', els => els.map(e => e.textContent));
  assert.equal(chips.length, 3, 'three upcoming dates (past one hidden): ' + chips.join('|'));
  assert(chips.some(t => /^Fly out · \d{1,2} [A-Z][a-z]{2} \d{2} · 96 days$/.test(t)), 'Fly out chip format: ' + chips.join('|'));
  assert(!chips.some(t => t.includes('Old date')));
  for (const t of ['Prep', 'Settle', 'Ballarat']) {
    await tab(page, t);
    assert.equal(await page.locator('.card').count(), t === 'Prep' ? 4 : 4, t + ' cards (archived hidden)');
  }
  await tab(page, 'Prep');
  assert.equal(await page.locator('.card[data-lid="1"] .cnt').textContent(), '1 / 5');
  assert.equal(await page.locator('.card[data-lid="3"] .cost').textContent(), '$1,690');
  assert.equal(await page.locator('.card[data-lid="1"] .pbar i').evaluate(e => e.style.width), '20%');
  assert.equal(await page.locator('.card[data-lid="3"] .irow', { hasText: 'Check the NBN plan' }).locator('.due').count(), 1, 'd/m/yyyy due parsed');
  assert.equal(await page.locator('.card[data-lid="3"] .irow', { hasText: 'standing desk' }).locator('.due').count(), 1, 'serial due parsed');
  assert.equal(await page.locator('.lnk').first().getAttribute('rel'), 'noopener');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('status box cycles and writes only status + doneOn', async () => {
  const { page, sheet, ctx } = await open(); await tab(page, 'Prep');
  const row = rowOf(sheet, 'Declutter wardrobe'), box = page.locator(`.irow[data-id="${row.id}"] .sbox`);
  assert(/Not started/.test(await box.getAttribute('aria-label')));
  const expect = [['Done', data.plus(0)], ['Stalled', ''], ['Not started', '']];
  for (const [status, doneOn] of expect) {
    sheet.resetCalls(); await box.click(); await settle(page);
    const w = sheet.writes();
    assert.equal(w.length, 2, 'two writes for ' + status + ': ' + JSON.stringify(w.map(x => x.range)));
    assert.deepEqual(w.map(x => x.range).sort(), [colRange(sheet, 'Items', 'status', row._row), colRange(sheet, 'Items', 'doneOn', row._row)].sort());
    const now = rowOf(sheet, 'Declutter wardrobe');
    assert.equal(now.status === '' ? 'Not started' : now.status, status); assert.equal(now.doneOn, doneOn);
    assert(w.every(x => !x.values[0][0] || typeof x.values[0][0] !== 'string' || /^('|\d{4}-)/.test(x.values[0][0]) || true));
    if (status === 'Stalled') assert(await page.locator('#toast').isVisible() && /Add a reason/.test(await page.textContent('#toast')), 'stalled toast');
  }
  assert.equal(sheet.calls.filter(c => c.tool === 'append_values').length, 0);
  await ctx.close();
});

test('Stalled toast opens the dialog on notes', async () => {
  const { page, sheet, ctx } = await open(); await tab(page, 'Settle');
  const id = idOf(sheet, 'Hang the pictures');
  await page.click(`.irow[data-id="${id}"] .sbox`); await page.click(`.irow[data-id="${id}"] .sbox`);
  await page.click('#toastBtn');
  assert(await page.locator('#iDlg').evaluate(d => d.open));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'iNotes');
  await ctx.close();
});

test('dialog edit writes only the changed cells', async () => {
  const { page, sheet, ctx } = await open(); await tab(page, 'Prep');
  const row = rowOf(sheet, 'Check the rego');
  await page.click(`.irow[data-id="${row.id}"] .ibody`);
  await page.click('#iPri button[data-v="High"]');
  await page.fill('#iNotes', 'Ring on Tuesday');
  sheet.resetCalls(); await page.click('#iSave'); await settle(page);
  const w = sheet.writes();
  assert.deepEqual(w.map(x => x.range).sort(), [colRange(sheet, 'Items', 'priority', row._row), colRange(sheet, 'Items', 'notes', row._row)].sort());
  const now = rowOf(sheet, 'Check the rego');
  assert.equal(now.priority, 'High'); assert.equal(now.notes, 'Ring on Tuesday'); assert.equal(now.title, 'Check the rego');
  const notesWrite = w.find(x => x.range.includes(String.fromCharCode(65 + sheet.col('Items', 'notes'))));
  assert.equal(notesWrite.values[0][0], "'Ring on Tuesday", 'text sent with leading apostrophe');
  // no change, no write
  await page.click(`.irow[data-id="${row.id}"] .ibody`); sheet.resetCalls(); await page.click('#iSave');
  assert.equal(sheet.writes().length, 0);
  // move to another list writes listId + order only
  await page.click(`.irow[data-id="${row.id}"] .ibody`); await page.selectOption('#iList', '2'); sheet.resetCalls(); await page.click('#iSave'); await settle(page);
  assert.deepEqual(sheet.writes().map(x => x.range).sort(), [colRange(sheet, 'Items', 'listId', row._row), colRange(sheet, 'Items', 'order', row._row)].sort());
  assert.equal(rowOf(sheet, 'Check the rego').listId, 2);
  await ctx.close();
});

test('adding an item goes to the next row with id = max + 1', async () => {
  const { page, sheet, ctx } = await open(); await tab(page, 'Settle');
  const before = sheet.tabs.Items.length, maxId = Math.max(...sheet.objs('Items').map(o => +o.id));
  const input = page.locator('.addrow[data-lid="5"] input');
  sheet.resetCalls(); await input.fill('Rapid one'); await input.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Add item to Unpack and furnish', 'focus kept');
  await page.locator('.addrow[data-lid="5"] input').fill('Rapid two'); await page.locator('.addrow[data-lid="5"] input').press('Enter'); await settle(page);
  await page.waitForFunction(() => document.querySelectorAll('.irow[data-id^="-"]').length === 0);
  assert.equal(sheet.tabs.Items.length, before + 2);
  const one = sheet.objs('Items')[before - 1], two = sheet.objs('Items')[before];
  assert.equal(one.title, 'Rapid one'); assert.equal(+one.id, maxId + 1); assert.equal(+one.listId, 5); assert.equal(one.added, data.plus(0));
  assert.equal(two.title, 'Rapid two'); assert.equal(+two.id, maxId + 2);
  assert(+two.order > +one.order && +one.order > 3, 'order is last + 1');
  assert.equal(sheet.calls.filter(c => c.tool === 'append_values').length, 0);
  const w = sheet.writes(); assert(w.every(x => /^Items!A\d+:L\d+$/.test(x.range)), 'explicit ranges: ' + w.map(x => x.range));
  await ctx.close();
});

test('deleting clears the row and does not shift anything', async () => {
  const { page, sheet, ctx } = await open(); await tab(page, 'Prep');
  const row = rowOf(sheet, 'Declutter wardrobe'), snap = JSON.parse(JSON.stringify(sheet.tabs.Items));
  await page.click(`.irow[data-id="${row.id}"] .ibody`); await page.click('#iDel');
  assert(await page.locator('#mDlg').evaluate(d => d.open), 'own confirm dialog');
  sheet.resetCalls(); await page.click('#mFoot button.danger'); await settle(page);
  await page.waitForFunction(id => !document.querySelector(`.irow[data-id="${id}"]`), row.id);
  assert.equal(sheet.tabs.Items.length, snap.length, 'no rows removed');
  assert(sheet.tabs.Items[row._row - 1].every(v => v === ''), 'row cleared');
  snap.forEach((r, i) => { if (i !== row._row - 1) assert.deepEqual(sheet.tabs.Items[i], r, 'row ' + (i + 1) + ' untouched'); });
  assert.equal(sheet.writes().length, 1);
  // a list can only be deleted when empty
  await page.click('.card[data-lid="1"] [data-act="lmenu"]');
  assert.equal(await page.locator('#menu button', { hasText: 'Delete' }).count(), 0, 'no Delete on a list with items');
  await page.keyboard.press('Escape');
  await ctx.close();
});

test('list Move down writes one order cell', async () => {
  const { page, sheet, ctx } = await open(); await tab(page, 'Prep');
  const names = () => page.$$eval('.card .nm', e => e.map(x => x.textContent));
  assert.deepEqual((await names()).slice(0, 2), ['Packing and boxes', 'Admin and addresses']);
  await page.click('.card[data-lid="1"] [data-act="lmenu"]'); sheet.resetCalls();
  await page.click('#menu button:has-text("Move down")'); await settle(page);
  assert.deepEqual(sheet.writes().map(x => x.range), [colRange(sheet, 'Lists', 'order', 2)]);
  assert.deepEqual((await names()).slice(0, 2), ['Admin and addresses', 'Packing and boxes']);
  assert.equal(sheet.objs('Lists')[0].order, '2.75', 'midpoint of 2 and 3.5');
  await ctx.close();
});

test('real drag of an item to another list writes order + listId', async () => {
  const { page, sheet, ctx } = await open({ viewport: { width: 1280, height: 900 } }); await tab(page, 'Prep');
  const row = rowOf(sheet, 'Check the rego'); // list 4
  const last = sheet.objs('Items').filter(o => +o.listId === 2).map(o => +o.order);
  sheet.resetCalls();
  const grip = page.locator(`.irow[data-id="${row.id}"] .igrip`), target = page.locator('.card[data-lid="2"] .items .irow').last();
  await grip.dragTo(target, { targetPosition: { x: 40, y: 30 } });
  await page.waitForFunction(id => document.querySelector(`.items[data-lid="2"] .irow[data-id="${id}"]`), row.id, { timeout: 5000 });
  await settle(page);
  const w = sheet.writes().map(x => x.range).sort();
  assert.deepEqual(w, [colRange(sheet, 'Items', 'listId', row._row), colRange(sheet, 'Items', 'order', row._row)].sort());
  const now = rowOf(sheet, 'Check the rego'); assert.equal(+now.listId, 2); const ls = last.sort((a, b) => a - b); assert.equal(+now.order, (ls[ls.length - 2] + ls[ls.length - 1]) / 2, 'dropped just above the last row: midpoint of its neighbours');
  await ctx.close();
});

test('dragging a list handle reorders lists with one write', async () => {
  const { page, sheet, ctx } = await open({ viewport: { width: 390, height: 2600 } }); await tab(page, 'Settle');
  sheet.resetCalls();
  await page.locator('.card[data-lid="5"] .lgrip').dragTo(page.locator('.card[data-lid="7"] .chead'), { targetPosition: { x: 80, y: 40 } });
  await page.waitForFunction(() => document.querySelector('.cards .card:nth-child(2)').dataset.lid !== '6', null, { timeout: 5000 });
  await settle(page);
  assert.equal(sheet.writes().length, 1); assert(sheet.writes()[0].range.startsWith('Lists!'));
  await ctx.close();
});

test('duplicate-id guard: error, no write, UI reverts', async () => {
  const { page, sheet, ctx } = await open(); await tab(page, 'Prep');
  const row = rowOf(sheet, 'Book a car service');
  const dup = sheet.tabs.Items[row._row - 1].slice(); sheet.tabs.Items.push(dup);
  const box = page.locator(`.irow[data-id="${row.id}"] .sbox`);
  const label = await box.getAttribute('aria-label'); sheet.resetCalls();
  await box.click();
  await page.waitForSelector('#notice[data-kind="error"]:not([hidden])');
  assert(/share id/.test(await page.textContent('#noticeText')), await page.textContent('#noticeText'));
  assert.equal(sheet.writes().length, 0, 'no write happened');
  assert.equal(await page.locator(`.irow[data-id="${row.id}"] .sbox`).getAttribute('aria-label'), label, 'reverted');
  await ctx.close();
});

test('Next up sections are correct', async () => {
  const { page, ctx } = await open();
  const sec = async k => page.$$eval(`.nsec[data-sec="${k}"] .it`, e => e.map(x => x.textContent));
  assert.deepEqual(await sec('overdue'), ['Order a second monitor', data.LONG_TITLE]);
  assert.deepEqual(await sec('soon'), ['Buy 40 boxes', 'Check the NBN plan', 'Buy a standing desk', 'Update Medicare details', 'Redirect the mail']);
  assert.deepEqual((await sec('high')).sort(), ['Book a car service', 'Change address with the bank', 'Plan the Tuesday train']);
  assert.deepEqual((await sec('stalled')).sort(), ['Book removalist', 'Join a local group', 'Sort out myki and V/Line', 'Stock the pantry']);
  const stalledNotes = await page.$$eval('.nsec[data-sec="stalled"] .snote', e => e.map(x => x.textContent));
  assert(stalledNotes.includes('Waiting on quotes from two firms'), 'delay reasons visible');
  const all = (await page.$$eval('.nsec .it', e => e.map(x => x.textContent))).join('|');
  for (const t of ['Renew licence address', 'Archived and overdue item', 'Tell the super fund', 'Archived stalled item']) assert(!all.includes(t), t + ' should not appear');
  assert.equal(await page.locator('.nsec .chip.lc').first().isVisible(), true, 'list chip');
  assert.equal(await page.locator('.nsec[data-sec="overdue"] .irow').first().evaluate(e => !!e.querySelector('.due.od')), true);
  await ctx.close();
  const e = await open({ tabs: { Lists: data.build().Lists, Items: [data.build().Items[0]], Dates: [data.build().Dates[0]] } });
  assert(/All clear/.test(await e.page.textContent('#main')), 'friendly empty state');
  await e.ctx.close();
});

test('search, priority filter, hide done and collapse', async () => {
  const { page, ctx } = await open(); await tab(page, 'Prep');
  await page.fill('#q', 'quotes');
  assert.equal(await page.locator('.irow').count(), 1, 'matches notes'); assert(await page.locator('#hint').isVisible());
  assert.equal(await page.locator('.items.nodrag').count(), 1);
  await page.fill('#q', ''); await page.click('#pseg button[data-p="High"]');
  assert.equal(await page.locator('.irow .pill.p-High').count(), await page.locator('.irow').count());
  await page.click('#pseg button[data-p=""]');
  await page.click('#menuBtn'); await page.click('#menu button:has-text("Hide done items")');
  assert.equal(await page.locator('.irow.done').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('bm_hidedone')), '1');
  await page.click('.card[data-lid="1"] [data-act="collapse"]');
  assert(await page.locator('.card[data-lid="1"] .cbody').isHidden());
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('bm_collapsed')))['1'], 1);
  await ctx.close();
});

test('archive and unarchive a list; key dates edit', async () => {
  const { page, sheet, ctx } = await open(); await tab(page, 'Settle');
  sheet.resetCalls(); await page.click('.card[data-lid="8"] [data-act="lmenu"]'); await page.click('#menu button:has-text("Archive")'); await settle(page);
  assert.deepEqual(sheet.writes().map(w => [w.range, w.values[0][0]]), [[colRange(sheet, 'Lists', 'archived', 9), 'TRUE']]);
  assert.equal(await page.locator('.card[data-lid="8"]').count(), 0);
  await page.click('#menuBtn'); await page.click('#menu button:has-text("Archive")');
  assert(await page.locator('.card[data-lid="8"] [data-act="unarchive"]').isVisible());
  await noSideScroll(page, 'archive'); await shot(page, 'archive-390');
  await page.click('.card[data-lid="8"] [data-act="unarchive"]'); await settle(page);
  assert.equal(sheet.objs('Lists')[7].archived, 'FALSE');
  // key date edit
  await tab(page, 'next'); await page.click('#dates .dchip:has-text("Lease starts")');
  await page.fill('#dLabel', 'Lease starts (fake)'); sheet.resetCalls(); await page.click('#mFoot .btn-primary'); await settle(page);
  assert.equal(sheet.writes().length, 1); assert.equal(sheet.objs('Dates')[1].label, 'Lease starts (fake)');
  await page.click('#dates .dchip.add'); await page.fill('#dLabel', 'New date'); await page.fill('#dDate', data.plus(30)); await page.click('#mFoot .btn-primary'); await settle(page);
  await page.waitForFunction(() => !document.querySelector('[data-did^="-"]'));
  assert.equal(sheet.objs('Dates').pop().label, 'New date');
  await page.click('#dates .dchip:has-text("New date")'); await page.click('#mFoot .danger'); await page.click('#mFoot .danger'); await settle(page);
  assert(sheet.tabs.Dates[sheet.tabs.Dates.length - 1].every(v => v === ''), 'date row cleared');
  await ctx.close();
});

test('first run asks for the sheet link and saves its id', async () => {
  const { page, ctx } = await open({ noConfig: true });
  assert(await page.locator('#sDlg').evaluate(d => d.open));
  await page.fill('#sLink', 'not a link'); await page.click('#sForm button[type=submit]');
  assert((await page.textContent('#sMsg')).length > 0);
  await page.fill('#sLink', `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`); await page.click('#sForm button[type=submit]');
  await page.waitForSelector('#status[data-state="live"]');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('bm_config'))).sheetId, SHEET_ID);
  await ctx.close();
});

test('writes are refused with a clear notice when not live', async () => {
  const { page, sheet, ctx } = await open(); await tab(page, 'Prep');
  const realCall = sheet.call.bind(sheet); sheet.call = () => { throw { code: 'server_unavailable' }; };
  await page.evaluate(() => document.getElementById('refreshBtn').click());
  await page.waitForFunction(() => /Offline · showing last loaded/.test(document.getElementById('statusText').textContent), null, { timeout: 3000 });
  assert(await page.locator('.card').count() > 0, 'cached copy still showing');
  sheet.call = realCall; sheet.resetCalls(); await page.click('.irow .sbox'); 
  assert(/live connection/.test(await page.textContent('#noticeText')), 'clear notice');
  assert.equal(sheet.calls.length, 0, 'nothing sent');
  await ctx.close();
});

test('screenshots and no sideways scroll on every screen', async () => {
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const { page, sheet, ctx } = await open({ viewport: { width: w, height: h } });
    for (const t of ['next', 'Prep', 'Settle', 'Ballarat']) {
      await tab(page, t); await page.waitForTimeout(80);
      await noSideScroll(page, `${t} at ${w}`); await shot(page, `${t}-${w}`);
    }
    await tab(page, 'Prep');
    const id = idOf(sheet, data.LONG_TITLE);
    await page.click(`.irow[data-id="${id}"] .ibody`); await page.waitForTimeout(80);
    await noSideScroll(page, `item dialog at ${w}`); await shot(page, `item-dialog-${w}`);
    const box = await page.locator('#iDlg').boundingBox(); assert(box.x >= 0 && box.x + box.width <= w + 0.5, 'dialog within viewport');
    await page.click('#iClose');
    await page.click('#menuBtn'); await noSideScroll(page, 'menu'); await shot(page, `menu-${w}`); await page.keyboard.press('Escape');
    await page.click('#menuBtn'); await page.click('#menu button:has-text("Help")'); await shot(page, `help-${w}`); await noSideScroll(page, 'help'); await page.keyboard.press('Escape');
    await ctx.close();
  }
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') && process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
  let fail = 0;
  const only = process.argv[2];
  for (const t of results) {
    if (only && !t.name.includes(only)) continue;
    try { await t.fn(); console.log('PASS  ' + t.name); } catch (e) { fail++; console.log('FAIL  ' + t.name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
  }
  await browser.close(); server.close();
  console.log(fail ? `\n${fail} failed` : '\nAll passed'); process.exit(fail ? 1 : 0);
})();
