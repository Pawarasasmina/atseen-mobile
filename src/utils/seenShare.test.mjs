import assert from 'node:assert/strict';
import test from 'node:test';
import { remainingShareRecipients, toggleShareRecipient } from './seenShare.ts';

test('recipient selection persists independently of search results and can be toggled off', () => {
  const first = { id: 'one', name: 'One' }, second = { id: 'two', name: 'Two' };
  const selected = toggleShareRecipient(toggleShareRecipient([], first), second);
  assert.deepEqual(selected, [first, second]);
  assert.deepEqual(toggleShareRecipient(selected, first), [second]);
  assert.equal(selected.length, 2);
});
test('share selection cannot exceed the existing backend limit of ten people', () => {
  const selected = Array.from({ length: 10 }, (_, index) => ({ id: String(index) }));
  assert.equal(toggleShareRecipient(selected, { id: 'extra' }).length, 10);
  assert.equal(toggleShareRecipient(selected, selected[0]).length, 9);
});
test('a partial-send retry excludes delivered recipients and preserves failed recipient records', () => {
  const selected = [{ id: 'sent', name: 'Delivered' }, { id: 'failed', name: 'Retry me' }];
  assert.deepEqual(remainingShareRecipients(selected, [{ recipientId: 'sent' }]), [selected[1]]);
  assert.deepEqual(remainingShareRecipients(selected, []), selected);
  assert.deepEqual(remainingShareRecipients(selected, [{ recipientId: 'sent' }, { recipientId: 'failed' }]), []);
});
