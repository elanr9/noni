// Temporary Setup tab for freshly invited campaign managers. The checklist
// derives from live company data and the tab retires once everything is done.
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { InviteCreatorSheet } from '../../../components/admin/InviteCreatorSheet';
import { Screen } from '../../../components/layout/Screen';
import { Button } from '../../../components/ui/Button';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { SkeletonLine } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { inviteCreator } from '../../../lib/admin-api';
import { useAuth } from '../../../lib/auth';
import { isManagerSetupCompleteFlag } from '../../../lib/profile';
import {
  fetchManagerSetupState,
  markCreatorInvited,
  markManagerSetupComplete,
  type ManagerSetupState,
} from '../../../lib/setup';
import {
  borderWidth,
  color,
  radius,
  shadow,
  space,
  type,
} from '../../../theme/tokens';

function StepRow({
  icon,
  title,
  sub,
  done,
  onPress,
}: {
  icon: IconName;
  title: string;
  sub: string;
  done: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={[styles.card, shadow.shadowCard]}
    >
      <View
        style={[
          styles.cardIcon,
          { backgroundColor: done ? color.greenSoft : color.blue100 },
        ]}
      >
        <Icon
          name={done ? 'check' : icon}
          size={16}
          color={done ? color.green : color.blue700}
        />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSub}>{sub}</Text>
      </View>
      <StatusChip
        status={done ? 'approved' : 'assigned'}
        label={done ? 'Done' : 'To do'}
      />
    </PressableScale>
  );
}

export default function ManagerSetupScreen() {
  const router = useRouter();
  const { profile, permissions, refreshProfile } = useAuth();
  const [state, setState] = useState<ManagerSetupState | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);

  const alreadyComplete =
    profile !== null && isManagerSetupCompleteFlag(profile.onboarding_answers);
  // Managers without the invite permission only need the brief step; the
  // company admin invites creators from the web dashboard.
  const needsCreators = permissions.invite_members;
  const complete =
    alreadyComplete ||
    (state !== null && state.brief && (!needsCreators || state.creators));

  const refresh = useCallback(async () => {
    if (!profile || alreadyComplete) return;
    const next = await fetchManagerSetupState(
      profile.company_id,
      profile.onboarding_answers,
    );
    setState(next);
    if (next.brief && (!needsCreators || next.creators)) {
      // Retires the tab: destinationForProfile and the tab layout both read
      // this flag off the profile.
      await markManagerSetupComplete(profile.id).catch(() => undefined);
      await refreshProfile();
    }
  }, [profile, alreadyComplete, needsCreators, refreshProfile]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function sendInvite(name: string, email: string) {
    if (!profile) return;
    setInviteSending(true);
    try {
      await inviteCreator(profile.company_id, name, email);
      await markCreatorInvited(profile.id).catch(() => undefined);
      setInviteOpen(false);
      Alert.alert('Invite sent', `${name} will get an email at ${email}.`);
      await refresh();
    } catch (e) {
      Alert.alert(
        'Could not send',
        e instanceof Error ? e.message : 'Try again.',
      );
    } finally {
      setInviteSending(false);
    }
  }

  const stepCount = needsCreators ? 2 : 1;
  const doneCount = complete
    ? stepCount
    : state === null
      ? 0
      : [state.brief, ...(needsCreators ? [state.creators] : [])].filter(
          Boolean,
        ).length;

  if (complete) {
    return (
      <Screen bg={color.offWhite} contentStyle={styles.doneContent}>
        <View style={styles.doneIcon}>
          <Icon name="check" size={28} color={color.green} />
        </View>
        <Text style={[styles.title, styles.centered]}>You are set.</Text>
        <Text style={[styles.subtitle, styles.centered]}>
          Review is where approvals happen. Everything after an approve is
          automatic.
        </Text>
        <Button size="lg" onPress={() => router.replace('/(admin)/(tabs)')}>
          Go to Review
        </Button>
      </Screen>
    );
  }

  return (
    <Screen bg={color.offWhite} scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Get set up</Text>
        <Text style={styles.subtitle}>
          {stepCount === 2
            ? 'Two steps and your content engine is running.'
            : 'One step and your content engine is running.'}
        </Text>
        {state !== null ? (
          <View style={styles.progressRow}>
            <View style={styles.progressBar}>
              <ProgressBar progress={doneCount / stepCount} />
            </View>
            <Text style={styles.progressLabel}>
              {doneCount} of {stepCount}
            </Text>
          </View>
        ) : null}
      </View>

      {state === null ? (
        <View style={styles.list}>
          {[0, 1].map((i) => (
            <SkeletonLine
              key={i}
              width="100%"
              height={space.tapPrimary + space[4]}
              radius={radius.lg}
            />
          ))}
        </View>
      ) : (
        <View style={styles.list}>
          <StepRow
            icon="sparkles"
            title="Create your first brief"
            sub="Noni drafts it with you in Briefs. Approve it and it lands in a creator's queue."
            done={state.brief}
            onPress={() => router.push('/(admin)/(tabs)/create')}
          />
          {needsCreators ? (
            <StepRow
              icon="users"
              title="Invite your creators"
              sub="They get an email, sign in with Google, and their tasks are waiting."
              done={state.creators}
              onPress={() => setInviteOpen(true)}
            />
          ) : null}
        </View>
      )}

      <InviteCreatorSheet
        visible={inviteOpen}
        sending={inviteSending}
        onClose={() => setInviteOpen(false)}
        onInvite={(name, email) => void sendInvite(name, email)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[6],
    paddingTop: space[3],
    paddingBottom: space[9],
  },
  header: {
    gap: space[3],
  },
  title: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  subtitle: {
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.stackGap,
    paddingTop: space[2],
  },
  progressBar: {
    flex: 1,
  },
  progressLabel: {
    fontSize: type.size.meta,
    fontWeight: type.weight.heavy,
    color: color.slate500,
  },
  list: {
    gap: space.stackGap,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[4],
    backgroundColor: color.white,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: space.cardPad,
  },
  cardIcon: {
    width: space[9],
    height: space[9],
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    minWidth: 0,
    gap: space[2],
  },
  cardTitle: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  cardSub: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.body,
    color: color.slate400,
  },
  doneContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[5],
    paddingBottom: space[11] * 2,
  },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: color.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
  },
});
