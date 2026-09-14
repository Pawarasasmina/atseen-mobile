import type { Conversation, DirectAccessWindow, DiscoverData, DreamData, Engagement, Message, ProfileViewers, SawYouToday, Seen, Session, SharedContentResult, ShareRecipient, StoryGroup, UnifiedProfile, User, WallComment, WallPost, WallStoriesData } from '../types';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:3104/api').replace(/\/$/, '');
export const WEB_BASE_URL = (process.env.EXPO_PUBLIC_WEB_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');

export const resolveMediaUrl = (value = '') => !value || /^https?:\/\//i.test(value) ? value : `${API_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`;

let accessTokenProvider: (() => string) | null = null;
let sessionUpdater: ((session: Session | null) => void | Promise<void>) | null = null;
let unauthorizedHandler: (() => void) | null = null;
let refreshPromise: Promise<string> | null = null;

export const setAccessTokenProvider = (provider: (() => string) | null) => { accessTokenProvider = provider; };
export const setSessionUpdater = (handler: ((session: Session | null) => void | Promise<void>) | null) => { sessionUpdater = handler; };
export const setUnauthorizedHandler = (handler: (() => void) | null) => { unauthorizedHandler = handler; };

function headersFor(options: RequestInit, accessToken = '') {
  const headers: Record<string, string> = { Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  return { ...headers, ...(options.headers as Record<string, string> | undefined) };
}

function apiErrorMessage(body: unknown, status: number) {
  const message = typeof body === 'object' && body && 'message' in body ? String((body as { message?: string }).message || '') : '';
  if (message) return message;
  if (status === 401) return 'Please sign in again.';
  if (status === 403) return 'You are not allowed to do that.';
  if (status === 404) return 'That item is not available.';
  if (status === 429) return 'Too many requests. Please wait a moment.';
  if (status >= 500) return 'The service is unavailable. Please retry.';
  return `Request failed (${status})`;
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(apiErrorMessage(body, response.status));
        const accessToken = body?.data?.accessToken;
        if (!accessToken) throw new Error('Session refresh failed.');
        return accessToken as string;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, explicitAccessToken = '', retry = true): Promise<T> {
  const accessToken = explicitAccessToken || accessTokenProvider?.() || '';
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers: headersFor(options, accessToken) });
  } catch {
    throw new Error(`Network request failed. Check that the backend is reachable at ${API_BASE_URL}.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && accessToken && retry) {
      try {
        const refreshedToken = await refreshAccessToken();
        const me = await request<{ user: Session['user'] }>('/auth/me', {}, refreshedToken, false);
        const session = { accessToken: refreshedToken, user: me.user };
        await sessionUpdater?.(session);
        return request<T>(path, options, refreshedToken, false);
      } catch {
        unauthorizedHandler?.();
      }
    }
    throw new Error(apiErrorMessage(body, response.status));
  }
  return body.data as T;
}

function formFrom(values: Record<string, string>) {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.append(key, value));
  return form;
}

export const api = {
  login: (email: string, password: string) => request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password }) }, '', false),
  me: (accessToken?: string) => request<{ user: Session['user'] }>('/auth/me', {}, accessToken || ''),
  listSeens: (accessToken?: string) => request<{ items: Seen[] }>('/publications/seen?page=1&limit=20&tab=seen', {}, accessToken || ''),
  getSeenEngagement: (id: string, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${id}/engagement`, {}, accessToken || ''),
  reactToSeen: (id: string, reaction: string, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${id}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction }) }, accessToken || ''),
  removeSeenReaction: (id: string, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${id}/reaction`, { method: 'DELETE', body: JSON.stringify({}) }, accessToken || ''),
  commentOnSeen: (id: string, text: string, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) }, accessToken || ''),
  toggleSeenShare: (id: string, shared: boolean, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${id}/share`, { method: shared ? 'DELETE' : 'PUT', body: JSON.stringify({}) }, accessToken || ''),
  toggleSeenSave: (id: string, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${id}/save`, { method: 'PUT', body: JSON.stringify({}) }, accessToken || ''),
  discover: (filter: string, accessToken?: string) => request<DiscoverData>(`/discover?filter=${encodeURIComponent(filter)}&limit=20`, {}, accessToken || ''),
  toggleFollow: (username: string, accessToken?: string) => request<{ relationship: { active?: boolean } }>(`/profiles/${encodeURIComponent(username)}/follow`, { method: 'PUT', body: JSON.stringify({}) }, accessToken || ''),
  listShareRecipients: (query: string, accessToken?: string) => request<{ people: ShareRecipient[] }>(`/messages/share/recipients?q=${encodeURIComponent(query.trim())}&limit=${query.trim() ? 30 : 16}`, {}, accessToken || ''),
  sendSharedSeen: (id: string, recipientIds: string[], text: string, accessToken?: string) => request<SharedContentResult>('/messages/share', { method: 'POST', body: JSON.stringify({ recipientIds, text: text.trim(), sharedContent: { contentType: 'seen', contentId: id } }) }, accessToken || ''),

  listWall: (limit = 30, accessToken?: string) => request<{ items: WallPost[] }>(`/wall?limit=${limit}`, {}, accessToken || ''),
  createWallPost: (payload: { text: string; context: string; location?: string }, accessToken?: string) => request<{ post: WallPost }>('/wall', { method: 'POST', body: formFrom({ text: payload.text, context: payload.context, location: payload.location || '', entityRefs: '[]' }) }, accessToken || ''),
  getWallComments: (id: string, shareId?: string | null, accessToken?: string) => request<{ comments: WallComment[] }>(`/wall/${id}/comments${shareId ? `?shareId=${encodeURIComponent(shareId)}` : ''}`, {}, accessToken || ''),
  reactToWall: (id: string, reaction = 'like', shareId?: string | null, accessToken?: string) => request<{ engagement: Engagement }>(`/wall/${id}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction, ...(shareId ? { shareId } : {}) }) }, accessToken || ''),
  commentOnWall: (id: string, text: string, shareId?: string | null, accessToken?: string) => request<{ engagement: Engagement }>(`/wall/${id}/comments`, { method: 'POST', body: JSON.stringify({ text, ...(shareId ? { shareId } : {}) }) }, accessToken || ''),
  toggleWallShare: (id: string, caption = '', accessToken?: string) => request<{ engagement: Engagement }>(`/wall/${id}/share`, { method: 'PUT', body: JSON.stringify({ caption }) }, accessToken || ''),
  toggleWallSave: (id: string, shareId?: string | null, accessToken?: string) => request<{ engagement: Engagement }>(`/wall/${id}/save`, { method: 'PUT', body: JSON.stringify({ ...(shareId ? { shareId } : {}) }) }, accessToken || ''),
  getSawYouToday: (accessToken?: string) => request<SawYouToday>('/wall/saw-you-today', {}, accessToken || ''),
  listWallStories: (accessToken?: string) => request<WallStoriesData>('/stories/active', {}, accessToken || ''),
  markStoryViewed: (id: string, accessToken?: string) => request<{ storyId: string; viewed: boolean }>(`/stories/${id}/views`, { method: 'POST', body: JSON.stringify({}) }, accessToken || ''),
  updateStatus: (payload: { label?: string; emoji?: string; presetKey?: string; color?: string; durationHours?: number; clear?: boolean }, accessToken?: string) => request<{ activeStatus: StoryGroup['activeStatus'] }>('/stories/status', { method: 'PATCH', body: JSON.stringify(payload) }, accessToken || ''),

  listConversations: (accessToken?: string) => request<{ conversations: Conversation[] }>('/messages/conversations', {}, accessToken || ''),
  searchMessagePeople: (query: string, accessToken?: string) => request<{ people: User[] }>(`/messages/people?q=${encodeURIComponent(query.trim())}`, {}, accessToken || ''),
  listMessages: (userId: string, options: { cursor?: string | null; directAccessWindowId?: string | null } = {}, accessToken?: string) => {
    const params = new URLSearchParams({ limit: '50' });
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.directAccessWindowId) params.set('directAccessWindowId', options.directAccessWindowId);
    return request<{ participant: User; messages: Message[]; pageInfo?: { hasMore?: boolean; nextCursor?: string | null }; conversationStatus?: string; requestReceived?: boolean; requestRequired?: boolean; directAccessWindow?: DirectAccessWindow | null; threadType?: string }>(`/messages/conversations/${userId}?${params.toString()}`, {}, accessToken || '');
  },
  sendMessage: (userId: string, body: string, clientMessageId: string, directAccessWindowId?: string | null, accessToken?: string) => request<{ message: Message; conversationStatus?: string; directAccessWindow?: DirectAccessWindow | null }>(`/messages/conversations/${userId}`, { method: 'POST', body: JSON.stringify({ body, clientMessageId, directAccessWindowId }) }, accessToken || ''),
  archiveConversation: (userId: string, archived = true, accessToken?: string) => request<{ archived?: boolean }>(`/messages/conversations/${userId}/archive`, { method: 'PUT', body: JSON.stringify({ archived }) }, accessToken || ''),
  acceptRequest: (userId: string, accessToken?: string) => request<{ status?: string }>(`/messages/requests/${userId}/accept`, { method: 'POST', body: JSON.stringify({}) }, accessToken || ''),
  declineRequest: (userId: string, accessToken?: string) => request<{ status?: string }>(`/messages/requests/${userId}`, { method: 'DELETE' }, accessToken || ''),
  listDirectAccessWindows: (accessToken?: string) => request<{ windows: DirectAccessWindow[] }>('/messages/direct-access/windows?limit=100', {}, accessToken || ''),
  getDirectAccessOffer: (creatorId: string, accessToken?: string) => request<{ enabled?: boolean; priceStars?: number; callEnabled?: boolean; callPriceStars?: number; callDurationMinutes?: number; durationHours?: number; fanMessageLimit?: number; typicalReplyHours?: number | null }>(`/messages/direct-access/offers/${creatorId}`, {}, accessToken || ''),

  getUnifiedMe: (accessToken?: string) => request<UnifiedProfile>('/profiles/me', {}, accessToken || ''),
  getOwnViewers: (accessToken?: string) => request<ProfileViewers>('/profiles/me/viewers?limit=30', {}, accessToken || ''),
  getDream: (username: string, accessToken?: string) => request<DreamData>(`/dreams/creator/${encodeURIComponent(username)}`, {}, accessToken || ''),
};
