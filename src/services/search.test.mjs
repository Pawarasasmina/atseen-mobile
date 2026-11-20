import assert from 'node:assert/strict';
import test from 'node:test';
import { api, setAccessTokenProvider } from './api.ts';

test('global search uses shared authenticated search, including encoded queries and pagination', async () => {
  const original = globalThis.fetch;
  const calls = [];
  setAccessTokenProvider(() => 'search-test-token');
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return new Response(JSON.stringify({ data: { items: [{ id: 'seen-1', type: 'seen' }], nextCursor: '36' } }), { status: 200 });
  };
  try {
    const result = await api.search('coffee & Paris', 'seens', '18');
    assert.equal(calls[0].url.pathname, '/api/search');
    assert.equal(calls[0].url.searchParams.get('q'), 'coffee & Paris');
    assert.equal(calls[0].url.searchParams.get('type'), 'seens');
    assert.equal(calls[0].url.searchParams.get('cursor'), '18');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer search-test-token');
    assert.equal(result.nextCursor, '36');
    assert.equal(result.items[0].id, 'seen-1');
  } finally { globalThis.fetch = original; setAccessTokenProvider(null); }
});

test('discovery returns real backend people, trending and history; backend failures remain visible', async () => {
  const original = globalThis.fetch;
  const data = { sections: { people: { items: [{ id: 'person-1', title: 'A real person' }] } }, trending: [{ label: 'Travel' }], recent: [{ id: 'recent-1', query: 'coffee' }] };
  globalThis.fetch = async (url) => { assert.ok(url.endsWith('/search/defaults')); return new Response(JSON.stringify({ data }), { status: 200 }); };
  try {
    assert.deepEqual(await api.searchDefaults(), data);
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Too many searches' }), { status: 429 });
    await assert.rejects(api.search('coffee'), /Too many searches/);
  } finally { globalThis.fetch = original; }
});
