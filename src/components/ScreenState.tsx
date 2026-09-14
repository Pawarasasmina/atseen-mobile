import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export function ScreenState({ action = 'Retry', icon = 'alert-circle-outline', loading = false, message, onPress, title }: { action?: string; icon?: keyof typeof Ionicons.glyphMap; loading?: boolean; message?: string; onPress?: () => void; title: string }) {
  return <View style={styles.wrap}>{loading ? <ActivityIndicator color={colors.blue} /> : <Ionicons name={icon} color={colors.blue} size={34} />}<Text style={styles.title}>{title}</Text>{message ? <Text style={styles.message}>{message}</Text> : null}{onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}><Text style={styles.buttonText}>{action}</Text></Pressable> : null}</View>;
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return <View style={styles.skeletonWrap}>{Array.from({ length: count }).map((_, index) => <View key={index} style={styles.skeletonRow}><View style={styles.skeletonAvatar} /><View style={styles.skeletonCopy}><View style={styles.skeletonLineWide} /><View style={styles.skeletonLine} /></View></View>)}</View>;
}

const styles = StyleSheet.create({
  wrap: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 28 },
  title: { color: colors.text, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  message: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  button: { marginTop: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 99, backgroundColor: colors.surface2 },
  buttonText: { color: colors.blue, fontWeight: '800', fontSize: 12 },
  skeletonWrap: { paddingHorizontal: 18, paddingTop: 12, gap: 14 },
  skeletonRow: { minHeight: 62, flexDirection: 'row', gap: 11, alignItems: 'center' },
  skeletonAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.07)' },
  skeletonCopy: { flex: 1, gap: 8 },
  skeletonLineWide: { width: '72%', height: 11, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)' },
  skeletonLine: { width: '46%', height: 9, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
});
