import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusEye } from '../components/StatusEye';
import { Avatar } from '../components/Avatar';
import { api } from '../services/api';
import type { UnifiedProfile } from '../types';
import { profileStatusText } from '../utils/ownProfile';
import { colors } from '../theme';

const presets = ['At seen', '🎾 Tennis?', '🌅 Morning person', '💪 At the gym', '📚 Reading', '☕ Coffee walk', '🎧 Deep work', '✈️ Traveling', '✍️ New Seen soon', '🔥 Cooking something new', '💬 Replying to everyone', '📞 Open for calls', '🌍 My World is open'];
export function ProfileStatusScreen({ profile, onClose, onSaved }: { profile: UnifiedProfile['profile']; onClose: () => void; onSaved: () => void }) {
  const current = profile.activeStatus?.label ? profileStatusText(profile.activeStatus) : '';
  const [text, setText] = useState(current), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false);
  const save = async (clear = false) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const value = text.trim();
      await api.updateProfileStatus(clear || !value ? { clear: true } : { status: value });
      onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update status. Please retry.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const close = () => { if (!locked.current) onClose(); };
  return <Modal animationType="slide" onRequestClose={close}><SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.header}><Pressable accessibilityLabel="Back" disabled={busy} onPress={close} style={s.back}><Feather name="chevron-left" size={22} color={colors.text} /></Pressable><Text style={s.heading}>Status</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>
      <View style={s.ring}><Avatar size={92} user={profile} /></View>
      <TextInput accessibilityLabel="Your current status" placeholder="Right now…" placeholderTextColor="#737B86" editable={!busy} value={text} maxLength={24} onChangeText={(value) => { setText(value); setError(''); }} style={s.input} returnKeyType="done" onSubmitEditing={() => save()} />
      <View style={s.divider} /><Text style={s.hint}>seen by people who open your profile</Text>
      <View style={s.presets}>{presets.map((preset) => <Pressable accessibilityRole="button" accessibilityLabel={preset} accessibilityState={{ selected: text === preset }} disabled={busy} key={preset} onPress={() => { setText(preset); setError(''); }} style={[s.chip, text === preset && s.selected]}>{preset === 'At seen' ? <StatusEye /> : null}<Text style={s.chipText}>{preset}</Text></Pressable>)}</View>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => save()} style={[s.show, busy && { opacity: .6 }]}><LinearGradient colors={['#9CCBFF', '#73ACE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.gradient}>{busy ? <ActivityIndicator color="#090C10" /> : <Text style={s.showText}>Show</Text>}</LinearGradient></Pressable>
      {current ? <Pressable accessibilityRole="button" disabled={busy} hitSlop={10} onPress={() => save(true)} style={s.remove}><Text style={s.removeText}>Remove status</Text></Pressable> : null}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView></Modal>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#0A0D10' }, flex: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingVertical: 14 }, back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1B1E21', alignItems: 'center', justifyContent: 'center' }, heading: { color: '#FFF', fontSize: 19, fontWeight: '700' }, scroll: { alignItems: 'center', paddingTop: 34, paddingHorizontal: 22, paddingBottom: 30 }, ring: { width: 104, height: 104, borderRadius: 52, borderWidth: 2, borderColor: '#9CCBFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#9CCBFF', shadowOpacity: .5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 8, backgroundColor: '#0A0D10' }, input: { marginTop: 24, width: '100%', maxWidth: 270, color: '#E6E8EB', fontSize: 16.5, fontWeight: '600', textAlign: 'center', padding: 0, minHeight: 26, letterSpacing: .2 }, divider: { width: 38, height: 1, backgroundColor: '#32363B', marginTop: 12 }, hint: { marginTop: 14, color: '#737B86', fontSize: 10.5 }, presets: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 300, marginTop: 30 }, chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 24, borderWidth: 1, borderColor: '#292D32', backgroundColor: '#111416' }, selected: { borderColor: '#7CA2C8', backgroundColor: '#18212B' }, chipText: { color: '#A7ADB7', fontSize: 12.5, fontWeight: '600' }, show: { marginTop: 30, width: '100%', maxWidth: 280, borderRadius: 14, overflow: 'hidden' }, gradient: { minHeight: 46, alignItems: 'center', justifyContent: 'center' }, showText: { color: '#090C10', fontSize: 14, fontWeight: '700' }, remove: { marginTop: 18, paddingVertical: 5 }, removeText: { color: '#737B86', fontSize: 12.5, fontWeight: '600' }, error: { marginTop: 16, color: '#FF8C8C', textAlign: 'center', lineHeight: 19 } });
