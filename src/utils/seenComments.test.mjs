import assert from 'node:assert/strict';
import test from 'node:test';
import { appendCommentEmoji, commentEmojis, commentRows } from './seenComments.ts';

test('composer shortcuts follow the prototype without substituting comment reactions', () => {
  assert.deepEqual(commentEmojis, ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂']);
});
test('emoji insertion respects the backend 500-character limit without splitting emoji', () => {
  assert.equal(appendCommentEmoji('Great ', '🔥'), 'Great 🔥');
  assert.equal(appendCommentEmoji('x'.repeat(498), '😂').length, 500);
  assert.equal(appendCommentEmoji('x'.repeat(499), '😂'), 'x'.repeat(499));
});
test('backend reply threads render after their parent with the correct author context', () => {
  const thread = { id: 'root', text: 'First', author: { username: 'sofia' }, replies: [{ id: 'reply', text: 'Thanks', author: { username: 'luca' } }] };
  const rows = commentRows([thread, { id: 'next', text: 'Next' }]);
  assert.deepEqual(rows.map((row) => row.comment.id), ['root', 'reply', 'next']);
  assert.equal(rows[0].nested, false);
  assert.equal(rows[1].nested, true);
  assert.equal(rows[1].parentAuthor.username, 'sofia');
  assert.equal(thread.replies.length, 1);
});
test('duplicate or cyclic reply references cannot duplicate rows or hang the comments sheet', () => {
  const root = { id: 'root', text: 'Root', replies: [] };
  const reply = { id: 'reply', text: 'Reply', replies: [root] };
  root.replies.push(reply);
  assert.deepEqual(commentRows([root, reply]).map((row) => row.comment.id), ['root', 'reply']);
});
