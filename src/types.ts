export type User = { id?: string; _id?: string; name?: string; username?: string; avatar?: string; email?: string };
export type Session = { accessToken: string; user: User };
export type SeenComment = { id: string; text: string; createdAt?: string; author?: User; viewerSaved?: boolean };
export type Engagement = { reactionCount?: number; reactionBreakdown?: Record<string, number>; topReactions?: string[]; commentCount?: number; shareCount?: number; saveCount?: number; viewCount?: number; viewerReaction?: string | null; viewerShared?: boolean; viewerSaved?: boolean; comments?: SeenComment[] };
export type Seen = { id?: string; _id?: string; title?: string; summary?: string; description?: string; coverMedia?: { secureUrl?: string; mediaType?: string }; creator?: User & { verified?: boolean; location?: string }; chapters?: unknown[]; engagement?: Engagement };
