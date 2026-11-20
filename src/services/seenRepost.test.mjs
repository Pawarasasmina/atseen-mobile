import assert from 'node:assert/strict';
import test from 'node:test';
import { api, setAccessTokenProvider } from './api.ts';

const id = '507f1f77bcf86cd799439011';
test('Seen repost uses authenticated PUT and removal uses DELETE on the same existing backend resource', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return new Response(JSON.stringify({ success: true, data: { engagement: { viewerShared: options.method === 'PUT', shareCount: options.method === 'PUT' ? 5 : 4 } } }), { status: 200 });
  };
  setAccessTokenProvider(() => 'unit-test-token');
  try {
    const added = await api.toggleSeenShare(id, false);
    assert.equal(added.engagement.viewerShared, true);
    assert.equal(added.engagement.shareCount, 5);
    const removed = await api.toggleSeenShare(id, added.engagement.viewerShared);
    assert.equal(removed.engagement.viewerShared, false);
    assert.equal(removed.engagement.shareCount, 4);
    assert.deepEqual(calls.map((call) => call.method), ['PUT', 'DELETE']);
    assert.ok(calls.every((call) => call.url.endsWith(`/publications/${id}/share`)));
    assert.ok(calls.every((call) => call.headers.Authorization === 'Bearer unit-test-token'));
    assert.deepEqual(JSON.parse(calls[0].body), {});
    assert.deepEqual(JSON.parse(calls[1].body), {});
  } finally { globalThis.fetch = previousFetch; setAccessTokenProvider(null); }
});
test('backend rejection is surfaced instead of reporting a successful repost', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'You cannot repost your own Seen' }), { status: 409 });
  try { await assert.rejects(api.toggleSeenShare(id, false, 'unit-test-token'), /You cannot repost your own Seen/); }
  finally { globalThis.fetch = previousFetch; }
});
test('failed network requests reject without silently retrying the mutation', async () => {
  const previousFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('Network request failed'); };
  try { await assert.rejects(api.toggleSeenShare(id, false, 'unit-test-token'), /Network request failed/); assert.equal(calls, 1); }
  finally { globalThis.fetch = previousFetch; }
});
