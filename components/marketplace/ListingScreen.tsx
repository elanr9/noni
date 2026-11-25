// A campaign as a creator sees it, and the two steps that follow on the same
// screen: read and sign the company's agreement, then the receipt. Applying
// and signing are one act; an invite is signed the same way and lands the
// creator in the company at once.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import {
  dayLabel,
  isFullName,
  missingToApply,
  spotsLabel,
  standing,
  type CreatorResume,
  type FeedListing,
} from '../../lib/marketplace';
import { VIEW_PAY_CAP_CENTS, VIEW_WINDOW_DAYS } from '../../lib/creator-pay';
import { money } from '../../lib/v2-format';
import { color, radius, space, text } from '../../theme/v2';
import { Button, Card, Chip, Field, Icon, Press, Screen } from '../v2';
import { CompanyMark, ContractText, FactRow, Figures, NicheTags, PAY_FIGURES, toneFor } from './parts';

export type SignResult = { status: string; start_date: string | null };

export interface ListingScreenProps {
  listing: FeedListing;
  resume: CreatorResume | null;
  /** The name on the account, offered as the signature. */
  defaultName: string;
  /** Start on the signing step (dev preview). */
  initialStep?: Step;
  onSign: (signedName: string, note: string) => Promise<SignResult>;
  onWithdraw: () => Promise<void>;
  onEditProfile: () => void;
  /** Open the company's side of the app after joining. */
  onEnterCompany: () => void;
  onBack: () => void;
}

type Step = 'view' | 'sign' | 'done';

export function ListingScreen({ listing: l, resume, defaultName, initialStep = 'view', onSign, onWithdraw, onEditProfile, onEnterCompany, onBack }: ListingScreenProps) {
  const [step, setStep] = useState<Step>(initialStep);
  const [name, setName] = useState(defaultName);
  const [note, setNote] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignResult | null>(null);

  const invited = l.application_status === 'invited';
  const missing = missingToApply(resume);
  const state = standing(l);

  const sign = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onSign(name.trim().replace(/\s+/g, ' '), note);
      setResult(r);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done' && result) {
    const joined = result.status === 'accepted';
    const start = dayLabel(result.start_date);
    return (
      <Screen white footer={joined ? <Button label={`Open ${l.company_name}`} onPress={onEnterCompany} /> : <Button label="Back" onPress={onBack} />}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: radius.pill, backgroundColor: color.greenTint, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Icon name="check" size={38} weight={700} color={color.green} />
          </View>
          <Text style={[text.title, { fontSize: 28, lineHeight: 34, textAlign: 'center' }]}>{joined ? `You are in with ${l.company_name}` : 'Signed and sent'}</Text>
          <Text style={[text.body, { color: color.grey4, textAlign: 'center', marginTop: 10 }]}>
            {joined
              ? `Your agreement is signed.${start ? ` Your first post is due ${start}.` : ''} Briefs are waiting for you.`
              : `${l.company_name} has your profile and your signed agreement. If they say yes you start right away, nothing more to sign.`}
          </Text>
        </View>
      </Screen>
    );
  }

  if (step === 'sign') {
    const ready = isFullName(name) && agreed && !busy;
    return (
      <Screen
        white
        back={() => setStep('view')}
        title={l.contract_title}
        footer={<Button label={busy ? 'Signing' : invited ? 'Sign and join' : 'Sign and apply'} disabled={!ready} onPress={sign} />}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <CompanyMark name={l.company_name} size={36} tone={toneFor(l.company_id)} />
              <Text style={[text.meta, { flex: 1 }]}>
                Between you and {l.company_name}. It takes effect {invited ? 'when you sign' : 'if they accept you'}.
              </Text>
            </View>
            <View style={{ backgroundColor: color.grey1, borderRadius: radius.card, padding: 16, marginBottom: 20 }}>
              <ContractText body={l.contract_body} />
            </View>

            <Text style={[text.meta, { marginBottom: 6 }]}>Your full legal name</Text>
            <SignatureField value={name} onChange={setName} />
            {!invited ? (
              <>
                <Text style={[text.meta, { marginBottom: 6, marginTop: 4 }]}>Why you (optional)</Text>
                <Field value={note} onChange={setNote} multiline maxLength={600} placeholder={`One or two lines for ${l.company_name}`} style={{ marginBottom: 0 }} />
              </>
            ) : null}

            <Press
              onPress={() => setAgreed((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 }}
            >
              <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: agreed ? color.blue : color.card, borderWidth: agreed ? 0 : 2, borderColor: color.grey3, alignItems: 'center', justifyContent: 'center' }}>
                {agreed ? <Icon name="check" size={18} weight={700} color={color.white} /> : null}
              </View>
              <Text style={[text.body, { flex: 1 }]}>I read this agreement and I agree to it. Typing my name is my signature.</Text>
            </Press>
            {error ? <Text style={[text.body, { color: color.pink }]}>{error}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // ------------------------------------------------------------- the campaign
  const spots = spotsLabel(l);
  const start = dayLabel(l.start_date);
  const closed = l.status !== 'open' && !invited;
  let footer: React.ReactNode = null;
  if (l.application_status === 'accepted' || l.is_member) {
    footer = <Button label={`Open ${l.company_name}`} onPress={onEnterCompany} />;
  } else if (l.application_status === 'applied') {
    footer = (
      <Button
        label={busy ? 'Withdrawing' : 'Withdraw application'}
        variant="quiet"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await onWithdraw();
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  } else if (missing.length > 0) {
    footer = <Button label="Finish your profile to apply" variant="secondary" onPress={onEditProfile} />;
  } else if (!closed && l.spots_left !== 0) {
    footer = <Button label={invited ? 'Read and sign to join' : 'Apply'} onPress={() => setStep('sign')} />;
  } else if (invited) {
    footer = <Button label="Read and sign to join" onPress={() => setStep('sign')} />;
  }

  return (
    <Screen back={onBack} footer={footer}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <CompanyMark name={l.company_name} size={60} tone={toneFor(l.company_id)} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={text.meta}>{l.company_name}{l.company_website ? ` · ${l.company_website.replace(/^www\./, '')}` : ''}</Text>
            <Text style={[text.card, { fontSize: 24, lineHeight: 28 }]}>{l.title}</Text>
          </View>
        </View>
        {state ? <Chip label={state.label} tone={state.tone} style={{ marginBottom: 12 }} /> : null}

        {l.application_status === 'accepted' && start ? (
          <Card style={{ backgroundColor: color.greenTint }}>
            <Text style={[text.row, { color: color.green }]}>First post due {start}</Text>
            <Text style={[text.meta, { color: color.green }]}>Your agreement is signed. Open {l.company_name} to see your briefs.</Text>
          </Card>
        ) : null}
        {l.application_status === 'applied' ? (
          <Card style={{ backgroundColor: color.amberTint }}>
            <Text style={[text.row, { color: color.amber }]}>Waiting on {l.company_name}</Text>
            <Text style={[text.meta, { color: color.amber }]}>You signed {dayLabel(l.signed_at) ?? 'already'}. If they say yes you start with nothing more to sign.</Text>
          </Card>
        ) : null}
        {invited && l.invite_message ? (
          <Card style={{ backgroundColor: color.purpleTint }}>
            <Text style={[text.meta, { color: color.purple, fontWeight: '700', marginBottom: 4 }]}>{l.company_name} wrote</Text>
            <Text style={[text.body, { color: color.ink }]}>{l.invite_message}</Text>
          </Card>
        ) : null}

        {l.tagline ? <Text style={[text.row, { fontWeight: '400', lineHeight: 24, marginBottom: 16 }]}>{l.tagline}</Text> : null}

        <Card>
          <Text style={[text.meta, { marginBottom: 10 }]}>What you earn</Text>
          <Figures items={PAY_FIGURES} />
          <Text style={[text.meta, { marginTop: 12 }]}>
            View pay counts the first {VIEW_WINDOW_DAYS} days, up to {money(VIEW_PAY_CAP_CENTS)} a post. Paid to your bank every Sunday.
          </Text>
        </Card>

        <Card>
          <Text style={[text.meta, { marginBottom: 4 }]}>The job</Text>
          <FactRow icon="movie">{`${l.posts_per_week} posts a week from briefs they give you`}</FactRow>
          {l.platforms.length > 0 ? <FactRow icon="smartphone">{`Posted on ${l.platforms.map((p) => (p === 'tiktok' ? 'TikTok' : p === 'instagram' ? 'Instagram' : p)).join(' and ')}`}</FactRow> : null}
          <FactRow icon="schedule">{l.start_days === 0 ? 'First post due the day you are accepted' : `First post due within ${l.start_days} ${l.start_days === 1 ? 'day' : 'days'} of being accepted`}</FactRow>
          {spots ? <FactRow icon="group">{spots}</FactRow> : null}
          {l.min_age > 18 ? <FactRow icon="person">{`${l.min_age} and older`}</FactRow> : null}
        </Card>

        {l.about ? (
          <Card>
            <Text style={[text.meta, { marginBottom: 6 }]}>About {l.company_name}</Text>
            <Text style={text.body}>{l.about}</Text>
          </Card>
        ) : null}

        {l.requirements || l.niches.length > 0 ? (
          <Card>
            <Text style={[text.meta, { marginBottom: 8 }]}>Who they want</Text>
            {l.requirements ? <Text style={[text.body, { marginBottom: l.niches.length > 0 ? 12 : 0 }]}>{l.requirements}</Text> : null}
            <NicheTags niches={l.niches} highlight={resume?.niches ?? []} max={8} />
          </Card>
        ) : null}

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="description" size={20} color={color.grey4} />
            <Text style={[text.row, { flex: 1 }]}>{l.contract_title}</Text>
          </View>
          <ContractText body={l.contract_body} lines={5} />
          <Text style={[text.meta, { marginTop: 10 }]}>
            {l.application_status === 'applied' || l.application_status === 'accepted'
              ? 'You signed this.'
              : 'You read and sign this when you apply. Get accepted and you start, no back and forth.'}
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

/** The typed name that stands as the signature. */
function SignatureField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field value={value} onChange={onChange} placeholder="First and last name" autoCapitalize="words" autoCorrect={false} maxLength={80} />
  );
}
