import assert from 'node:assert/strict';
import test from 'node:test';
import { api, setAccessTokenProvider } from './api.ts';

test('mobile wall reads and publishes through the current web wall backend', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return new Response(JSON.stringify({ success: true, data: { items: [], pagination: { page: 1, pages: 0 }, post: { id: 'note', text: 'test' }, view: 'grid' } }), { status: 200 });
  };
  setAccessTokenProvider(() => 'test-token');
  try {
    await api.listWallFeed('type=need_help&page=2');
    const body = new FormData(); body.append('text', 'test'); body.append('postType', 'Need Help');
    await api.publishWallNote(body, 'stable-retry-key');
    await api.getWallView(); await api.setWallView('grid');
    assert.ok(calls[0].url.endsWith('/posts?type=need_help&page=2'));
    assert.ok(calls[1].url.endsWith('/posts'));
    assert.equal(calls[1].body, body);
    assert.equal(calls[1].headers['Idempotency-Key'], 'stable-retry-key');
    assert.equal(calls[1].headers['Content-Type'], undefined);
    assert.ok(calls.every(call => call.headers.Authorization === 'Bearer test-token'));
    assert.ok(calls[2].url.endsWith('/users/me/wall-view'));
    assert.equal(calls[3].method, 'PATCH');
    assert.deepEqual(JSON.parse(calls[3].body), { view: 'grid' });
  } finally { globalThis.fetch = originalFetch; setAccessTokenProvider(null); }
});

test('note management follows the existing endpoint verbs and exposes backend rejections', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return new Response(JSON.stringify({ data: {} }), { status: 200 });
  };
  try {
    await api.wallPostAction('note', 'resolution', { solved: true });
    await api.wallPostAction('note', 'block-author');
    await api.wallPostAction('note', 'delete');
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'PUT', 'DELETE']);
    assert.deepEqual(JSON.parse(calls[0].body), { solved: true });
    assert.ok(calls[2].url.endsWith('/posts/note'));
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Posting is temporarily restricted' }), { status: 403 });
    await assert.rejects(api.publishWallNote(new FormData(), 'retry-key', 'token'), /Posting is temporarily restricted/);
  } finally { globalThis.fetch = originalFetch; }
});
