import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { resolveMediaUrl } from '../services/api';
import { colors } from '../theme';
import { isSeenVideo, seenDuration, seenMediaSource } from '../utils/seenPresentation';
import type { SeenMedia as Media } from '../types';

function SeenVideo({ uri, active, cover, duration }: { uri: string; active: boolean; cover: boolean; duration?: number }) {
  const [muted, setMuted] = useState(cover);
  const player = useVideoPlayer(uri, (video) => { video.loop = cover; video.muted = cover; });
  useEffect(() => { player.muted = muted; }, [muted, player]);
  useEffect(() => { if (active && cover) player.play(); else player.pause(); }, [active, cover, player]);
  return <View style={StyleSheet.absoluteFill}>
    <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={!cover} />
    {cover ? <><Pressable accessibilityLabel={muted ? 'Unmute cover video' : 'Mute cover video'} accessibilityState={{ selected: !muted }} onPress={() => setMuted(!muted)} style={s.sound}><Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={14} color="#fff" /></Pressable>{duration ? <View style={s.duration}><Ionicons name="play" size={8} color="#fff" /><Text style={s.durationText}>{seenDuration(duration)}</Text></View> : null}</> : null}
  </View>;
}

export function SeenMedia({ media, active = true, cover = false }: { media?: Media; active?: boolean; cover?: boolean }) {
  const uri = resolveMediaUrl(seenMediaSource(media));
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  if (!uri || failed) return <View style={[StyleSheet.absoluteFill, s.fallback]}><Ionicons name="eye-outline" color={colors.blue} size={30} /></View>;
  // Do not allocate a native video player for every offscreen chapter in a feed.
  if (isSeenVideo(media)) return active ? <SeenVideo key={uri} uri={uri} active={active} cover={cover} duration={media?.durationSeconds || media?.duration} /> : <View style={[StyleSheet.absoluteFill, s.fallback]}><Ionicons name="play-circle-outline" color={colors.blue} size={30} /></View>;
  return <Image accessibilityLabel="Seen cover" onError={() => setFailed(true)} source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />;
}

export function SeenAudio({ uri, active }: { uri: string; active: boolean }) {
  const player = useAudioPlayer(active ? { uri: resolveMediaUrl(uri) } : null);
  const status = useAudioPlayerStatus(player);
  useEffect(() => { if (!active) player.pause(); }, [active, player]);
  const toggle = () => { if (status.playing) player.pause(); else { if (status.didJustFinish) player.seekTo(0).catch(() => {}); player.play(); } };
  return <Pressable accessibilityLabel={status.playing ? 'Pause chapter audio' : 'Play chapter audio'} onPress={toggle} style={s.audio}><Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} color={colors.blue} size={34} /><Text style={s.audioLabel}>Voice note</Text><Text style={s.audioTime}>{seenDuration(status.currentTime)} / {seenDuration(status.duration)}</Text></Pressable>;
}
const s = StyleSheet.create({
  fallback: { backgroundColor: '#18212C', alignItems: 'center', justifyContent: 'center' },
  sound: { position: 'absolute', bottom: 9, left: 9, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(10,12,15,.6)', alignItems: 'center', justifyContent: 'center' },
  duration: { position: 'absolute', bottom: 7, right: 7, borderRadius: 20, backgroundColor: 'rgba(10,12,15,.65)', paddingHorizontal: 6, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 2 },
  durationText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  audio: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  audioLabel: { color: colors.text, flex: 1, fontSize: 13 }, audioTime: { color: colors.faint, fontSize: 11 },
});
