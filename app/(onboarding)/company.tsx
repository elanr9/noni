import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, colors } from '../../components/Screen';
import { Chip, OptionCard, StepShell } from '../../components/OnboardingUI';
import { useAuth } from '../../lib/auth';
import {
  runBrandIngest,
  completeOnboarding,
  getCompany,
  saveBrandProfile,
  saveCompanySettings,
  updateCompanyBasics,
  type BrandAnswers,
} from '../../lib/onboarding';

const TOTAL_STEPS = 13;

const STUDY_PHASES = [
  'Reading your site',
  'Watching your posts',
  'Learning your voice',
] as const;

const TONES = [
  {
    key: 'professional',
    label: 'Professional',
    caption: (n: string) => `${n} gives you the data to improve every week. See it in action at the link in bio.`,
  },
  {
    key: 'friendly',
    label: 'Friendly',
    caption: (n: string) => `We built ${n} because getting better should feel simple. Come see how it works.`,
  },
  {
    key: 'playful',
    label: 'Playful',
    caption: (n: string) => `POV: you found ${n} before everyone else did. Your future self says thanks.`,
  },
  {
    key: 'bold',
    label: 'Bold',
    caption: (n: string) => `Most people guess. ${n} users know. Stop guessing.`,
  },
  {
    key: 'unhinged',
    label: 'Unhinged',
    caption: (n: string) => `not to be dramatic but ${n} is basically a cheat code and gatekeeping it would be a crime`,
  },
] as const;

const CADENCES = [1, 2, 3, 5, 7] as const;

export default function CompanyOnboarding() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [tiktokHandle, setTiktokHandle] = useState('');
  const [studyPhase, setStudyPhase] = useState(0);
  const [audience, setAudience] = useState('');
  const [products, setProducts] = useState('');
  const [buyingPath, setBuyingPath] = useState<BrandAnswers['buyingPath']>('link_in_bio');
  const [suggestedPillars, setSuggestedPillars] = useState<string[]>([]);
  const [pillars, setPillars] = useState<string[]>([]);
  const [customPillar, setCustomPillar] = useState('');
  const [toneIndex, setToneIndex] = useState(0);
  const [cadence, setCadence] = useState<number>(3);
  const [approvers, setApprovers] = useState<'just_me' | 'me_plus_others'>('just_me');

  useEffect(() => {
    if (!profile) return;
    void getCompany(profile.company_id).then((c) => {
      setCompanyName((v) => v || c.name);
      setWebsite((v) => v || c.website || '');
    });
  }, [profile]);

  // Brand study: fire the real brand-ingest edge call while the progress
  // states stream. Advance once both the call and the animation finish.
  // runBrandIngest never rejects (falls back to generic suggestions).
  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    setStudyPhase(0);
    // The last phase stays active until the real call resolves.
    const timers = STUDY_PHASES.slice(0, -1).map((_p, i) =>
      setTimeout(() => setStudyPhase(i + 1), (i + 1) * 1600),
    );
    const minDisplay = new Promise<void>((resolve) =>
      setTimeout(resolve, STUDY_PHASES.length * 1600 + 600),
    );
    const ingest = runBrandIngest({
      companyName,
      website,
      instagramHandle,
      tiktokHandle,
    });
    void Promise.all([ingest, minDisplay]).then(([s]) => {
      if (cancelled) return;
      setAudience((v) => v || s.audience);
      setProducts((v) => v || s.products);
      setSuggestedPillars(s.pillars);
      setPillars((v) => (v.length > 0 ? v : s.pillars.slice(0, 3)));
      setStep(4);
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [step, companyName, website, instagramHandle, tiktokHandle]);

  function togglePillar(p: string) {
    setPillars((list) =>
      list.includes(p) ? list.filter((x) => x !== p) : [...list, p],
    );
  }

  function addCustomPillar() {
    const p = customPillar.trim();
    if (!p) return;
    if (!suggestedPillars.includes(p)) setSuggestedPillars((s) => [...s, p]);
    if (!pillars.includes(p)) setPillars((list) => [...list, p]);
    setCustomPillar('');
  }

  async function shareInvite() {
    try {
      await Share.share({
        message: `Join ${companyName} on Noni. Get the app, sign in with the email your admin set up, and your first tasks will be waiting. noni://`,
      });
    } catch {
      // user dismissed the sheet
    }
  }

  async function finish() {
    if (!profile) return;
    setBusy(true);
    try {
      const tone = TONES[toneIndex].key;
      const sourceUrls = [
        website.trim(),
        instagramHandle.trim() && `https://instagram.com/${instagramHandle.trim().replace(/^@/, '')}`,
        tiktokHandle.trim() && `https://tiktok.com/@${tiktokHandle.trim().replace(/^@/, '')}`,
      ].filter((u): u is string => Boolean(u));

      await updateCompanyBasics(profile.company_id, companyName.trim(), website.trim());
      await saveBrandProfile(profile.company_id, {
        tone,
        audience: audience.trim(),
        products: products.trim(),
        buyingPath,
        pillars,
        sourceUrls,
      });
      await saveCompanySettings(profile.company_id, {
        instagramHandle: instagramHandle.trim(),
        tiktokHandle: tiktokHandle.trim(),
        cadencePerWeek: cadence,
        approvers,
        tone,
      });
      await completeOnboarding(profile.id);
      await refreshProfile();
      router.replace('/(admin)/calendar');
    } catch (e) {
      setBusy(false);
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    }
  }

  const back = step > 0 && step !== 3 ? () => setStep((s) => (s === 4 ? 2 : s - 1)) : undefined;
  const next = () => setStep((s) => s + 1);

  if (step === 0) {
    return (
      <Screen>
        <StepShell
          step={0}
          total={TOTAL_STEPS}
          title="Noni"
          subtitle="Noni studies your brand, plans your content, and fills your creators' queues. You just approve."
          primaryLabel="Get started"
          onPrimary={next}
        />
      </Screen>
    );
  }

  if (step === 1) {
    return (
      <Screen>
        <StepShell
          step={1}
          total={TOTAL_STEPS}
          title="Your company"
          onBack={back}
          primaryLabel="Next"
          onPrimary={next}
          primaryDisabled={!companyName.trim()}
        >
          <Text style={styles.label}>Company name</Text>
          <TextInput
            style={styles.input}
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="Acme Inc"
            autoCapitalize="words"
          />
          <Text style={styles.label}>Website</Text>
          <TextInput
            style={styles.input}
            value={website}
            onChangeText={setWebsite}
            placeholder="https://acme.com"
            autoCapitalize="none"
            keyboardType="url"
          />
        </StepShell>
      </Screen>
    );
  }

  if (step === 2) {
    return (
      <Screen>
        <StepShell
          step={2}
          total={TOTAL_STEPS}
          title="Your socials"
          subtitle="We study what your brand already posts."
          onBack={back}
          primaryLabel="Next"
          onPrimary={next}
        >
          <Text style={styles.label}>Instagram handle</Text>
          <TextInput
            style={styles.input}
            value={instagramHandle}
            onChangeText={setInstagramHandle}
            placeholder="@acme"
            autoCapitalize="none"
          />
          <Text style={styles.label}>TikTok handle</Text>
          <TextInput
            style={styles.input}
            value={tiktokHandle}
            onChangeText={setTiktokHandle}
            placeholder="@acme"
            autoCapitalize="none"
          />
        </StepShell>
      </Screen>
    );
  }

  if (step === 3) {
    return (
      <Screen style={styles.studyScreen}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.studyTitle}>Give us 60 seconds.</Text>
        <Text style={styles.studySubtitle}>We are studying your brand.</Text>
        <View style={styles.studyList}>
          {STUDY_PHASES.map((p, i) => (
            <Text
              key={p}
              style={[
                styles.studyPhase,
                i < studyPhase && styles.studyDone,
                i === studyPhase && styles.studyActive,
              ]}
            >
              {i < studyPhase ? '✓ ' : ''}
              {p}
            </Text>
          ))}
        </View>
      </Screen>
    );
  }

  if (step === 4) {
    return (
      <Screen>
        <StepShell
          step={4}
          total={TOTAL_STEPS}
          title="Who is your customer?"
          subtitle="We took a guess from your brand study. Confirm or edit."
          onBack={back}
          primaryLabel="Looks right"
          onPrimary={next}
          primaryDisabled={!audience.trim()}
        >
          <TextInput
            style={[styles.input, styles.multiline]}
            value={audience}
            onChangeText={setAudience}
            multiline
          />
        </StepShell>
      </Screen>
    );
  }

  if (step === 5) {
    return (
      <Screen>
        <StepShell
          step={5}
          total={TOTAL_STEPS}
          title="What are you selling?"
          subtitle="Confirm or edit."
          onBack={back}
          primaryLabel="Looks right"
          onPrimary={next}
          primaryDisabled={!products.trim()}
        >
          <TextInput
            style={[styles.input, styles.multiline]}
            value={products}
            onChangeText={setProducts}
            multiline
          />
        </StepShell>
      </Screen>
    );
  }

  if (step === 6) {
    return (
      <Screen>
        <StepShell
          step={6}
          total={TOTAL_STEPS}
          title="How do people buy?"
          onBack={back}
          primaryLabel="Next"
          onPrimary={next}
        >
          <OptionCard
            label="Link in bio"
            hint="Captions point at the profile link"
            selected={buyingPath === 'link_in_bio'}
            onPress={() => setBuyingPath('link_in_bio')}
          />
          <OptionCard
            label="DMs"
            hint="Captions invite people to message you"
            selected={buyingPath === 'dms'}
            onPress={() => setBuyingPath('dms')}
          />
          <OptionCard
            label="Website"
            hint="Captions send people to your site"
            selected={buyingPath === 'website'}
            onPress={() => setBuyingPath('website')}
          />
        </StepShell>
      </Screen>
    );
  }

  if (step === 7) {
    return (
      <Screen>
        <StepShell
          step={7}
          total={TOTAL_STEPS}
          title="Content pillars"
          subtitle="Tap to keep the ones that fit. Add your own."
          onBack={back}
          primaryLabel="Next"
          onPrimary={next}
          primaryDisabled={pillars.length === 0}
        >
          <View style={styles.chipWrap}>
            {suggestedPillars.map((p) => (
              <Chip
                key={p}
                label={p}
                selected={pillars.includes(p)}
                onPress={() => togglePillar(p)}
              />
            ))}
          </View>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, styles.addInput]}
              value={customPillar}
              onChangeText={setCustomPillar}
              placeholder="Add your own"
              onSubmitEditing={addCustomPillar}
              returnKeyType="done"
            />
            <Text style={styles.addBtn} onPress={addCustomPillar}>
              Add
            </Text>
          </View>
        </StepShell>
      </Screen>
    );
  }

  if (step === 8) {
    const tone = TONES[toneIndex];
    return (
      <Screen>
        <StepShell
          step={8}
          total={TOTAL_STEPS}
          title="How should it sound?"
          onBack={back}
          primaryLabel="Next"
          onPrimary={next}
        >
          <View style={styles.toneRow}>
            {TONES.map((t, i) => (
              <Chip
                key={t.key}
                label={t.label}
                selected={i === toneIndex}
                onPress={() => setToneIndex(i)}
              />
            ))}
          </View>
          <View style={styles.toneEnds}>
            <Text style={styles.toneEnd}>Professional</Text>
            <Text style={styles.toneEnd}>Unhinged</Text>
          </View>
          <View style={styles.captionCard}>
            <Text style={styles.captionLabel}>Example caption</Text>
            <Text style={styles.captionText}>
              {tone.caption(companyName.trim() || 'Your brand')}
            </Text>
          </View>
        </StepShell>
      </Screen>
    );
  }

  if (step === 9) {
    return (
      <Screen>
        <StepShell
          step={9}
          total={TOTAL_STEPS}
          title="How often?"
          subtitle="Posts per week for each creator."
          onBack={back}
          primaryLabel="Next"
          onPrimary={next}
        >
          <View style={styles.chipWrap}>
            {CADENCES.map((c) => (
              <Chip
                key={c}
                label={`${c} a week`}
                selected={cadence === c}
                onPress={() => setCadence(c)}
              />
            ))}
          </View>
        </StepShell>
      </Screen>
    );
  }

  if (step === 10) {
    return (
      <Screen>
        <StepShell
          step={10}
          total={TOTAL_STEPS}
          title="Who approves content?"
          onBack={back}
          primaryLabel="Next"
          onPrimary={next}
        >
          <OptionCard
            label="Just me"
            selected={approvers === 'just_me'}
            onPress={() => setApprovers('just_me')}
          />
          <OptionCard
            label="Me and others"
            hint="Invite more admins later in Settings"
            selected={approvers === 'me_plus_others'}
            onPress={() => setApprovers('me_plus_others')}
          />
        </StepShell>
      </Screen>
    );
  }

  if (step === 11) {
    return (
      <Screen>
        <StepShell
          step={11}
          total={TOTAL_STEPS}
          title="Invite your creators"
          subtitle="They record. Noni handles the rest."
          onBack={back}
          primaryLabel="Next"
          onPrimary={next}
        >
          <OptionCard
            label="Share invite link"
            hint="Opens your share sheet"
            selected={false}
            onPress={() => void shareInvite()}
          />
          <Text style={styles.hint}>You can invite more creators anytime from Settings.</Text>
        </StepShell>
      </Screen>
    );
  }

  return (
    <Screen>
      <StepShell
        step={12}
        total={TOTAL_STEPS}
        title="You are set."
        subtitle="Your calendar is where the AI filled queue shows up. Approve what you like, Noni does everything after."
        onBack={back}
        primaryLabel={busy ? 'Saving…' : 'Open my calendar'}
        onPrimary={() => void finish()}
        primaryDisabled={busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.ink,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  addInput: { flex: 1 },
  addBtn: { fontSize: 16, fontWeight: '700', color: colors.accent, padding: 8 },
  toneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  toneEnds: { flexDirection: 'row', justifyContent: 'space-between' },
  toneEnd: { fontSize: 12, fontWeight: '600', color: colors.muted },
  captionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    padding: 18,
    gap: 6,
    marginTop: 8,
  },
  captionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  captionText: { fontSize: 16, lineHeight: 22, color: colors.ink },
  hint: { fontSize: 14, color: colors.muted },
  studyScreen: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  studyTitle: { fontSize: 28, fontWeight: '700', color: colors.ink, marginTop: 12 },
  studySubtitle: { fontSize: 16, color: colors.muted },
  studyList: { marginTop: 24, gap: 14, alignItems: 'flex-start' },
  studyPhase: { fontSize: 17, fontWeight: '600', color: '#C9C4BA' },
  studyActive: { color: colors.ink },
  studyDone: { color: colors.accent },
});
