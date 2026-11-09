import assert from 'node:assert/strict';
import test from 'node:test';
import { dreamProgress, featuredExperiences, profileGiftPreviews, profileStatusText, visibleProfileSeen } from './ownProfile.ts';

test('profile status does not duplicate an emoji already stored in the backend label', () => {
  assert.equal(profileStatusText({ emoji: '📚', label: '📚 Reading' }), '📚 Reading');
  assert.equal(profileStatusText({ emoji: '📚', label: 'Reading' }), '📚 Reading');
});

test('profile experiences prefer paid records while excluding worlds and archived content', () => {
  const free = { id: 'free', kind: 'EXPERIENCE', status: 'PUBLISHED', pricing: { mode: 'FREE' } };
  const paid = { ...free, id: 'paid', pricing: { mode: 'ONE_TIME', starsAmount: 300 } };
  assert.deepEqual(featuredExperiences([free, { ...paid, id: 'world', kind: 'PREMIUM_WORLD' }, { ...paid, id: 'archived', status: 'ARCHIVED' }, { ...paid, id: 'draft', status: 'DRAFT' }, paid]).map((i) => i.id), ['paid', 'free']);
});
test('public-style grid excludes owner-only records', () => {
  for (const item of [{ status: 'DRAFT' }, { status: 'ARCHIVED' }, { status: 'REMOVED' }, { visibility: 'LINK_ONLY' }]) assert.equal(visibleProfileSeen(item), false);
  assert.equal(visibleProfileSeen({ status: 'PUBLISHED', visibility: 'FRIENDS' }), true);
});
test('Dream uses actual funding fields, caps oversubscription, and does not fabricate a missing goal', () => {
  assert.equal(dreamProgress({ goalStars: 500, receivedStars: 320 }), 64);
  assert.equal(dreamProgress({ goalStars: 500, receivedStars: 800 }), 100);
  assert.equal(dreamProgress({ goalStars: 0, receivedStars: 10 }), null);
});
test('gift previews use existing backend fields to exclude hidden gifts and prefer pins then recent gifts', () => {
  const gifts = [{ id: 'old' }, { id: 'pin', featuredOnProfile: true }, { id: 'hidden', hiddenFromProfile: true }, { id: 'new', fresh: true, createdAt: '2026-10-14' }];
  assert.deepEqual(profileGiftPreviews(gifts).map((g) => g.id), ['pin', 'new', 'old']);
  assert.equal(gifts.length, 4);
});

test('At seen uses a plain label for the vector icon and repairs old prefixes', () => {
  assert.equal(profileStatusText({ label: 'At seen', emoji: '' }), 'At seen');
  assert.equal(profileStatusText({ label: '?? At seen' }), 'At seen');
  assert.equal(profileStatusText({ label: '\u{1F441} At seen', emoji: '\u{1F441}' }), 'At seen');
});
