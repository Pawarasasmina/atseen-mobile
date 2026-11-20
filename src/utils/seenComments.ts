import type { SeenComment, User } from '../types';
export const commentEmojis = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];
export const appendCommentEmoji = (text: string, emoji: string) => text.length + emoji.length <= 500 ? text + emoji : text;
export function commentRows(comments: SeenComment[]) {
  const rows: { comment: SeenComment; nested: boolean; parentAuthor?: User }[] = [];
  const visited = new Set<string>();
  const add = (items: SeenComment[], parentAuthor?: User) => items.forEach((comment) => {
    if (visited.has(String(comment.id))) return;
    visited.add(String(comment.id)); rows.push({ comment, nested: Boolean(parentAuthor), parentAuthor });
    add(comment.replies || [], comment.author || {});
  });
  add(comments); return rows;
}
