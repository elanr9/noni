import { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { AccountSwitcherCaret } from '../../../components/AccountSwitcherCaret';
import {
  AdminHeader,
  AdminScreen,
  SectionLabel,
  SkeletonCard,
} from '../../../components/admin/shared';
import { Button } from '../../../components/ui/Button';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  listBrandDocs,
  listCreatorSocialStatus,
  listProductFeatures,
  type CreatorSocialStatus,
} from '../../../lib/admin-api';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../../theme/tokens';

function connectedSummary(accounts: Record<string, unknown>): string {
  const parts: string[] = [];
  if (accounts.tiktok) parts.push('TikTok');
  if (accounts.instagram) parts.push('Instagram');
  return parts.length > 0 ? parts.join(' · ') : 'Not connected';
}

function CompanyRow({
  icon,
  title,
  value,
  onPress,
}: {
  icon: IconName;
  title: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      disabled={onPress === undefined}
      onPress={onPress}
      style={[styles.row, shadow.shadowCard]}
    >
      <View style={styles.rowIcon}>
        <Icon name={icon} size={16} color={color.blue600} />
      </View>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      {onPress !== undefined && (
        <Icon name="chevron-right" size={16} color={color.slate300} />
      )}
    </PressableScale>
  );
}

export default function SettingsScreen() {
  const { profile, signOut, enableCreatorMode } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<CreatorSocialStatus[]>([]);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const showBecomeCreator = profile?.role === 'admin' && !profile.can_create;

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
    // Row counts arrive after the roster; rows fall back to a quiet value.
    void listBrandDocs()
      .then((docs) => setDocCount(docs.filter((d) => d.content.trim().length > 0).length))
      .catch(() => undefined);
    void listProductFeatures()
      .then((rows) => setApprovedCount(rows.filter((r) => r.approved).length))
      .catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function onInvite() {
    Alert.alert(
      'Invite a creator',
      'Creators sign up in the Noni app and land on your roster once their account is approved.',
    );
  }

  return (
    <AdminScreen
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
      <AdminHeader title="Settings" />

      <View style={styles.rosterHeader}>
        <SectionLabel>Roster</SectionLabel>
        <Button size="sm" variant="tint" icon="plus" onPress={onInvite}>
          Invite
        </Button>
      </View>

      <View style={styles.rows}>
        {loading ? (
          <>
            <SkeletonCard height={56} radius={radiusAdmin.lg} />
            <SkeletonCard height={56} radius={radiusAdmin.lg} />
          </>
        ) : members.length === 0 ? (
          <Text style={styles.empty}>
            No creators yet. Invite the first one and their account approval
            starts here.
          </Text>
        ) : (
          members.map((m) => (
            <View key={m.id} style={[styles.row, shadow.shadowCard]}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {m.full_name ?? 'Creator'}
              </Text>
              <Text style={styles.rowValue}>
                {connectedSummary(m.social_accounts)}
              </Text>
            </View>
          ))
        )}
      </View>

      <SectionLabel style={styles.section}>Company</SectionLabel>
      <View style={styles.rows}>
        <CompanyRow
          icon="circle-user-round"
          title="Account template"
          value=""
          onPress={() => router.push('/(admin)/account-template')}
        />
        <CompanyRow
          icon="sparkles"
          title="Brand Brain"
          value={docCount !== null ? `${docCount} doc${docCount === 1 ? '' : 's'}` : ''}
          onPress={() => router.push('/(admin)/brain')}
        />
        <CompanyRow
          icon="zap"
          title="Features"
          value={approvedCount !== null ? `${approvedCount} approved` : ''}
          onPress={() => router.push('/(admin)/features')}
        />
        <CompanyRow
          icon="dollar-sign"
          title="Billing & budget"
          value=""
          onPress={() => router.push('/(admin)/billing')}
        />
        <CompanyRow icon="clock" title="Publish time" value="Sun 8PM EST" />
      </View>

      <SectionLabel style={styles.section}>Account</SectionLabel>
      <AccountSwitcherCaret
        name={profile?.full_name?.trim() || 'Admin'}
        style={styles.caret}
        textStyle={styles.caretName}
        iconSize={20}
      />
      <View style={styles.rows}>
        {showBecomeCreator ? (
          <PressableScale
            accessibilityRole="button"
            onPress={() => {
              Alert.alert(
                'Become a creator',
                'Stay on this account and switch into creator mode anytime. You will set up your posting accounts next.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Continue',
                    onPress: () => {
                      void enableCreatorMode().catch((e) => {
                        Alert.alert(
                          'Could not continue',
                          e instanceof Error ? e.message : 'Try again.',
                        );
                      });
                    },
                  },
                ],
              );
            }}
            style={[styles.row, shadow.shadowCard]}
          >
            <View style={styles.rowIcon}>
              <Icon name="plus" size={16} color={color.blue600} />
            </View>
            <Text style={styles.rowTitle}>Become a creator</Text>
            <Icon name="chevron-right" size={16} color={color.slate300} />
          </PressableScale>
        ) : null}

        <PressableScale
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={[styles.row, styles.dangerRow]}
        >
          <Icon name="log-out" size={16} color={color.danger} />
          <Text style={styles.dangerText}>Sign out</Text>
        </PressableScale>
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
  },
  section: {
    marginTop: 24,
    marginBottom: 10,
  },
  caret: {
    marginBottom: 14,
  },
  caretName: {
    fontSize: 22,
    fontWeight: '700',
  },
  rows: {
    gap: 10,
  },
  empty: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    fontWeight: '600',
    lineHeight: type.size.bodySm * type.leading.body,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  rowValue: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
  },
  dangerRow: {
    backgroundColor: color.dangerSoft,
    borderColor: color.dangerSoft,
  },
  dangerText: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.danger,
  },
});
