// In-memory stand-in for the Google Sheets connector. 2D arrays per tab, A1 ranges,
// USER_ENTERED-style handling (a leading ' is stripped and the rest stored as text).
// Every call is recorded in `calls`. Nothing here ever touches a real sheet.
const colIdx = s => s.split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

class FakeSheet {
  constructor(tabs) { this.tabs = tabs; this.calls = []; }

  parse(range) {
    const m = String(range).match(/^'?([^'!]+)'?!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (!m) throw { code: 'tool_error', message: 'Bad range ' + range };
    const [, tab, c1, r1, c2, r2] = m;
    if (!this.tabs[tab]) throw { code: 'tool_error', message: 'Unable to parse range: ' + range };
    return { tab, c1: colIdx(c1), r1: +r1 - 1, c2: c2 ? colIdx(c2) : colIdx(c1), r2: r2 ? +r2 - 1 : +r1 - 1 };
  }

  call(tool, input) {
    this.calls.push({ tool, range: input.range, values: input.values });
    const p = this.parse(input.range), rows = this.tabs[p.tab];
    if (tool === 'get_values') {
      const out = [];
      for (let r = p.r1; r <= Math.min(p.r2, rows.length - 1); r++) {
        const row = [];
        for (let c = p.c1; c <= p.c2; c++) { const v = (rows[r] || [])[c]; row.push(v === undefined || v === null ? '' : String(v)); }
        while (row.length && row[row.length - 1] === '') row.pop();
        out.push(row);
      }
      while (out.length && !out[out.length - 1].length) out.pop();
      return { payload: { values: out } };
    }
    if (tool === 'update_values') {
      input.values.forEach((vr, i) => {
        const r = p.r1 + i; while (rows.length <= r) rows.push([]);
        vr.forEach((v, j) => {
          const c = p.c1 + j; while (rows[r].length <= c) rows[r].push('');
          rows[r][c] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
        });
      });
      return { payload: { updatedCells: input.values.reduce((n, v) => n + v.length, 0) } };
    }
    if (tool === 'append_values') {
      rows.push(input.values[0].slice());
      return { payload: { updates: { updatedRows: 1 } } };
    }
    throw { code: 'tool_error', message: 'Unknown tool ' + tool };
  }

  reads() { return this.calls.filter(c => c.tool === 'get_values'); }
  writes() { return this.calls.filter(c => c.tool !== 'get_values'); }
  resetCalls() { this.calls = []; }
  col(tab, name) { return this.tabs[tab][0].indexOf(name); }
  // row objects by header name, with the 1-based sheet row number
  objs(tab) {
    const h = this.tabs[tab][0];
    return this.tabs[tab].slice(1).map((r, i) => { const o = { _row: i + 2 }; h.forEach((k, j) => { o[k] = r[j] === undefined ? '' : r[j]; }); return o; });
  }
}
module.exports = { FakeSheet };
