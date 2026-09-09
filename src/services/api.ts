import type { DiscoverData, Engagement, Seen, Session, SharedContentResult, ShareRecipient } from '../types';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:5000/api').replace(/\/$/, '');
export const WEB_BASE_URL = (process.env.EXPO_PUBLIC_WEB_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');
export const resolveMediaUrl = (value = '') => !value || /^https?:\/\//i.test(value) ? value : `${API_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`;
let unauthorizedHandler: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => { unauthorizedHandler = handler; };

async function request<T>(path: string, options: RequestInit = {}, accessToken = ''): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && accessToken) unauthorizedHandler?.();
    throw new Error(body?.message || `Request failed (${response.status})`);
  }
  return body.data as T;
}

async function upload<T>(path: string, form: FormData, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` }, body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401) unauthorizedHandler?.(); throw new Error(body?.message || `Upload failed (${response.status})`); }
  return body.data as T;
}

export const api = {
  login: (email: string, password: string) => request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password }) }),
  me: (accessToken: string) => request<{ user: Session['user'] }>('/auth/me', {}, accessToken),
  listSeens: (accessToken: string) => request<{ items: Seen[] }>('/publications/seen?page=1&limit=20&tab=seen', {}, accessToken),
  getSeenEngagement: (id: string, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/engagement`, {}, accessToken),
  reactToSeen: (id: string, reaction: string, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction }) }, accessToken),
  removeSeenReaction: (id: string, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/reaction`, { method: 'DELETE', body: JSON.stringify({}) }, accessToken),
  commentOnSeen: (id: string, text: string, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) }, accessToken),
  toggleSeenShare: (id: string, shared: boolean, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/share`, { method: shared ? 'DELETE' : 'PUT', body: JSON.stringify({}) }, accessToken),
  toggleSeenSave: (id: string, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/save`, { method: 'PUT', body: JSON.stringify({}) }, accessToken),
  discover: (filter: string, accessToken: string) => request<DiscoverData>(`/discover?filter=${encodeURIComponent(filter)}&limit=20`, {}, accessToken),
  toggleFollow: (username: string, accessToken: string) => request<{ relationship: { active?: boolean } }>(`/profiles/${encodeURIComponent(username)}/follow`, { method: 'PUT', body: JSON.stringify({}) }, accessToken),
  listShareRecipients: (query: string, accessToken: string) => request<{ people: ShareRecipient[] }>(`/messages/share/recipients?q=${encodeURIComponent(query.trim())}&limit=${query.trim() ? 30 : 16}`, {}, accessToken),
  sendSharedSeen: (id: string, recipientIds: string[], text: string, accessToken: string) => request<SharedContentResult>('/messages/share', { method: 'POST', body: JSON.stringify({ recipientIds, text: text.trim(), sharedContent: { contentType: 'seen', contentId: id } }) }, accessToken),
  listSeenCategories: (accessToken: string) => request<{ categories: { id: string; name: string }[] }>('/publications/seen/categories', {}, accessToken),
  createSeenDraft: (payload: { title: string; summary: string; category: string }, accessToken: string) => request<{ publication: { id: string; statusVersion: number } }>('/publications/drafts', { method: 'POST', body: JSON.stringify({ kind: 'SEEN', ...payload, description: payload.summary, visibility: 'PUBLIC', tags: [] }) }, accessToken),
  uploadSeenCover: (id: string, asset: { uri: string; name: string; type: string }, statusVersion: number, accessToken: string) => { const form = new FormData(); form.append('file', asset as unknown as Blob); form.append('purpose', 'COVER'); form.append('statusVersion', String(statusVersion)); return upload<{ publication: { statusVersion: number } }>(`/publications/mine/${id}/media-upload`, form, accessToken); },
  addSeenChapter: (id: string, title: string, text: string, statusVersion: number, accessToken: string) => request<{ chapter: unknown }>(`/publications/mine/${id}/chapters`, { method: 'POST', body: JSON.stringify({ title, blocks: [{ type: 'TEXT', text }], isPreview: true, releaseMode: 'IMMEDIATE', statusVersion }) }, accessToken),
  submitSeen: (id: string, statusVersion: number, accessToken: string) => request<{ publication: Seen }>(`/publications/mine/${id}/submit`, { method: 'POST', body: JSON.stringify({ statusVersion }) }, accessToken),
  createStory: (asset: { uri: string; name: string; type: string }, caption: string, editorMetadata: object, accessToken: string) => { const form = new FormData(); form.append('image', asset as unknown as Blob); form.append('caption', caption); form.append('mediaType', asset.type.startsWith('video/') ? 'video' : 'image'); form.append('duration', asset.type.startsWith('video/') ? '15' : '5'); form.append('audience', 'everyone'); form.append('allowReactions', 'true'); form.append('allowReplies', 'true'); form.append('allowSharing', 'true'); form.append('editorMetadata', JSON.stringify(editorMetadata)); return upload<{ story: unknown }>('/stories', form, accessToken); },
  createNote: (text: string, context: string, location: string, asset: { uri: string; name: string; type: string } | null, accessToken: string) => { const form = new FormData(); form.append('text', text); form.append('context', context); form.append('location', location); form.append('entityRefs', '[]'); if (asset) form.append('image', asset as unknown as Blob); return upload<{ post: unknown }>('/wall', form, accessToken); },
};
