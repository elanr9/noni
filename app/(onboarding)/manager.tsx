// Invited campaign manager onboarding: a short welcome-and-tour, mirroring
// the web admin flow. Company and brand setup belong to the company admin on
// the web, so the app only confirms the name and teaches the loop, then lands
// the manager on the temporary Setup tab.
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { OnboardingShell } from './_shell';
import { Screen } from '../../components/layout/Screen';
import { Button } from '../../components/ui/Button';
import { Icon, type IconName } from '../../components/ui/Icon';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth';
import { completeOnboarding, getCompany, saveCreatorBasics } from '../../lib/onboarding';
import { color, radius, space, type } from '../../theme/tokens';

const TOTAL_STEPS = 4;

const TOUR: {
  icon: IconName;
  tint: { bg: string; fg: string };
  title: string;
  subtitle: string;
}[] = [
  {
    icon: 'sparkles',
    tint: { bg: color.blue100, fg: color.blue600 },
    title: 'Noni plans the content',
    subtitle:
      'Every week Noni studies what is working and drafts briefs for your creators. You shape and approve them in Briefs.',
  },
  {
    icon: 'inbox',
    tint: { bg: color.amberSoft, fg: color.amber },
    title: 'Creators record, you approve',
    subtitle:
      'Creators get their tasks in this app and submit takes. Review is where you approve them. That is your only job.',
  },
  {
    icon: 'trending-up',
    tint: { bg: color.greenSoft, fg: color.green },
    title: 'Everything after is automatic',
    subtitle:
      'Approved posts get edited, published to the connected accounts, and tracked in Analytics. No exporting, no scheduling.',
  },
];

function WelcomeTile({
  icon,
  bg,
  fg,
}: {
  icon: IconName;
  bg: string;
  fg: string;
}) {
  return (
    <View style={[styles.tile, { backgroundColor: bg }]}>
      <Icon name={icon} size={30} color={fg} />
    </View>
  );
}

export default function ManagerOnboarding() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName((v) => v || profile.full_name || '');
    void getCompany(profile.company_id)
      .then((c) => setCompanyName(c.name))
      .catch(() => undefined);
  }, [profile]);

  async function finish() {
    if (!profile) return;
    setBusy(true);
    try {
      await saveCreatorBasics(profile.id, name.trim(), profile.avatar_path);
      await completeOnboarding(profile.id);
      await refreshProfile();
      router.replace('/(admin)/(tabs)/setup');
    } catch (e) {
      setBusy(false);
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    }
  }

  if (step === 0) {
    const firstName = name.trim().split(/\s+/)[0] ?? '';
    return (
      <Screen
        edges={['top', 'left', 'right', 'bottom']}
        contentStyle={styles.welcomeContent}
      >
        <View style={styles.tileGrid}>
          <WelcomeTile icon="sparkles" bg={color.amberSoft} fg={color.amber} />
          <WelcomeTile icon="video" bg={color.blue100} fg={color.blue600} />
          <WelcomeTile icon="flame" bg={color.dangerSoft} fg={color.danger} />
          <WelcomeTile icon="trending-up" bg={color.greenSoft} fg={color.green} />
        </View>
        <Text style={styles.welcomeTitle}>
          {firstName ? `Hi ${firstName}, welcome to Noni!` : 'Welcome to Noni!'}
        </Text>
        <Text style={styles.welcomeSubtitle}>
          {companyName
            ? `You run content for ${companyName} here. Two minutes and you are in.`
            : 'You run your company content here. Two minutes and you are in.'}
        </Text>
        <Button size="lg" onPress={() => setStep(1)}>
          {"Let's get started"}
        </Button>
      </Screen>
    );
  }

  if (step === 1) {
    return (
      <OnboardingShell
        step={1}
        total={TOTAL_STEPS}
        title="Who are you?"
        subtitle="How your team sees you inside Noni."
        primaryLabel="Next"
        primaryDisabled={!name.trim()}
        onPrimary={() => setStep(2)}
      >
        <TextField
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          autoCapitalize="words"
          accessibilityLabel="Your name"
        />
      </OnboardingShell>
    );
  }

  const tour = TOUR[step - 2];
  const last = step === TOTAL_STEPS;
  return (
    <OnboardingShell
      step={step}
      total={TOTAL_STEPS}
      onBack={() => setStep((s) => s - 1)}
      title={tour.title}
      subtitle={tour.subtitle}
      primaryLabel={last ? (busy ? 'Saving…' : 'Take me in') : 'Next'}
      primaryDisabled={busy}
      onPrimary={() => (last ? void finish() : setStep((s) => s + 1))}
      centerContent
    >
      <View style={styles.tourIconWrap}>
        <View style={[styles.tourIcon, { backgroundColor: tour.tint.bg }]}>
          <Icon name={tour.icon} size={44} color={tour.tint.fg} />
        </View>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  welcomeContent: {
    flex: 1,
    justifyContent: 'center',
    gap: space[5],
    paddingBottom: space[10],
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
    width: 92 * 2 + space[3],
    alignSelf: 'center',
    marginBottom: space[5],
  },
  tile: {
    width: 92,
    height: 92,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: type.size.title,
    lineHeight: type.size.title * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.heavy,
    color: color.ink,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
    textAlign: 'center',
    marginBottom: space[5],
  },
  tourIconWrap: {
    alignItems: 'center',
  },
  tourIcon: {
    width: 120,
    height: 120,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
