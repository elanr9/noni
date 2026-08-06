import { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/ui/Button';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  listCreatorSocialStatus,
  type CreatorSocialStatus,
} from '../../../lib/admin-api';
import { borderWidth, color, radius, shadow, space, type } from '../../../theme/tokens';

function connectedSummary(accounts: Record<string, unknown>): string {
  const parts: string[] = [];
  if (accounts.tiktok) parts.push('TikTok');
  if (accounts.instagram) parts.push('Instagram');
  return parts.length > 0 ? parts.join(' · ') : 'Not connected';
}

export default function SettingsScreen() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<CreatorSocialStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await listCreatorSocialStatus());
    } catch (e) {
      Alert.alert(
        'Could not load',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 6, paddingBottom: 116 },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <Text style={styles.h1}>Settings</Text>
      <Text style={styles.subtitle}>
        Creators, brand brain, and account.
      </Text>

      <Text style={styles.section}>Creator socials</Text>
      <Text style={styles.body}>
        Creators connect their own TikTok and Instagram. Approved content posts to
        those accounts.
      </Text>

      {loading ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : members.length === 0 ? (
        <Text style={styles.empty}>No creators yet.</Text>
      ) : (
        members.map((m) => (
          <View key={m.id} style={[styles.card, shadow.shadowCard]}>
            <Text style={styles.name}>{m.full_name ?? 'Creator'}</Text>
            <Text style={styles.meta}>{connectedSummary(m.social_accounts)}</Text>
          </View>
        ))
      )}

      <Text style={styles.section}>Brand</Text>
      <PressableScale
        accessibilityRole="button"
        onPress={() => router.push('/(admin)/brain')}
        style={[styles.card, shadow.shadowCard]}
      >
        <Text style={styles.name}>Brand Brain</Text>
        <Text style={styles.meta}>
          Product truth, voice, audience, and source accounts.
        </Text>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        onPress={() => router.push('/(admin)/features')}
        style={[styles.card, shadow.shadowCard]}
      >
        <Text style={styles.name}>Features</Text>
        <Text style={styles.meta}>
          Approved claims briefs may use. Add, edit, or reject.
        </Text>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        onPress={() => router.push('/(admin)/account-template')}
        style={[styles.card, shadow.shadowCard]}
      >
        <Text style={styles.name}>Account template</Text>
        <Text style={styles.meta}>
          Instagram and TikTok bios, Instagram link, and example account.
        </Text>
      </PressableScale>

      <Text style={styles.section}>Account</Text>
      <View style={[styles.card, shadow.shadowCard]}>
        <Text style={styles.name}>{profile?.full_name ?? 'Admin'}</Text>
        <Text style={styles.meta}>Signed in as admin</Text>
      </View>

      <Button
        size="md"
        variant="outline"
        block
        icon="log-out"
        onPress={() => void signOut()}
        style={styles.signOut}
      >
        Sign out
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: space.gutter, gap: 10 },
  h1: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    fontWeight: '800',
    letterSpacing: type.tracking.title,
    color: color.ink,
    marginTop: 10,
  },
  subtitle: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    marginBottom: 8,
  },
  section: {
    marginTop: 12,
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  body: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: 21,
    marginBottom: 4,
  },
  empty: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    fontWeight: '600',
  },
  card: {
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: 16,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 4,
  },
  name: {
    fontSize: type.size.body,
    fontWeight: '700',
    color: color.ink,
  },
  meta: {
    fontSize: type.size.meta,
    fontWeight: '600',
    color: color.slate500,
  },
  signOut: { marginTop: 16 },
});
