import assert from 'node:assert/strict';
import test from 'node:test';
import { isSeenVideo, orderedChapters, seenDuration, seenMediaSource, seenReadMinutes } from './seenPresentation.ts';

test('published chapter ordering preserves locks and does not reorder the cached API snapshot', () => {
  const seen = { chapters: [{ id: 'locked', order: 2, locked: true, blocks: [] }, { id: 'preview', order: 0, isPreview: true, blocks: [{ type: 'TEXT', text: 'Preview' }] }] };
  const sorted = orderedChapters(seen);
  assert.deepEqual(sorted.map((chapter) => chapter.id), ['preview', 'locked']);
  assert.equal(sorted[1].locked, true);
  assert.deepEqual(seen.chapters.map((chapter) => chapter.id), ['locked', 'preview']);
});

test('cover playback recognizes API video descriptors and signed playback URLs without treating images as video', () => {
  assert.equal(isSeenVideo({ resourceType: 'video', secureUrl: 'https://cdn.test/asset' }), true);
  assert.equal(isSeenVideo({ playbackUrl: 'https://cdn.test/cover.MP4?signature=value' }), true);
  assert.equal(isSeenVideo({ mediaType: 'IMAGE', secureUrl: 'https://cdn.test/cover.jpg' }), false);
  assert.equal(seenMediaSource({ playbackUrl: '/uploads/video.mp4' }), '/uploads/video.mp4');
});

test('reader metadata uses actual chapter text and safely handles missing media durations', () => {
  assert.equal(seenReadMinutes({ chapters: [{ blocks: [{ text: 'word '.repeat(441) }] }] }), 3);
  assert.equal(seenReadMinutes({}), 1);
  assert.equal(seenDuration(75.8), '1:15');
  assert.equal(seenDuration(-2), '0:00');
});
