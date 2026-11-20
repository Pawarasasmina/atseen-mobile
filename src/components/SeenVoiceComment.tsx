import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Feather } from '@expo/vector-icons';
import { SeenAudio } from './SeenMedia';
import { colors } from '../theme';
import { seenDuration } from '../utils/seenPresentation';

export function SeenVoiceComment({ onCancel, onError, onSend }: { onCancel: () => void; onError: (message: string) => void; onSend: (uri: string, waveform: number[]) => Promise<void> }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'cache', isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 120);
  const [mode, setMode] = useState<'preparing' | 'recording' | 'preview' | 'sending'>('preparing');
  const [uri, setUri] = useState(''), [waveform, setWaveform] = useState<number[]>([]);
  const alive = useRef(true), stopping = useRef(false), sending = useRef(false);
  const currentMode = useRef(mode); currentMode.current = mode;
  useEffect(() => {
    alive.current = true;
    (async () => {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!alive.current) return;
        if (!permission.granted) { onError('Allow microphone access in Settings to record a voice comment.'); onCancel(); return; }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (!alive.current) { await setAudioModeAsync({ allowsRecording: false }); return; }
        await recorder.prepareToRecordAsync({ ...RecordingPresets.HIGH_QUALITY, directory: 'cache', isMeteringEnabled: true });
        if (!alive.current) { await recorder.stop(); await setAudioModeAsync({ allowsRecording: false }); return; }
        recorder.record({ forDuration: 30 }); setMode('recording');
      } catch (error) { if (alive.current) { onError(error instanceof Error ? error.message : 'Could not start recording.'); onCancel(); } }
    })();
    return () => {
      alive.current = false;
      // Native recorder resources and the iOS audio session must not outlive the sheet.
      try { recorder.stop().catch(() => {}).finally(() => setAudioModeAsync({ allowsRecording: false }).catch(() => {})); } catch { setAudioModeAsync({ allowsRecording: false }).catch(() => {}); }
    };
  }, [recorder]);
  const finish = async () => {
    if (stopping.current || currentMode.current !== 'recording') return;
    stopping.current = true;
    try {
      if (state.isRecording) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const value = recorder.uri || state.url || '';
      if (!value) throw new Error('No audio was recorded. Please try again.');
      if (alive.current) { setUri(value); setMode('preview'); }
    } catch (error) { if (alive.current) { onError(error instanceof Error ? error.message : 'Could not finish recording.'); onCancel(); } }
    finally { stopping.current = false; }
  };
  useEffect(() => {
    if (mode !== 'recording') return;
    if (typeof state.metering === 'number') setWaveform((old) => [...old.slice(-59), Math.max(.05, Math.min(1, (state.metering! + 60) / 60))]);
    if (state.durationMillis >= 30000 || (!state.isRecording && state.durationMillis >= 29500)) finish();
  }, [mode, state.durationMillis, state.isRecording, state.metering]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (status) => { if (status === 'background' && currentMode.current === 'recording') finish(); });
    return () => listener.remove();
  }, [state.isRecording, state.url, recorder]);
  const send = async () => {
    if (!uri || sending.current) return;
    sending.current = true; setMode('sending');
    try { await onSend(uri, waveform); }
    catch { if (alive.current) setMode('preview'); }
    finally { sending.current = false; }
  };
  return <View style={s.voice}>
    {mode === 'preview' || mode === 'sending' ? <SeenAudio uri={uri} active={mode === 'preview'} /> : <View style={s.recording}>{mode === 'preparing' ? <ActivityIndicator color={colors.blue} /> : <><View style={s.dot} /><Text accessibilityLiveRegion="polite" style={s.time}>{seenDuration(state.durationMillis / 1000)} / 0:30</Text><View style={s.bars}>{waveform.slice(-20).map((level, index) => <View key={index} style={[s.bar, { height: Math.max(3, level * 22) }]} />)}</View></>}</View>}
    <View style={s.actions}><Pressable accessibilityLabel="Discard voice comment" disabled={mode === 'sending'} onPress={onCancel} style={s.button}><Feather name="trash-2" color={colors.muted} size={18} /></Pressable><Text style={s.hint}>{mode === 'recording' ? 'Voice comment · up to 30 seconds' : mode === 'preparing' ? 'Preparing microphone…' : 'Listen before posting'}</Text>{mode === 'recording' ? <Pressable accessibilityLabel="Stop recording" onPress={finish} style={s.button}><Feather name="square" color={colors.blue} size={19} /></Pressable> : mode !== 'preparing' ? <Pressable accessibilityLabel="Post voice comment" disabled={mode === 'sending'} onPress={send} style={s.button}>{mode === 'sending' ? <ActivityIndicator color={colors.blue} /> : <Text style={s.post}>Post</Text>}</Pressable> : null}</View>
  </View>;
}
const s = StyleSheet.create({ voice: { paddingTop: 8 }, recording: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger }, time: { color: colors.text, fontSize: 12 }, bars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 }, bar: { width: 3, borderRadius: 2, backgroundColor: colors.blue }, actions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, button: { minWidth: 38, minHeight: 38, alignItems: 'center', justifyContent: 'center' }, hint: { flex: 1, color: colors.faint, fontSize: 11 }, post: { color: colors.blue, fontSize: 13, fontWeight: '700' } });
