import type { Engagement, Seen, Session } from '../types';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:5000/api').replace(/\/$/, '');
export const WEB_BASE_URL = (process.env.EXPO_PUBLIC_WEB_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');

async function request<T>(path: string, options: RequestInit = {}, accessToken = ''): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `Request failed (${response.status})`);
  return body.data as T;
}

export const api = {
  login: (email: string, password: string) => request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password }) }),
  listSeens: (accessToken: string) => request<{ items: Seen[] }>('/publications/seen?page=1&limit=20&tab=seen', {}, accessToken),
  getSeenEngagement: (id: string, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/engagement`, {}, accessToken),
  reactToSeen: (id: string, reaction: string, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction }) }, accessToken),
  removeSeenReaction: (id: string, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/reaction`, { method: 'DELETE', body: JSON.stringify({}) }, accessToken),
  commentOnSeen: (id: string, text: string, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) }, accessToken),
  toggleSeenShare: (id: string, shared: boolean, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/share`, { method: shared ? 'DELETE' : 'PUT', body: JSON.stringify({}) }, accessToken),
  toggleSeenSave: (id: string, accessToken: string) => request<{ engagement: Engagement }>(`/publications/${id}/save`, { method: 'PUT', body: JSON.stringify({}) }, accessToken),
};
