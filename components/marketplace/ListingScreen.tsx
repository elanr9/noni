// A campaign as a creator sees it, and the two steps that follow on the same
// screen: read and sign the company's agreement, then the receipt. Applying
// and signing are one act; an invite is signed the same way and lands the
// creator in the company at once.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import {
  coverColor,
  dayLabel,
  isFullName,
  missingToApply,
  postsPerDayLabel,
  spotsLabel,
  standing,
  type CreatorResume,
  type FeedListing,
} from '../../lib/marketplace';
import { color, radius, space, text } from '../../theme/v2';
import { Button, Card, Chip, Field, Icon, Press, Screen } from '../v2';
import { CampaignCover, PayBlock } from './CampaignCard';
import { ThreadSheet, type ThreadSource } from './MessageThread';
import { ContractText, FactRow, NicheTags, UnreadDot } from './parts';

export type SignResult = { status: string; start_date: string | null };

export interface ListingScreenProps {
  listing: FeedListing;
  resume: CreatorResume | null;
  /** The name on the account, offered as the signature. */
  defaultName: string;
  /** Start on the signing step (dev preview). */
  initialStep?: Step;
  /** One tap: nothing is signed until the company accepts. */
  onApply: () => Promise<SignResult>;
  /** Signs the agreement made for this creator (after an accept or an invite). */
  onSign: (signedName: string) => Promise<SignResult>;
  onWithdraw: () => Promise<void>;
  onEditProfile: () => void;
  /** Open the company's side of the app after joining. */
  onEnterCompany: () => void;
  onBack: () => void;
  /** Unread messages from the company on this application. */
  unread?: number;
  /** The thread was opened, so the dot goes. */
  onMessagesRead?: () => void;
  /** Where the thread reads and writes (dev preview); the server by default. */
  messages?: ThreadSource;
  /** Start with the thread open (dev preview). */
  initialThread?: boolean;
}

type Step = 'view' | 'sign' | 'done';

export function ListingScreen({ listing: l, resume, defaultName, initialStep = 'view', onApply, onSign, onWithdraw, onEditProfile, onEnterCompany, onBack, unread = 0, onMessagesRead, messages, initialThread = false }: ListingScreenProps) {
  const [step, setStep] = useState<Step>(initialStep);
  const [name, setName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignResult | null>(null);
  const [threadOpen, setThreadOpen] = useState(initialThread);
  const [seen, setSeen] = useState(false);

  const invited = l.application_status === 'invited';
  const offered = l.application_status === 'offered';
  // An invite or an accepted application carries this creator's own agreement.
  const signing = invited || offered;
  const missing = missingToApply(resume);
  const state = standing(l);

  const sign = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onSign(name.trim().replace(/\s+/g, ' '));
      setResult(r);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onApply();
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
          <Text style={[text.title, { fontSize: 28, lineHeight: 34, textAlign: 'center' }]}>{joined ? `You are in with ${l.company_name}` : 'Applied'}</Text>
          {joined && start ? (
            <Text style={[text.body, { color: color.grey4, textAlign: 'center', marginTop: 10 }]}>First post due {start}</Text>
          ) : null}
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
        footer={<Button label={busy ? 'Signing' : 'Sign and join'} disabled={!ready} onPress={sign} />}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: 24 }}>
            <CampaignCover campaign={l} round="all" style={{ marginBottom: 12 }} />
            <PayBlock terms={l} />
            <View style={{ backgroundColor: color.grey1, borderRadius: radius.card, padding: 16, marginBottom: 20 }}>
              <ContractText body={l.contract_body} />
            </View>

            <Text style={[text.meta, { marginBottom: 6 }]}>Your full legal name</Text>
            <SignatureField value={name} onChange={setName} />

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
  const closed = l.status !== 'open' && !signing;
  // One thread per application: there is one to open once the creator applied or was invited.
  const canMessage = !!l.application_id && (l.application_status === 'applied' || signing || l.application_status === 'accepted');
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
  } else if (signing) {
    footer = <Button label="Sign agreement" onPress={() => setStep('sign')} />;
  } else if (missing.length > 0) {
    footer = <Button label="Finish your profile to apply" variant="secondary" onPress={onEditProfile} />;
  } else if (!closed && l.spots_left !== 0) {
    footer = <Button label={busy ? 'Applying' : 'Apply'} disabled={busy} onPress={apply} />;
  }

  return (
    <Screen back={onBack} footer={footer}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: 24 }}>
        <CampaignCover campaign={l} round="all" style={{ marginBottom: 16 }} />
        <Text numberOfLines={1} style={text.meta}>{l.company_name}{l.company_website ? ` · ${l.company_website.replace(/^www\./, '')}` : ''}</Text>
        <Text style={[text.card, { fontSize: 24, lineHeight: 28, marginBottom: 12 }]}>{l.title}</Text>
        {state ? <Chip label={state.label} tone={state.tone} style={{ marginBottom: 12 }} /> : null}

        {l.application_status === 'accepted' && start ? (
          <Card style={{ backgroundColor: color.greenTint }}>
            <Text style={[text.row, { color: color.green }]}>First post due {start}</Text>
          </Card>
        ) : null}
        {offered ? (
          <Card onPress={() => setStep('sign')} style={{ backgroundColor: color.greenTint }}>
            <Text style={[text.row, { color: color.green }]}>{l.company_name} accepted you</Text>
          </Card>
        ) : null}
        {error && step === 'view' ? <Text style={[text.body, { color: color.pink, marginBottom: 12 }]}>{error}</Text> : null}
        {l.application_status === 'applied' ? (
          <Card style={{ backgroundColor: color.amberTint }}>
            <Text style={[text.row, { color: color.amber }]}>Waiting on {l.company_name}</Text>
          </Card>
        ) : null}
        {invited && l.invite_message ? (
          <Card style={{ backgroundColor: color.purpleTint }}>
            <Text style={[text.meta, { color: color.purple, fontWeight: '700', marginBottom: 4 }]}>{l.company_name} wrote</Text>
            <Text style={[text.body, { color: color.ink }]}>{l.invite_message}</Text>
          </Card>
        ) : null}

        {canMessage ? (
          <Card onPress={() => setThreadOpen(true)} accessibilityLabel={unread > 0 && !seen ? 'Messages, unread' : 'Messages'} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View>
              <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chat_bubble" size={20} color={coverColor(l.brand_color)} />
              </View>
              {unread > 0 && !seen ? <UnreadDot style={{ position: 'absolute', top: -3, right: -3 }} /> : null}
            </View>
            <Text style={[text.row, { flex: 1 }]}>Messages</Text>
            <Icon name="chevron_right" size={22} color={color.grey3} />
          </Card>
        ) : null}

        {l.tagline ? <Text style={[text.row, { fontWeight: '400', lineHeight: 24, marginBottom: 16 }]}>{l.tagline}</Text> : null}

        <PayBlock terms={l} />

        <Card>
          <Text style={[text.meta, { marginBottom: 4 }]}>The job</Text>
          <FactRow icon="movie">{postsPerDayLabel(l)}</FactRow>
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
          <ContractText body={l.contract_body} lines={signing ? 8 : 5} />
          {l.application_status === 'accepted' && l.signed_at ? (
            <Text style={[text.meta, { marginTop: 10 }]}>Signed {dayLabel(l.signed_at) ?? ''}</Text>
          ) : null}
        </Card>
      </ScrollView>
      <ThreadSheet
        applicationId={threadOpen && canMessage ? l.application_id : null}
        title={l.company_name}
        tint={l.brand_color}
        source={messages}
        onRead={() => {
          setSeen(true);
          onMessagesRead?.();
        }}
        onClose={() => setThreadOpen(false)}
      />
    </Screen>
  );
}

/** The typed name that stands as the signature. */
function SignatureField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field value={value} onChange={onChange} placeholder="First and last name" autoCapitalize="words" autoCorrect={false} maxLength={80} />
  );
}
