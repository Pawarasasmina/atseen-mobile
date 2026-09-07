import * as SecureStore from 'expo-secure-store';
import type { Session } from '../types';

const KEY = 'onlyme_mobile_session';
export const authStorage = {
  async read(): Promise<Session | null> { const value = await SecureStore.getItemAsync(KEY); if (!value) return null; try { return JSON.parse(value) as Session; } catch { await SecureStore.deleteItemAsync(KEY); return null; } },
  write: (session: Session) => SecureStore.setItemAsync(KEY, JSON.stringify(session)),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
