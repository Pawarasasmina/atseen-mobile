import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeSeenHtml, ownsSeen, seenMenuActions } from './seenMenu.ts';

test('owner actions require the signed-in identity, including MongoDB-shaped IDs', () => {
  assert.equal(ownsSeen({ creator: { id: 'me' } }, 'me'), true);
  assert.equal(ownsSeen({ creator: { _id: 'me' } }, 'me'), true);
  assert.equal(ownsSeen({ creator: { id: 'other' }, access: 'OWNER' }, 'me'), false);
  assert.equal(ownsSeen({ access: 'OWNER' }, ''), false);
  assert.equal(ownsSeen({ creator: {} }, 'me'), false);
  assert.equal(ownsSeen({ access: 'OWNER' }, 'me'), true);
});
test('owner and viewer sheets use the prototype order and never mix destructive owner actions into the viewer menu', () => {
  assert.deepEqual(seenMenuActions({}, true, false).map((row) => row.key), ['share', 'story', 'insights', 'offline', 'edit', 'cover', 'pin', 'series', 'archive', 'delete']);
  assert.deepEqual(seenMenuActions({ creator: { name: 'Ethan Brooks' } }, false, false).map((row) => row.key), ['save', 'share', 'more', 'hide', 'report', 'block']);
  assert.equal(seenMenuActions({ creator: { name: 'Ethan Brooks' } }, false, false).at(-1).title, 'Block Ethan');
});
test('menu labels reflect backend state without changing download permission', () => {
  const seen = { isPinned: true, allowDownload: false, series: { id: 's', name: 'Coffee' } };
  const rows = seenMenuActions(seen, true, false);
  assert.equal(rows.find((row) => row.key === 'pin').title, 'Unpin');
  assert.equal(rows.find((row) => row.key === 'series').title, 'Series: Coffee');
  assert.match(rows.find((row) => row.key === 'offline').subtitle, /only you/);
  assert.equal(seenMenuActions({}, false, true)[0].title, 'Remove from library');
  assert.equal(seen.allowDownload, false);
});
test('offline PDF markup escapes user-provided Seen content', () => {
  assert.equal(escapeSeenHtml('<script>"x" & \'y\'</script>'), '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;');
});
