import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LoginScreen } from './src/screens/LoginScreen';
import { SeenScreen } from './src/screens/SeenScreen';
import { authStorage } from './src/services/authStorage';
import type { Session } from './src/types';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    authStorage.read().then(setSession).finally(() => setRestoring(false));
  }, []);

  if (restoring) {
    return <View style={styles.loading}><ActivityIndicator color="#9CCBFF" /></View>;
  }

  return (
    <>
      <StatusBar style="light" />
      {session ? <SeenScreen session={session} onLogout={async () => { await authStorage.clear(); setSession(null); }} /> : <LoginScreen onAuthenticated={setSession} />}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#0A0C0F', alignItems: 'center', justifyContent: 'center' },
});
