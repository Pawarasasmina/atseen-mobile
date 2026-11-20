import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSeenReaction, quickSeenReactions, seenReactionCount, seenReactions } from './seenReactions.ts';

test('quick plate and three-row picker follow the prototype reaction order', () => {
  assert.deepEqual(quickSeenReactions.map((reaction) => reaction.key), ['SEE_YOU', 'LOVE', 'FIRE', 'TEARY', 'LAUGH', 'LIKE']);
  assert.deepEqual(seenReactions.map((reaction) => reaction.key), ['SEE_YOU', 'LOVE', 'FIRE', 'TEARY', 'LAUGH', 'LIKE', 'CLAP', 'WOW', 'ADMIRE', 'SAD', 'HUG', 'STRONG', 'PRAY', 'HUNDRED', 'SPARKLES']);
  assert.equal(new Set(seenReactions.map((reaction) => reaction.key)).size, 15);
});
test('legacy reactions select the canonical option so tapping it removes rather than duplicates it', () => {
  assert.equal(normalizeSeenReaction('PHONE'), 'SEE_YOU');
  assert.equal(normalizeSeenReaction('INSIGHTFUL'), 'FIRE');
  assert.equal(normalizeSeenReaction('LOVE'), 'LOVE');
  assert.equal(normalizeSeenReaction(null), '');
});
test('displayed reaction counts include legacy backend entries exactly once', () => {
  const counts = { SEE_YOU: 3, PHONE: 2, FIRE: 5, INSIGHTFUL: 4, LOVE: 8 };
  assert.equal(seenReactionCount(counts, 'SEE_YOU'), 5);
  assert.equal(seenReactionCount(counts, 'FIRE'), 9);
  assert.equal(seenReactionCount(counts, 'LOVE'), 8);
  assert.equal(seenReactionCount(counts, 'HUG'), 0);
  assert.equal(seenReactionCount(undefined, 'LOVE'), 0);
});
