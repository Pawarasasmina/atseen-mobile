import assert from 'node:assert/strict';
import test from 'node:test';
import { initialWallFilters, mergeWallPosts, normalizeWallPost, updateWallPost, wallQuery } from './wall.ts';

test('needs use the same server OR selection as the web wall', () => {
  const params = new URLSearchParams(wallQuery({ ...initialWallFilters, selected: ['right_now', 'meet_people', 'buy_sell', 'need_help'] }));
  assert.equal(params.get('matchMode'), 'any');
  assert.equal(params.get('rightNow'), 'true');
  assert.equal(params.get('topic'), 'meet_people');
  assert.equal(params.get('type'), 'need_help,buy_sell');
});

test('location and text filters are encoded without changing their content', () => {
  const params = new URLSearchParams(wallQuery({ ...initialWallFilters, scope: 'nearby', location: 'Colombo & Galle', q: 'tea + coffee', sort: 'popular' }, 3));
  assert.equal(params.get('location'), 'Colombo & Galle');
  assert.equal(params.get('near'), 'Colombo & Galle');
  assert.equal(params.get('q'), 'tea + coffee');
  assert.equal(params.get('page'), '3');
  assert.equal(params.get('sort'), 'popular');
  assert.equal(new URLSearchParams(wallQuery(initialWallFilters)).has('rightNow'), false);
});

test('pagination keeps ranking and treats reposts as separate feed entries', () => {
  const posts = [{ id: 'a', text: 'old' }, { id: 'share-a', originalPostId: 'a', text: 'old' }];
  const result = mergeWallPosts(posts, [{ id: 'a', text: 'new' }, { id: 'b', text: 'other' }]);
  assert.deepEqual(result.map(post => post.id), ['a', 'share-a', 'b']);
  assert.equal(result[0].text, 'new');
  assert.equal(posts[0].text, 'old');
});

test('engagement updates every copy while preserving repost attribution', () => {
  const sharer = { id: 'person' };
  const result = updateWallPost([{ id: 'a', text: 'note' }, { id: 'share-a', originalPostId: 'a', shareId: 'share', sharedBy: sharer, shareCaption: 'caption', feedCreatedAt: '2026-11-19', text: 'note' }], { id: 'a', text: 'edited', supportCount: 4, viewerSaved: true });
  assert.deepEqual(result.map(post => post.reactionCount), [4, 4]);
  assert.equal(result[1].id, 'share-a');
  assert.equal(result[1].sharedBy, sharer);
  assert.equal(result[1].shareCaption, 'caption');
  assert.equal(result[1].feedCreatedAt, '2026-11-19');
  assert.equal(result[1].viewerSaved, true);
});

test('current API supportCount and legacy reactionCount both render correctly', () => {
  assert.equal(normalizeWallPost({ id: 'a', text: '', supportCount: 7 }).reactionCount, 7);
  assert.equal(normalizeWallPost({ id: 'a', text: '', reactionCount: 0, supportCount: 7 }).reactionCount, 0);
});
