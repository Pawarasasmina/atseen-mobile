import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { resolveMediaUrl } from '../services/api';
import { userAvatar, userName } from '../utils/format';
import type { User } from '../types';

export function Avatar({ ring = false, size = 40, user }: { ring?: boolean; size?: number; user?: User }) {
  const source = resolveMediaUrl(userAvatar(user));
  const radius = size / 2;
  const name = userName(user);
  if (source) return <Image source={{ uri: source }} style={[styles.image, { width: size, height: size, borderRadius: radius }, ring && styles.ring]} />;
  return <View style={[styles.fallback, { width: size, height: size, borderRadius: radius }, ring && styles.ring]}><Text style={[styles.initial, { fontSize: Math.max(10, size * 0.32) }]}>{name.trim()[0]?.toUpperCase() || '?'}</Text></View>;
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surface2 },
  ring: { borderWidth: 2, borderColor: colors.blue },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  initial: { color: colors.blue, fontWeight: '900' },
});
