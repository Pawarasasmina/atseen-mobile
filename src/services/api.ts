import type { Conversation, DirectAccessWindow, DiscoverData, DreamData, Engagement, ExperiencePublication, Message, ProfileViewers, SawYouToday, Seen, SeenBlock, SeenChapter, SeenMedia, Session, SharedContentResult, ShareRecipient, StoryGroup, UnifiedProfile, User, WallComment, WallPost, WallStoriesData } from '../types';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:3104/api').replace(/\/$/, '');
export const WEB_BASE_URL = (process.env.EXPO_PUBLIC_WEB_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');

export const resolveMediaUrl = (value = '') => !value || /^https?:\/\//i.test(value) ? value : `${API_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`;

import type { Dream, PageInfo, ProfileGift, ProfilePhoto } from '../types';

let accessTokenProvider: (() => string) | null = null;
let currentViewerId = '';
export const getCurrentViewerId = () => currentViewerId;
let sessionUpdater: ((session: Session | null) => void | Promise<void>) | null = null;
let unauthorizedHandler: (() => void) | null = null;
let refreshPromise: Promise<string> | null = null;
const contentViewSessionId = `rn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
type SeenPollResult = { counts: number[] | null; totalVotes: number | null; viewerChoice: number | null; resultsVisible: boolean };

export const setAccessTokenProvider = (provider: (() => string) | null, viewerId = '') => { accessTokenProvider = provider; currentViewerId = viewerId; };
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

function uploadResponse(url: string, options: RequestInit, accessToken: string, onProgress: (percent: number) => void): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || 'POST', url);
    xhr.timeout = 120000;
    Object.entries(headersFor(options, accessToken)).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.min(99, Math.round(event.loaded / event.total * 100))); };
    xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status }));
    xhr.onerror = () => reject(new Error('Upload connection failed.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out.'));
    xhr.send(options.body as FormData);
  });
}

async function request<T>(path: string, options: RequestInit = {}, explicitAccessToken = '', retry = true, onUploadProgress?: (percent: number) => void): Promise<T> {
  const accessToken = explicitAccessToken || accessTokenProvider?.() || '';
  let response: Response;
  try {
    response = onUploadProgress ? await uploadResponse(`${API_BASE_URL}${path}`, options, accessToken, onUploadProgress) : await fetch(`${API_BASE_URL}${path}`, { ...options, headers: headersFor(options, accessToken) });
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
        return request<T>(path, options, refreshedToken, false, onUploadProgress);
      } catch {
        unauthorizedHandler?.();
      }
    }
    throw new Error(apiErrorMessage(body, response.status));
  }
  onUploadProgress?.(100);
  return body.data as T;
}

function formFrom(values: Record<string, string>) {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.append(key, value));
  return form;
}

async function syncSessionUser() {
  const me = await request<{ user: Session['user'] }>('/auth/me').catch(() => null);
  const token = accessTokenProvider?.();
  if (me && token) await sessionUpdater?.({ accessToken: token, user: me.user });
}

export type ExperienceDraftPayload = {
  allowDownload?: boolean;
  category?: string;
  commentsEnabled?: boolean;
  description?: string;
  experiencePath?: string;
  kind?: 'EXPERIENCE';
  pricing?: { mode: 'FREE' | 'ONE_TIME'; presetId: string | null; starsAmount: number | null };
  statusVersion?: number;
  summary?: string;
  tags?: string[];
  title?: string;
};

export type ChapterPayload = { blocks: SeenBlock[]; isPreview: boolean; releaseMode: 'IMMEDIATE'; statusVersion: number; title: string };
export type PickedUpload = { uri: string; name?: string; type?: string };

function uploadForm(file: PickedUpload, fields: Record<string, string | number | boolean | undefined | null>, fieldName = 'file') {
  const body = new FormData();
  const name = file.name || file.uri.split('/').pop() || 'upload.jpg';
  const type = file.type || (/\.(mp4|m4v)$/i.test(name) ? 'video/mp4' : /\.(mov)$/i.test(name) ? 'video/quicktime' : /\.(webm)$/i.test(name) ? 'video/webm' : /\.(m4a)$/i.test(name) ? 'audio/mp4' : /\.(ogg)$/i.test(name) ? 'audio/ogg' : /\.(wav)$/i.test(name) ? 'audio/wav' : /\.(png)$/i.test(name) ? 'image/png' : /\.(webp)$/i.test(name) ? 'image/webp' : 'image/jpeg');
  body.append(fieldName, { uri: file.uri, name, type } as unknown as Blob);
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) body.append(key, String(value));
  });
  return body;
}

export const api = {
  searchDefaults: () => request<import('./searchTypes').SearchDefaults>('/search/defaults'),
  search: (q: string, type: import('./searchTypes').SearchType = 'all', cursor = '') => request<import('./searchTypes').SearchResults>(`/search?q=${encodeURIComponent(q)}&type=${type}&limit=18&sort=relevant${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  updateProfileStatus: async (payload: { status?: string | null; clear?: boolean }) => {
    const result = await request<{ activeStatus: UnifiedProfile['profile']['activeStatus'] }>('/profiles/me/status', { method: 'PATCH', body: JSON.stringify(payload) });
    await syncSessionUser();
    return result;
  },
  getFeedPost: (id: string) => request<{ post: WallPost }>(`/posts/${encodeURIComponent(id)}`),
  reactToFeedPost: (id: string, reaction: string) => request<{ post: WallPost }>(`/posts/${encodeURIComponent(id)}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction }) }),
  saveFeedPost: (id: string) => request<{ post: WallPost }>(`/posts/${encodeURIComponent(id)}/save`, { method: 'PUT' }),
  shareFeedPost: (id: string) => request<{ post: WallPost }>(`/posts/${encodeURIComponent(id)}/share`, { method: 'PUT', body: JSON.stringify({ caption: '' }) }),
  commentOnFeedPost: (id: string, text: string) => request<{ post: WallPost }>(`/posts/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
  voiceCommentOnFeedPost: (id: string, uri: string, waveform: number[], text = '') => {
    const body = uploadForm({ uri, name: 'wall-comment.m4a', type: 'audio/mp4' }, { text, waveform: JSON.stringify(waveform) }, 'voice');
    return request<{ post: WallPost }>(`/posts/${encodeURIComponent(id)}/comments`, { method: 'POST', body });
  },
  editFeedPost: (post: WallPost, text: string) => request<{ post: WallPost }>(`/posts/${encodeURIComponent(post.originalPostId || post.id)}`, { method: 'PUT', body: JSON.stringify({ text, context: post.context || '', location: post.location || '', entityRefs: post.entityRefs || [] }) }),
  getArchivedFeedPosts: (page = 1) => request<{ items: WallPost[]; pagination: PageInfo }>(`/posts/mine?status=archived&page=${page}&limit=30`),
  archiveFeedPost: (id: string) => request<unknown>(`/posts/${encodeURIComponent(id)}/archive`, { method: 'POST' }),
  getProfileConnections: (type: string, page = 1) => request<{ accounts: User[]; pagination: PageInfo }>(`/profiles/me/connections?type=${encodeURIComponent(type)}&page=${page}&limit=30`),
  getProfileMedia: () => request<{ media: ProfilePhoto[] }>('/profiles/me/media?limit=100'),
  uploadProfileMedia: (file: PickedUpload, onProgress?: (percent: number) => void) => request<{ media: ProfilePhoto }>('/profiles/me/media', { method: 'POST', body: uploadForm(file, {}, 'media') }, '', true, onProgress),
  updateProfile: async (payload: { displayName: string; username: string; bio: string; email?: string; city?: string; country?: string; preferredLanguage?: string; phoneNumber?: string; whatsapp?: string; socialLinks?: { platform: string; url: string }[] }) => {
    const result = await request<unknown>('/profile/me', { method: 'PATCH', body: JSON.stringify(payload) });
    await syncSessionUser();
    return result;
  },
  getEditProfile: () => request<{ account: { email: string }; profile: { displayName: string; username: string; profilePhoto?: string; bio?: string; city?: string; country?: string; preferredLanguage?: string; phoneNumber?: string; whatsapp?: string; socialLinks?: { platform: string; url: string }[] } }>('/profile/me'),
  getSettingsAccounts: (kind: 'blocked' | 'muted') => request<{ items: { id: string; displayName: string; username: string; profilePhoto?: string }[] }>(`/settings/${kind}-accounts`),
  removeSettingsAccount: (kind: 'blocked' | 'muted', id: string) => request<unknown>(`/settings/${kind}-accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateAccountLanguage: (preferredLanguage: string) => request<unknown>('/settings/account', { method: 'PATCH', body: JSON.stringify({ preferredLanguage }) }),
  logout: () => request<unknown>('/auth/logout', { method: 'POST' }),
  requestAccountDeletion: () => request<unknown>('/auth/account', { method: 'DELETE' }),
  getPrivacy: () => request<{ privacySettings: Record<string, string | boolean> }>('/settings/privacy'),
  updatePrivacy: (privacySettings: Record<string, string | boolean>) => request<unknown>('/settings/privacy', { method: 'PATCH', body: JSON.stringify({ privacySettings }) }),
  uploadAvatar: async (file: PickedUpload) => { const result = await request<unknown>('/profile/me/avatar', { method: 'POST', body: uploadForm(file, {}, 'avatar') }); await syncSessionUser(); return result; },
  getNotificationSettings: () => request<{ notificationPreferences: Record<string, boolean> }>('/settings/notifications'),
  updateNotificationSettings: (notificationPreferences: Record<string, boolean>) => request<unknown>('/settings/notifications', { method: 'PATCH', body: JSON.stringify({ notificationPreferences }) }),
  getGiftSettings: () => request<{ gifts: { id: string; name: string; enabled: boolean }[] }>('/settings/gifts'),
  updateGiftSettings: (enabledGiftIds: string[]) => request<unknown>('/settings/gifts', { method: 'PUT', body: JSON.stringify({ enabledGiftIds }) }),
  getReceivedGifts: () => request<{ gifts: ProfileGift[]; total: number }>('/profiles/me/gifts?limit=100'),
  updateGift: (id: string, payload: { hiddenFromProfile?: boolean; featuredOnProfile?: boolean }) => request<unknown>(`/profiles/me/gifts/${encodeURIComponent(id)}/profile-state`, { method: 'PATCH', body: JSON.stringify(payload) }),
  thankGift: (id: string) => request<unknown>(`/profiles/me/gifts/${encodeURIComponent(id)}/thank`, { method: 'POST' }),
  getProfileExperiences: (username: string) => request<{ items: ExperiencePublication[] }>(`/profiles/${encodeURIComponent(username)}/experiences`),
  listOwnPublications: (kind: string, status = '', page = 1) => request<{ items: ExperiencePublication[]; pagination: PageInfo }>(`/publications/mine?kind=${encodeURIComponent(kind)}${status ? `&status=${encodeURIComponent(status)}` : ''}&page=${page}&limit=30`),
  getSavedPosts: (page = 1) => request<{ items: { id: string; type: string; item: Seen | WallPost }[]; pagination: PageInfo }>(`/saved/posts?page=${page}&limit=30`),
  getUnlockedExperiences: (page = 1) => request<{ items: ExperiencePublication[]; pagination: PageInfo }>(`/saved/experiences?page=${page}&limit=30`),
  saveDream: (payload: Partial<Dream>) => request<{ dream: Dream }>('/dreams/mine', { method: 'PUT', body: JSON.stringify(payload) }),
  completeDream: (id: string, version?: number) => request<{ dream: Dream }>(`/dreams/mine/${id}/complete`, { method: 'POST', body: JSON.stringify({ version }) }),
  removeDream: (id: string, version?: number) => request<unknown>(`/dreams/mine/${id}`, { method: 'DELETE', body: JSON.stringify({ version }) }),
  getWorldManagement: (id: string) => request<{ publication: ExperiencePublication; management: { seatStatus: { capacity: number | null; occupiedSeats: number; unlimited: boolean }; subscription: { priceStars: number | null } } }>(`/publications/mine/${id}/world-management`),
  updateDirectAccess: (payload: { enabled: boolean; priceStars: number; callEnabled: boolean; callPriceStars: number; callDurationMinutes: number; callAutoDeclineAway: boolean }) => request<unknown>('/messages/direct-access/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  login: (email: string, password: string) => request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password }) }, '', false),
  me: (accessToken?: string) => request<{ user: Session['user'] }>('/auth/me', {}, accessToken || ''),
  listSeens: (accessToken?: string, tab: 'seen' | 'friends' = 'seen', page = 1) => request<{ items: Seen[]; pagination?: PageInfo }>(`/publications/seen?page=${page}&limit=20&tab=${tab}`, {}, accessToken || ''),
  hideSeen: (id: string, accessToken?: string) => request<unknown>(`/publications/${encodeURIComponent(id)}/hide`, { method: 'POST', body: JSON.stringify({ reason: 'NOT_INTERESTED' }) }, accessToken || ''),
  blockSeenCreator: (id: string, accessToken?: string) => request<unknown>(`/publications/${encodeURIComponent(id)}/block-creator`, { method: 'PUT' }, accessToken || ''),
  pinSeen: (id: string, pinned: boolean, statusVersion: number, accessToken?: string) => request<{ publication: ExperiencePublication }>(`/publications/mine/${encodeURIComponent(id)}/pin`, { method: 'PUT', body: JSON.stringify({ pinned, statusVersion }) }, accessToken || ''),
  archiveSeen: (id: string, statusVersion: number, accessToken?: string) => request<{ publication: ExperiencePublication }>(`/publications/mine/${encodeURIComponent(id)}/archive`, { method: 'POST', body: JSON.stringify({ statusVersion }) }, accessToken || ''),
  deleteSeen: (id: string, statusVersion: number, accessToken?: string) => request<{ id: string }>(`/publications/mine/${encodeURIComponent(id)}/seen`, { method: 'DELETE', body: JSON.stringify({ statusVersion }) }, accessToken || ''),
  shareSeenAsStory: (id: string, accessToken?: string) => request<unknown>(`/stories/share/seen/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ audience: 'everyone' }) }, accessToken || ''),
  getSeenInsights: (id: string, accessToken?: string) => request<{ insights: { totalViews?: number; todayViews?: number; readToEndPercent?: number | null; reactions?: number; comments?: number; saves?: number; shares?: number; dailyViews?: { _id?: string; date?: string; value?: number }[]; trafficSources?: { source: string; percent: number }[] } }>(`/publications/mine/${encodeURIComponent(id)}/insights`, {}, accessToken || ''),
  listSeenSeries: (accessToken?: string) => request<{ items: { id: string; name: string }[] }>('/publications/series', {}, accessToken || ''),
  createSeenSeries: (name: string, accessToken?: string) => request<{ series: { id: string; name: string } }>('/publications/series', { method: 'POST', body: JSON.stringify({ name }) }, accessToken || ''),
  addSeenToSeries: (seriesId: string, id: string, accessToken?: string) => request<{ publication: ExperiencePublication }>(`/publications/series/${encodeURIComponent(seriesId)}/seens/${encodeURIComponent(id)}`, { method: 'POST' }, accessToken || ''),
  removeSeenFromSeries: (seriesId: string, id: string, accessToken?: string) => request<{ publication: ExperiencePublication }>(`/publications/series/${encodeURIComponent(seriesId)}/seens/${encodeURIComponent(id)}`, { method: 'DELETE' }, accessToken || ''),
  getSeenActivity: (accessToken?: string) => request<{ items: { id: string; title?: string; description?: string; preview?: string; createdAt?: string; target?: { type?: string; id?: string } }[] }>('/fan/activity?limit=30', {}, accessToken || ''),
  getSeen: (id: string, accessToken?: string) => request<{ publication: Seen }>(`/publications/${encodeURIComponent(id)}`, {}, accessToken || ''),
  trackContentView: (id: string, accessToken?: string) => request<{ recorded?: boolean }>('/analytics/events', { method: 'POST', body: JSON.stringify({ entityId: id, entityType: 'seen', eventType: 'CONTENT_VIEW', source: 'seen', sessionId: contentViewSessionId }) }, accessToken || '').catch(() => ({ recorded: false })),
  getSeenPoll: (id: string, chapterId: string, blockId: string, accessToken?: string) => request<SeenPollResult>(`/publications/${encodeURIComponent(id)}/chapters/${encodeURIComponent(chapterId)}/polls/${encodeURIComponent(blockId)}`, {}, accessToken || ''),
  voteSeenPoll: (id: string, chapterId: string, blockId: string, optionIndex: number, accessToken?: string) => request<SeenPollResult>(`/publications/${encodeURIComponent(id)}/chapters/${encodeURIComponent(chapterId)}/polls/${encodeURIComponent(blockId)}`, { method: 'PUT', body: JSON.stringify({ optionIndex }) }, accessToken || ''),
  reportSeen: (id: string, reason: string, accessToken?: string) => request<unknown>(`/publications/${encodeURIComponent(id)}/report`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken || ''),
  getSeenEngagement: (id: string, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${id}/engagement`, {}, accessToken || ''),
  reactToSeen: (id: string, reaction: string, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${id}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction }) }, accessToken || ''),
  removeSeenReaction: (id: string, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${id}/reaction`, { method: 'DELETE', body: JSON.stringify({}) }, accessToken || ''),
  commentOnSeen: (id: string, text: string, accessToken?: string, parentCommentId?: string) => request<{ engagement: Engagement }>(`/publications/${id}/comments`, { method: 'POST', body: JSON.stringify({ text, parentCommentId: parentCommentId || undefined }) }, accessToken || ''),
  reactToSeenComment: (id: string, commentId: string, reacted: boolean, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/reaction`, { method: reacted ? 'DELETE' : 'PUT', body: JSON.stringify(reacted ? {} : { reaction: 'LOVE' }) }, accessToken || ''),
  voiceCommentOnSeen: (id: string, uri: string, text: string, waveform: number[], accessToken?: string, parentCommentId?: string) => {
    const body = new FormData();
    body.append('voice', { uri, name: 'voice-comment.m4a', type: 'audio/mp4' } as unknown as Blob);
    if (text.trim()) body.append('text', text.trim());
    if (parentCommentId) body.append('parentCommentId', parentCommentId);
    body.append('waveform', JSON.stringify(waveform));
    return request<{ engagement: Engagement }>(`/publications/${encodeURIComponent(id)}/comments`, { method: 'POST', body }, accessToken || '');
  },
  toggleSeenShare: (id: string, shared: boolean, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${id}/share`, { method: shared ? 'DELETE' : 'PUT', body: JSON.stringify({}) }, accessToken || ''),
  toggleSeenSave: (id: string, accessToken?: string) => request<{ engagement: Engagement }>(`/publications/${id}/save`, { method: 'PUT', body: JSON.stringify({}) }, accessToken || ''),
  discover: (filter: string, accessToken?: string) => request<DiscoverData>(`/discover?filter=${encodeURIComponent(filter)}&limit=20`, {}, accessToken || ''),
  toggleFollow: (username: string, accessToken?: string) => request<{ relationship: { active?: boolean } }>(`/profiles/${encodeURIComponent(username)}/follow`, { method: 'PUT', body: JSON.stringify({}) }, accessToken || ''),
  listShareRecipients: (query: string, accessToken?: string) => request<{ people: ShareRecipient[] }>(`/messages/share/recipients?q=${encodeURIComponent(query.trim())}&limit=${query.trim() ? 30 : 16}`, {}, accessToken || ''),
  sendSharedProfile: (id: string, recipientIds: string[], text: string, accessToken?: string) => request<SharedContentResult>('/messages/share', { method: 'POST', body: JSON.stringify({ recipientIds, text: text.trim(), sharedContent: { contentType: 'profile', contentId: id } }) }, accessToken || ''),
  sendSharedSeen: (id: string, recipientIds: string[], text: string, accessToken?: string) => request<SharedContentResult>('/messages/share', { method: 'POST', body: JSON.stringify({ recipientIds, text: text.trim(), sharedContent: { contentType: 'seen', contentId: id } }) }, accessToken || ''),

  listWall: (limit = 30, accessToken?: string) => request<{ items: WallPost[] }>(`/wall?limit=${limit}`, {}, accessToken || ''),
  listWallFeed: (query: string, accessToken?: string) => request<{ items: WallPost[]; pagination: PageInfo }>(`/posts?${query}`, {}, accessToken || ''),
  publishWallNote: (body: FormData, key: string, accessToken?: string) => request<{ post: WallPost }>('/posts', { method: 'POST', body, headers: { 'Idempotency-Key': key } }, accessToken || ''),
  getWallView: () => request<{ view: 'feed' | 'grid' }>('/users/me/wall-view'),
  setWallView: (view: 'feed' | 'grid') => request<{ view: 'feed' | 'grid' }>('/users/me/wall-view', { method: 'PATCH', body: JSON.stringify({ view }) }),
  wallPostAction: (id: string, action: 'hide' | 'report' | 'block-author' | 'archive' | 'delete' | 'bump' | 'resolution', payload = {}) => request<{ post?: WallPost }>(`/posts/${encodeURIComponent(id)}${action === 'delete' ? '' : `/${action}`}`, { method: action === 'delete' ? 'DELETE' : ['block-author', 'resolution'].includes(action) ? 'PUT' : 'POST', body: JSON.stringify(payload) }),
  markWallViewed: (id: string) => request<{ viewCount: number }>(`/posts/${encodeURIComponent(id)}/views`, { method: 'POST', body: JSON.stringify({ sessionId: contentViewSessionId }) }),
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
  transcribeVoiceNote: (file: PickedUpload, accessToken?: string) => request<{ confidence?: number; emptySpeech?: boolean; language?: string; provider?: string; transcript?: string }>('/voice/transcribe', { method: 'POST', body: uploadForm(file, {}, 'audio') }, accessToken || ''),

  listConversations: (accessToken?: string) => request<{ conversations: Conversation[] }>('/messages/conversations', {}, accessToken || ''),
  searchMessagePeople: (query: string, accessToken?: string) => request<{ people: User[] }>(`/messages/people?q=${encodeURIComponent(query.trim())}`, {}, accessToken || ''),
  listMessages: (userId: string, options: { cursor?: string | null; directAccessWindowId?: string | null } = {}, accessToken?: string) => {
    const params = new URLSearchParams({ limit: '50' });
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.directAccessWindowId) params.set('directAccessWindowId', options.directAccessWindowId);
    return request<{ participant: User; messages: Message[]; pageInfo?: { hasMore?: boolean; nextCursor?: string | null }; conversationStatus?: string; requestReceived?: boolean; requestRequired?: boolean; directAccessWindow?: DirectAccessWindow | null; threadType?: string }>(`/messages/conversations/${userId}?${params.toString()}`, {}, accessToken || '');
  },
  sendMessage: (userId: string, body: string, clientMessageId: string, directAccessWindowId?: string | null, accessToken?: string) => request<{ message: Message; conversationStatus?: string; directAccessWindow?: DirectAccessWindow | null }>(`/messages/conversations/${userId}`, { method: 'POST', body: JSON.stringify({ body, clientMessageId, directAccessWindowId }) }, accessToken || ''),
  sendVoiceMessage: (userId: string, file: PickedUpload, fields: { clientMessageId: string; directAccessWindowId?: string | null; waveform?: number[] }, accessToken?: string) => request<{ message: Message; conversationStatus?: string; directAccessWindow?: DirectAccessWindow | null }>(`/messages/conversations/${userId}/voice`, { method: 'POST', body: uploadForm(file, { clientMessageId: fields.clientMessageId, directAccessWindowId: fields.directAccessWindowId || undefined, waveform: JSON.stringify(fields.waveform || []) }, 'voice') }, accessToken || ''),
  sendVideoNote: (userId: string, file: PickedUpload, fields: { clientMessageId: string; directAccessWindowId?: string | null }, accessToken?: string) => request<{ message: Message; conversationStatus?: string; directAccessWindow?: DirectAccessWindow | null }>(`/messages/conversations/${userId}/video-note`, { method: 'POST', body: uploadForm(file, { clientMessageId: fields.clientMessageId, directAccessWindowId: fields.directAccessWindowId || undefined }, 'video') }, accessToken || ''),
  archiveConversation: (userId: string, archived = true, accessToken?: string) => request<{ archived?: boolean }>(`/messages/conversations/${userId}/archive`, { method: 'PUT', body: JSON.stringify({ archived }) }, accessToken || ''),
  acceptRequest: (userId: string, accessToken?: string) => request<{ status?: string }>(`/messages/requests/${userId}/accept`, { method: 'POST', body: JSON.stringify({}) }, accessToken || ''),
  declineRequest: (userId: string, accessToken?: string) => request<{ status?: string }>(`/messages/requests/${userId}`, { method: 'DELETE' }, accessToken || ''),
  listDirectAccessWindows: (accessToken?: string) => request<{ windows: DirectAccessWindow[] }>('/messages/direct-access/windows?limit=100', {}, accessToken || ''),
  getDirectAccessOffer: (creatorId: string, accessToken?: string) => request<{ enabled?: boolean; priceStars?: number; callEnabled?: boolean; callPriceStars?: number; callDurationMinutes?: number; callAutoDeclineAway?: boolean; durationHours?: number; fanMessageLimit?: number; typicalReplyHours?: number | null }>(`/messages/direct-access/offers/${creatorId}`, {}, accessToken || ''),

  getUnifiedMe: (accessToken?: string) => request<UnifiedProfile>('/profiles/me', {}, accessToken || ''),
  getOwnViewers: (accessToken?: string) => request<ProfileViewers>('/profiles/me/viewers?limit=30', {}, accessToken || ''),
  getDream: (username: string, accessToken?: string) => request<DreamData>(`/dreams/creator/${encodeURIComponent(username)}`, {}, accessToken || ''),
  listMyExperienceDrafts: (accessToken?: string) => request<{ items: ExperiencePublication[] }>('/publications/mine?kind=EXPERIENCE&status=DRAFT&limit=5', {}, accessToken || ''),
  getMyPublication: (id: string, accessToken?: string) => request<{ publication: ExperiencePublication }>(`/publications/mine/${encodeURIComponent(id)}`, {}, accessToken || ''),
  createExperienceDraft: (payload: ExperienceDraftPayload, accessToken?: string) => request<{ publication: ExperiencePublication }>('/publications/drafts', { method: 'POST', body: JSON.stringify({ ...payload, kind: 'EXPERIENCE' }) }, accessToken || ''),
  updateExperienceDraft: (id: string, payload: ExperienceDraftPayload, accessToken?: string) => request<{ publication: ExperiencePublication }>(`/publications/mine/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }, accessToken || ''),
  addExperienceChapter: (id: string, payload: ChapterPayload, accessToken?: string) => request<SeenChapter>(`/publications/mine/${encodeURIComponent(id)}/chapters`, { method: 'POST', body: JSON.stringify(payload) }, accessToken || ''),
  updateExperienceChapter: (id: string, chapterId: string, payload: ChapterPayload, accessToken?: string) => request<SeenChapter>(`/publications/mine/${encodeURIComponent(id)}/chapters/${encodeURIComponent(chapterId)}`, { method: 'PUT', body: JSON.stringify(payload) }, accessToken || ''),
  deleteExperienceChapter: (id: string, chapterId: string, statusVersion: number, accessToken?: string) => request<{ publication?: ExperiencePublication }>(`/publications/mine/${encodeURIComponent(id)}/chapters/${encodeURIComponent(chapterId)}`, { method: 'DELETE', body: JSON.stringify({ statusVersion }) }, accessToken || ''),
  uploadExperienceMedia: (id: string, file: PickedUpload, fields: Record<string, string | number | boolean | undefined | null>, accessToken?: string) => request<SeenMedia & { publication?: ExperiencePublication; assetId?: string }>(`/publications/mine/${encodeURIComponent(id)}/media-upload`, { method: 'POST', body: uploadForm(file, fields) }, accessToken || ''),
  submitExperience: (id: string, statusVersion: number, accessToken?: string) => request<{ publication: ExperiencePublication }>(`/publications/mine/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify({ statusVersion }) }, accessToken || ''),
};
