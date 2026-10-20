export type User = {
  id?: string;
  _id?: string;
  name?: string;
  displayName?: string;
  username?: string;
  avatar?: string;
  avatarUrl?: string | null;
  email?: string;
  role?: string;
  accountRole?: string;
  creatorApprovalStatus?: string | null;
  isCreator?: boolean;
  isVerified?: boolean;
  verified?: boolean;
  lastSeenAt?: string | null;
  activeStatus?: ActiveStatus | null;
};

export type ActiveStatus = {
  emoji?: string;
  label?: string;
  color?: string;
  presetKey?: string;
  startedAt?: string | null;
  expiresAt?: string | null;
};

export type Session = { accessToken: string; user: User };

export type SeenComment = { id: string; text: string; createdAt?: string; author?: User; viewerSaved?: boolean };
export type Engagement = { reactionCount?: number; reactionBreakdown?: Record<string, number>; topReactions?: string[]; commentCount?: number; shareCount?: number; saveCount?: number; viewCount?: number; viewerReaction?: string | null; viewerShared?: boolean; viewerSaved?: boolean; comments?: SeenComment[] };
export type SeenMedia = { assetId?: string; secureUrl?: string; url?: string; mediaType?: string; resourceType?: string; duration?: number; width?: number; height?: number };
export type SeenBlock = { id?: string; type?: string; order?: number; text?: string; url?: string; label?: string; media?: SeenMedia; metadata?: Record<string, unknown> };
export type SeenChapter = { stableChapterId?: string; id?: string; order?: number; title?: string; isPreview?: boolean; locked?: boolean; blocks?: SeenBlock[] };
export type Seen = { id?: string; _id?: string; kind?: string; title?: string; summary?: string; description?: string; category?: string; publishedAt?: string; coverMedia?: SeenMedia; introMedia?: SeenMedia; creator?: User & { verified?: boolean; location?: string }; chapters?: SeenChapter[]; engagement?: Engagement; nextSeen?: Seen | null };
export type ExperiencePublication = Seen & {
  chapterCount?: number;
  updatedAt?: string;
  createdAt?: string;
  visibility?: string;
  isPinned?: boolean;
  seriesId?: string | null;
  series?: { id?: string; name?: string } | null;
  residentCount?: number;
  worldSeatCapacity?: number | null;
  planet?: { emoji?: string; faceEmoji?: string; name?: string; priceStars?: number };
  allowDownload?: boolean;
  experiencePath?: string;
  ownerCount?: number;
  pricing?: { mode?: 'FREE' | 'ONE_TIME' | string; presetId?: string | null; starsAmount?: number | null };
  status?: string;
  statusVersion?: number;
  draftVersion?: number;
};

export type DiscoverPerson = User & { displayName?: string; coverImage?: string; cover?: string; category?: string; city?: string; country?: string; isVerified?: boolean; isFollowing?: boolean; following?: boolean; recommendationReason?: string; media?: { url?: string }; reason?: { detail?: string }; creator?: User & { cover?: string; verified?: boolean; category?: string }; storyAvailable?: boolean };
export type DiscoverData = { recommendations: DiscoverPerson[]; following: DiscoverPerson[]; friends: DiscoverPerson[]; filters: { id: string; label: string }[]; pagination?: { nextCursor?: string | null; hasMore?: boolean } };

export type ShareRecipient = User & { id: string; displayName?: string; avatarUrl?: string; isVerified?: boolean; reason?: string };
export type SharedContentResult = { sent?: { recipientId: string }[]; failed?: { recipientId: string; message: string }[] };

export type WallMedia = { _id?: string; id?: string; assetId?: string; url?: string; secureUrl?: string; mediaType?: string; type?: string };
export type WallPost = {
  archived?: boolean;
  author?: User;
  entityRefs?: { entityId: string; entityType: string }[];
  supportCount?: number;
  reactions?: { reaction: string; count: number }[];
  comments?: WallComment[];
  id: string;
  originalPostId?: string;
  shareId?: string | null;
  text: string;
  shareCaption?: string;
  context?: string;
  location?: string;
  media?: WallMedia[];
  createdAt?: string;
  feedCreatedAt?: string;
  sharedBy?: User | null;
  creator?: User & { verified?: boolean };
  reactionCount?: number;
  reactionBreakdown?: Record<string, number>;
  topReactions?: string[];
  viewerReaction?: string | null;
  viewerReacted?: boolean;
  commentCount?: number;
  shareCount?: number;
  saveCount?: number;
  viewCount?: number;
  viewerShared?: boolean;
  viewerSaved?: boolean;
};

export type WallComment = { id: string; text: string; createdAt?: string; author?: User };
export type StoryGroup = {
  user: User;
  stories?: { id: string; mediaUrl?: string; thumbnailUrl?: string; mediaType?: string; type?: string; caption?: string; viewed?: boolean; createdAt?: string }[];
  activeStatus?: ActiveStatus | null;
  hasUnseenStories?: boolean;
  storyCount?: number;
  presence?: { isOnline?: boolean; lastActiveAt?: string | null };
};
export type WallStoriesData = { viewer?: User & StoryGroup; items: StoryGroup[] };
export type SawYouToday = { count: number; hasUnseen?: boolean; unseenCount?: number; people?: User[] };

export type Message = {
  id: string;
  clientMessageId?: string | null;
  senderId?: string;
  recipientId?: string;
  body?: string;
  mediaType?: string;
  messageKind?: string;
  messageChannel?: string;
  directAccessWindowId?: string | null;
  image?: { url?: string; width?: number; height?: number } | null;
  audio?: { url?: string; duration?: number; waveform?: number[] } | null;
  video?: { url?: string; duration?: number; width?: number; height?: number } | null;
  gift?: { name?: string; stars?: number; imageUrl?: string } | null;
  sharedContent?: { contentType?: string; title?: string; previewText?: string; imageUrl?: string; author?: User | null } | null;
  readAt?: string | null;
  createdAt?: string;
  locked?: boolean;
};

export type Conversation = {
  id: string;
  participant: User;
  lastMessage?: Message;
  unreadCount?: number;
  status?: 'ACTIVE' | 'REQUEST' | 'DECLINED' | string;
  archived?: boolean;
  muted?: boolean;
  requestReceived?: boolean;
  directAccessWindow?: DirectAccessWindow | null;
};

export type DirectAccessWindow = {
  id: string;
  fanId: string;
  creatorId: string;
  fan?: User | null;
  creator?: User | null;
  status?: string;
  settlementStatus?: string;
  source?: string;
  priceStars?: number;
  creatorNetStars?: number;
  creatorNetUsd?: number;
  fanMessageLimit?: number;
  fanMessagesUsed?: number;
  messagesRemaining?: number;
  openedAt?: string;
  expiresAt?: string;
  answeredAt?: string | null;
  refundedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  questionQuote?: string;
};

export type ProfilePhoto = { id?: string; mediaUrl?: string; url?: string; thumbnailUrl?: string; mediaType?: string; type?: string; duration?: number; caption?: string; createdAt?: string | null };
export type ProfileGift = { id: string; name?: string; imageUrl?: string; stars?: number; source?: string; visibility?: string; fresh?: boolean; hiddenFromProfile?: boolean; featuredOnProfile?: boolean; thankedAt?: string | null; createdAt?: string; sender?: User };
export type ProfileSeries = { id: string; name: string; coverMedia?: SeenMedia; seenCount?: number; previewSeens?: Seen[]; isPinned?: boolean };
export type PageInfo = { page: number; limit: number; total: number; pages?: number; hasMore?: boolean };
export type UnifiedProfile = {
  profile: User & {
    ownerUserId?: string;
    displayName?: string;
    cover?: string;
    bio?: string;
    socialLinks?: { platform: string; url: string }[];
    categories?: string[];
    location?: string;
    verified?: boolean;
    isCreator?: boolean;
    directAccess?: { enabled?: boolean; priceStars?: number; durationHours?: number; messageLimit?: number; callEnabled?: boolean; callPriceStars?: number; callDurationMinutes?: number };
    creatorApprovalStatus?: string | null;
    creatorApplicationStatus?: string | null;
  };
  publicMetrics?: { publishedContentCount?: number; followerCount?: number; followingCount?: number; seenByCount?: number; supporterCount?: number };
  media?: ProfilePhoto[];
  series?: ProfileSeries[];
  photos?: ProfilePhoto[];
  wallPosts?: WallPost[];
  sharedWallPosts?: WallPost[];
  seens?: Seen[];
  sharedSeens?: Seen[];
  planets?: Seen[];
  experiences?: ExperiencePublication[];
  publicContent?: { id?: string; title?: string; description?: string; media?: { secureUrl?: string }[] }[];
  viewerCapabilities?: Record<string, boolean>;
};

export type ProfileViewers = { seenTodayCount?: number; worldVisitorCount?: number; signals?: { id: string; createdAt?: string; description?: string; actor?: User }[] };
export type Dream = { id?: string; emoji?: string; title?: string; reason?: string; goalStars?: number; receivedStars?: number; supporterCount?: number; cameTrueCount?: number; status?: string; version?: number };
export type DreamData = { dream?: Dream | null; gifts?: { id: string; name?: string; stars?: number; imageUrl?: string }[] };

export type MainTab = 'seen' | 'discover' | 'wall' | 'messages' | 'profile';
export type CreateTarget = 'seen' | 'experience' | 'story' | 'note' | 'world';
