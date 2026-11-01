// Fake data only. The repo is public, so nothing here is a real address, link or person.
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plus = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d); };
const dmy = n => { const [y, m, d] = plus(n).split('-'); return `${+d}/${+m}/${y}`; };
const serial = n => { const [y, m, d] = plus(n).split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5); };

const LONG_TITLE = 'Ask the landlord about the thing with the very long fence line and whether the neighbours have agreed to share the cost of the repainting before the end of the lease period ' + 'supercalifragilisticexpialidocious'.repeat(2);
const LONG_URL = 'https://example.com/this/is/a/really/long/path/' + 'abcdefghij'.repeat(25) + '?ref=fake';

function build() {
  const lists = [['id', 'tab', 'name', 'order', 'archived', 'notes']];
  const items = [['id', 'listId', 'order', 'title', 'status', 'priority', 'due', 'notes', 'link', 'cost', 'added', 'doneOn']];
  const dates = [['id', 'label', 'date', 'notes']];
  let li = 0, ii = 0;
  const L = (tab, name, order, archived) => { lists.push([++li, tab, name, order, archived ? 'TRUE' : 'FALSE', '']); return li; };
  const I = (listId, title, o = {}) => { items.push([++ii, listId, o.order ?? ii, title, o.status || '', o.priority || '', o.due || '', o.notes || '', o.link || '', o.cost ?? '', plus(-20), o.doneOn || '']); return ii; };

  const a = L('Prep', 'Packing and boxes', 1), b = L('Prep', 'Admin and addresses', 2), c = L('Prep', 'Work setup', 3.5), d = L('Prep', 'Car and V/Line', 4);
  I(a, 'Buy 40 boxes', { priority: 'High', due: plus(3) });
  I(a, 'Pack the books', { status: 'Done', doneOn: plus(-2) });
  I(a, 'Book removalist', { status: 'Stalled', priority: 'High', notes: 'Waiting on quotes from two firms' });
  I(a, 'Declutter wardrobe', { priority: 'Low' });
  I(a, LONG_TITLE, { priority: 'Medium', due: plus(-4), link: LONG_URL, notes: 'Ring on Monday' });
  I(b, 'Change address with the bank', { priority: 'High' });
  I(b, 'Update Medicare details', { priority: 'Medium', due: plus(10) });
  I(b, 'Redirect the mail', { due: plus(14) });
  I(b, 'Renew licence address', { priority: 'Low', due: plus(15) });
  I(b, 'Tell the super fund', { status: 'Done', doneOn: plus(-1), due: plus(-5) });
  I(c, 'Order a second monitor', { priority: 'Medium', due: plus(-10), cost: 450 });
  I(c, 'Check the NBN plan', { due: dmy(6) });
  I(c, 'Buy a standing desk', { due: serial(7), cost: 1240, link: 'https://example.com/desk' });
  I(d, 'Sort out myki and V/Line', { status: 'Stalled', notes: 'Waiting for the card to arrive' });
  I(d, 'Check the rego', {});
  I(d, 'Book a car service', { priority: 'High' });

  const e = L('Settle', 'Unpack and furnish', 1), f = L('Settle', 'Local setup', 2), g = L('Settle', 'Kitchen', 3), h = L('Settle', 'Garden', 4);
  I(e, 'Assemble the bed', { priority: 'High', due: plus(30) });
  I(e, 'Hang the pictures', {});
  I(e, 'Find a lamp', { status: 'Done', doneOn: plus(-3) });
  I(f, 'Join the library', { priority: 'Low' });
  I(f, 'Find a GP', { priority: 'Medium', due: plus(40) });
  I(f, 'Find the farmers market', {});
  I(g, 'Buy a kettle', { cost: 39.95 });
  I(g, 'Stock the pantry', { status: 'Stalled', notes: 'Waiting until the move is done' });
  I(g, 'Label the spice jars', {});
  I(h, 'Plan the vegie patch', { priority: 'Low' });
  I(h, 'Buy a hose', { cost: 60 });
  I(h, 'Test the soil', { status: 'Done', doneOn: plus(-7) });

  const i = L('Ballarat', 'Weekend plans', 1), j = L('Ballarat', 'Commute days', 2), k = L('Ballarat', 'People to see', 3), l = L('Ballarat', 'Ideas', 4);
  I(i, 'Walk around Lake Wendouree', {});
  I(i, 'Try a new cafe', { priority: 'Low' });
  I(i, 'Visit the gardens', { due: plus(60) });
  I(j, 'Plan the Tuesday train', { priority: 'High' });
  I(j, 'Find a coworking day pass', { priority: 'Medium' });
  I(j, 'Cheap parking near the station', {});
  I(k, 'Dinner with the neighbours', {});
  I(k, 'Call the old team', { status: 'Done', doneOn: plus(-9) });
  I(k, 'Join a local group', { status: 'Stalled', notes: 'Not sure which one yet' });
  I(l, 'Learn about local history', {});
  I(l, 'Start a bike route list', { priority: 'Low' });
  I(l, 'Find a swimming spot', { priority: 'Medium' });

  const old = L('Prep', 'Old finished list', 5, true);
  I(old, 'Archived and overdue item', { due: plus(-30), priority: 'High' });
  I(old, 'Archived stalled item', { status: 'Stalled', notes: 'Should not show in Next up' });

  dates.push([1, 'Fly out', plus(96), 'Fake flight']);
  dates.push([2, 'Lease starts', plus(20), '']);
  dates.push([3, 'Old date', plus(-5), 'Past, so hidden']);
  dates.push([4, 'Settle in properly', plus(150), '']);
  return { Lists: lists, Items: items, Dates: dates };
}
module.exports = { build, plus, iso, LONG_TITLE, LONG_URL };
