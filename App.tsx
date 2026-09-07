import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LoginScreen } from './src/screens/LoginScreen';
import { SeenScreen } from './src/screens/SeenScreen';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { authStorage } from './src/services/authStorage';
import { api, setUnauthorizedHandler } from './src/services/api';
import type { Session } from './src/types';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [activeTab, setActiveTab] = useState<'seen' | 'discover'>('seen');

  useEffect(() => {
    authStorage.read().then(setSession).finally(() => setRestoring(false));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      authStorage.clear().finally(() => setSession(null));
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!session?.accessToken) return;
    api.me(session.accessToken).then(({ user }) => {
      const refreshed = { ...session, user };
      setSession(refreshed);
      authStorage.write(refreshed);
    }).catch(() => undefined);
  }, [session?.accessToken]);

  if (restoring) {
    return <View style={styles.loading}><ActivityIndicator color="#9CCBFF" /></View>;
  }

  return (
    <>
      <StatusBar style="light" />
      {session ? activeTab === 'discover' ? <DiscoverScreen session={session} onNavigate={setActiveTab} /> : <SeenScreen session={session} onNavigate={setActiveTab} onLogout={async () => { await authStorage.clear(); setSession(null); }} /> : <LoginScreen onAuthenticated={setSession} />}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#0A0C0F', alignItems: 'center', justifyContent: 'center' },
});
