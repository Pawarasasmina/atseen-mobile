import type { ShareRecipient } from '../types';
export function toggleShareRecipient(selected: ShareRecipient[], person: ShareRecipient) {
  return selected.some((entry) => entry.id === person.id) ? selected.filter((entry) => entry.id !== person.id) : selected.length < 10 ? [...selected, person] : selected;
}
export function remainingShareRecipients(selected: ShareRecipient[], sent: { recipientId: string }[]) {
  const delivered = new Set(sent.map((entry) => String(entry.recipientId)));
  return selected.filter((person) => !delivered.has(String(person.id)));
}
