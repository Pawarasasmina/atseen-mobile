import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginScreen } from './src/screens/LoginScreen';
import { SeenScreen } from './src/screens/SeenScreen';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { WallScreen } from './src/screens/WallScreen';
import { MessagesScreen } from './src/screens/MessagesScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { CreateExperienceScreen } from './src/screens/CreateExperienceScreen';
import { authStorage } from './src/services/authStorage';
import { api, WEB_BASE_URL, setAccessTokenProvider, setSessionUpdater, setUnauthorizedHandler } from './src/services/api';
import type { CreateTarget, MainTab, Session } from './src/types';

const createRoutes: Record<Exclude<CreateTarget, 'note'>, string> = {
  seen: '/create/seen',
  experience: '/create/experience',
  story: '/create?story=1',
  world: '/create/premium-world',
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [activeTab, setActiveTab] = useState<MainTab>('seen');
  const [createIntent, setCreateIntent] = useState<CreateTarget | null>(null);
  const [messagesTab, setMessagesTab] = useState<'all' | 'direct'>('all');

  useEffect(() => {
    authStorage.read().then(setSession).finally(() => setRestoring(false));
  }, []);

  useEffect(() => {
    setAccessTokenProvider(() => session?.accessToken || '');
    setSessionUpdater(async (nextSession) => {
      setSession(nextSession);
      if (nextSession) await authStorage.write(nextSession);
      else await authStorage.clear();
    });
    setUnauthorizedHandler(() => {
      authStorage.clear().finally(() => setSession(null));
    });
    return () => {
      setAccessTokenProvider(null);
      setSessionUpdater(null);
      setUnauthorizedHandler(null);
    };
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) return;
    api.me(session.accessToken).then(({ user }) => {
      const refreshed = { ...session, user };
      setSession(refreshed);
      authStorage.write(refreshed);
    }).catch(() => undefined);
  }, [session?.accessToken]);

  const navigateToCreate = async (target: CreateTarget) => {
    if (target === 'experience') {
      setCreateIntent('experience');
      return;
    }
    if (target === 'note') {
      setCreateIntent('note');
      setActiveTab('wall');
      return;
    }
    const url = `${WEB_BASE_URL}${createRoutes[target]}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('This device cannot open the creator flow.');
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Could not open create flow', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  if (restoring) {
    return <View style={styles.loading}><ActivityIndicator color="#9CCBFF" /></View>;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationBar style="dark" />
      {session ? (
        createIntent === 'experience' ? <CreateExperienceScreen session={session} onClose={() => setCreateIntent(null)} onPublished={() => setActiveTab('profile')} />
          : activeTab === 'discover' ? <DiscoverScreen session={session} onNavigate={setActiveTab} />
          : activeTab === 'wall' ? <WallScreen createIntent={createIntent} onCreateIntentHandled={() => setCreateIntent(null)} session={session} onNavigate={setActiveTab} />
            : activeTab === 'messages' ? <MessagesScreen initialTab={messagesTab} session={session} onNavigate={(tab) => { setMessagesTab('all'); setActiveTab(tab); }} />
              : activeTab === 'profile' ? <ProfileScreen session={session} onNavigate={setActiveTab} onCreate={navigateToCreate} onDirectAccess={() => { setMessagesTab('direct'); setActiveTab('messages'); }} />
                : <SeenScreen session={session} onCreate={navigateToCreate} onNavigate={setActiveTab} onLogout={async () => { await authStorage.clear(); setSession(null); }} />
      ) : <LoginScreen onAuthenticated={setSession} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#0A0C0F', alignItems: 'center', justifyContent: 'center' },
});
