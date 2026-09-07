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
};
