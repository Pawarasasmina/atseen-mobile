import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';
import { resolveMediaUrl } from '../../services/api';
import { colors } from '../../theme';
import type { ExperiencePublication, ProfileSeries, SeenMedia } from '../../types';
import { compact, relativeTime } from '../../utils/format';

export const recordId = (item: { id?: string; _id?: string }) => String(item.id || item._id || '');
export const coverUrl = (item: { coverMedia?: SeenMedia; introMedia?: SeenMedia }) => item.coverMedia?.secureUrl || item.coverMedia?.url || item.introMedia?.secureUrl || item.introMedia?.url || '';
function CoinIcon({ size = 9 }: { size?: number }) {
  return <Image accessible={false} source={require('../../../assets/profile-coin.png')} resizeMode="contain" style={{ width: size, height: size }} />;
}
export function ProfileImage({ uri, style, contain = false }: { uri?: string; style?: StyleProp<ViewStyle>; contain?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return <View style={[s.image, style]}>{uri && !failed ? <Image onError={() => setFailed(true)} resizeMode={contain ? 'contain' : 'cover'} source={{ uri: resolveMediaUrl(uri) }} style={StyleSheet.absoluteFill} /> : <Feather name="image" color={colors.faint} size={20} />}</View>;
}
export function IconButton({ icon, label, onPress, size = 16, color = colors.faint, style, disabled = false }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; size?: number; color?: string; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} hitSlop={10} onPress={onPress} style={[s.icon, style]}><Feather name={icon} color={color} size={size} /></Pressable>;
}
export function SectionHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return <View style={[s.heading, title === 'Dream' && { marginTop: 20, marginBottom: 6 }, title === 'Wall' && { marginTop: 22, marginBottom: 4 }, title === 'Photos' && { marginTop: 22 }]}><Text style={[s.title, title === 'Dream' && { flex: 0 }]}>{title}</Text>{children}</View>;
}
export function ExperiencePreview({ item, onPress }: { item: ExperiencePublication; onPress: () => void }) {
  const paid = item.pricing?.mode === 'ONE_TIME';
  const publishedDate = relativeTime(item.publishedAt);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title || 'experience'}`} onPress={onPress} style={s.experience}>
    <ProfileImage uri={coverUrl(item)} style={s.cover} />
    <View style={s.copy}><Text numberOfLines={2} style={s.experienceTitle}>{item.title || 'Untitled experience'}</Text><Text style={s.metadata}>{item.chapterCount ?? item.chapters?.length ?? 0} chapters{item.category ? ` · ${item.category}` : ''}{item.updatedAt ? ` · upd ${relativeTime(item.updatedAt)}` : ''}</Text>
      <View style={s.priceRow}><View style={[s.price, { flexDirection: 'row', gap: 2, alignItems: 'center' }]}>{paid ? <CoinIcon /> : null}<Text style={s.priceText}>{paid ? `${compact(item.pricing?.starsAmount || 0)} · one-time` : 'Free'}</Text></View>{item.ownerCount !== undefined && item.ownerCount > 0 ? <Text style={s.metadata}>{compact(item.ownerCount)} own it</Text> : null}</View>
    </View>
  </Pressable>;
}
export function ContentTile({ item, series, label, count, onPress, width }: { item?: ExperiencePublication; series?: ProfileSeries; label?: string; count?: number; onPress: () => void; width: number }) {
  const title = label || series?.name || item?.title || 'Untitled Seen';
  const chapters = item?.chapterCount ?? item?.chapters?.length;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={onPress} style={[s.tile, { width, height: width * 1.25 }]}>
    <ProfileImage uri={series ? coverUrl(series) : item ? coverUrl(item) : ''} style={StyleSheet.absoluteFill} />
    <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(10,12,15,.88)']} locations={[.4, 1]} style={StyleSheet.absoluteFill} />
    {series || label ? <Text style={s.seriesBadge}>{series ? 'SERIES' : label?.toUpperCase()}</Text> : chapters ? <View style={s.chapterBadge}><Feather name="copy" size={9.5} color={colors.text} /><Text style={s.badgeText}>{chapters}</Text></View> : null}
    {count !== undefined || series?.seenCount !== undefined ? <Text style={s.countBadge}>{count ?? series?.seenCount}</Text> : item?.isPinned ? <View style={s.pin}><Ionicons name="pin" color={colors.blue} size={10} /></View> : null}
    <Text numberOfLines={2} style={s.tileTitle}>{title}</Text>
  </Pressable>;
}
export function WorldPreview({ world, capacity, residents, price, onPress }: { world: ExperiencePublication; capacity?: number | null; residents?: number; price?: number | null; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open world ${world.title}`} onPress={onPress} style={s.world}>
    <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs><RadialGradient id="profile-world-glow" cx="50%" cy="42%" rx="85%" ry="95%"><Stop offset={0} stopColor="#0D1420" /><Stop offset={0.78} stopColor="#06080B" /></RadialGradient></Defs>
      <Rect width="100%" height="100%" fill="url(#profile-world-glow)" />
      <Ellipse cx="50%" cy="50%" rx={130} ry={50 * Math.cos(64 * Math.PI / 180)} stroke="rgba(156,203,255,.15)" strokeWidth={.7} fill="none" />
      <Ellipse cx="50%" cy="50%" rx={86} ry={32 * Math.cos(64 * Math.PI / 180)} stroke="rgba(156,203,255,.15)" strokeWidth={.7} fill="none" />
    </Svg>
    {[[14, 20], [88, 26], [10, 66], [90, 72], [52, 90]].map(([left, top]) => <View key={left} style={[s.star, { left: `${left}%`, top: `${top}%` }]} />)}
    <View style={s.worldCopy}>{world.planet?.emoji ? <View style={s.worldArt}><Text style={s.planet}>{world.planet.emoji}</Text>{world.planet.faceEmoji ? <Text style={s.face}>{world.planet.faceEmoji}</Text> : null}</View> : <ProfileImage uri={coverUrl(world)} style={s.worldArt} contain />}
      <Text numberOfLines={2} style={s.worldTitle}>{world.title || 'Your World'}</Text>{capacity != null ? <Text style={s.capacity}>LIMITED · {capacity.toLocaleString()}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}><Text style={s.worldMeta}>{residents !== undefined ? `${compact(residents)} residents` : 'Residents unavailable'}{world.pricing?.mode === 'FREE' ? ' · Free' : price != null ? ' · ' : ''}</Text>{world.pricing?.mode !== 'FREE' && price != null ? <><CoinIcon size={8} /><Text style={s.worldMeta}>{compact(price)}/mo</Text></> : null}</View>
    </View>
  </Pressable>;
}
export function WorldCreationEntry({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Open your world" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.05)', opacity: .8 }}><View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.3)', alignItems: 'center', justifyContent: 'center' }}><Feather name="plus" size={12} color={colors.muted} /></View><Text style={{ flex: 1, color: colors.muted, fontSize: 13, fontWeight: '700' }}>Open your world</Text><Feather name="chevron-right" size={12} color={colors.faint} /></Pressable>;
}
const s = StyleSheet.create({
  image: { backgroundColor: colors.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, icon: { alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 10 }, title: { color: colors.text, fontSize: 14.5, fontWeight: '700', letterSpacing: -.2, flex: 1 },
  experience: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 3, marginBottom: 13 }, cover: { width: 118, aspectRatio: 1.6, borderRadius: 12 }, copy: { flex: 1, minWidth: 0 }, experienceTitle: { color: colors.text, fontSize: 13.5, lineHeight: 17.55, fontWeight: '700' }, metadata: { fontSize: 10, lineHeight: 14, color: colors.faint, marginTop: 3 }, priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 7 }, price: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, backgroundColor: 'rgba(156,203,255,.1)', borderColor: 'rgba(156,203,255,.3)', borderWidth: 1 }, priceText: { fontSize: 10.5, fontWeight: '700', color: colors.blue },
  tile: { aspectRatio: .8, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface2 }, tileTitle: { position: 'absolute', bottom: 7, left: 8, right: 8, color: colors.text, fontSize: 10.5, lineHeight: 13.65, fontWeight: '700' }, seriesBadge: { position: 'absolute', top: 7, left: 7, fontSize: 8.5, fontWeight: '800', letterSpacing: .8, backgroundColor: 'rgba(10,13,18,.7)', color: '#BFE3FF', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 }, chapterBadge: { position: 'absolute', left: 6, top: 6, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, backgroundColor: 'rgba(10,13,18,.7)', paddingVertical: 2.5, paddingHorizontal: 7 }, badgeText: { color: colors.text, fontSize: 9, fontWeight: '800' }, countBadge: { position: 'absolute', top: 7, right: 7, minWidth: 18, height: 18, paddingHorizontal: 5, textAlign: 'center', lineHeight: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,.14)', color: colors.text, fontSize: 10, fontWeight: '800' }, pin: { position: 'absolute', right: 7, top: 7, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(10,13,18,.7)', alignItems: 'center', justifyContent: 'center' },
  world: { height: 150, marginTop: 4, borderWidth: 1, borderColor: colors.line, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, star: { position: 'absolute', width: 2.5, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.5)' }, worldCopy: { alignItems: 'center', width: '80%', transform: [{ translateY: -6 }] }, worldArt: { width: 58, height: 58, backgroundColor: 'transparent', shadowColor: colors.blue, shadowOpacity: .55, shadowRadius: 20 }, planet: { fontSize: 44, textAlign: 'center' }, face: { position: 'absolute', top: -12, left: 15, fontSize: 23 }, worldTitle: { textShadowColor: '#000', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6, color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 7 }, capacity: { color: 'rgba(255,255,255,.42)', fontSize: 6, fontWeight: '600', letterSpacing: 2, marginTop: 4 }, worldMeta: { color: colors.faint, fontSize: 9, textAlign: 'center', marginTop: 2 },
});
