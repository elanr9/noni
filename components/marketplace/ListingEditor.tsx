// The company's campaign as creators see it, and the agreement they sign to
// apply. One screen: what you want, the terms, and the switch that opens it.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { NICHES, PLATFORMS, type Listing } from '../../lib/marketplace';
import { color, space, text } from '../../theme/v2';
import { Button, Card, Field, Screen, Toggle } from '../v2';
import { PAY_LINE, Pills } from './parts';

export type ListingPatch = Partial<Omit<Listing, 'id' | 'company_id' | 'contract_version' | 'opened_at'>>;

export interface ListingEditorProps {
  /** Null while the first save has not created it yet. */
  listing: Listing | null;
  companyName: string;
  onSave: (patch: ListingPatch) => Promise<void>;
  onBack: () => void;
}

const digits = (v: string) => v.replace(/[^0-9]/g, '');

export function ListingEditor({ listing, companyName, onSave, onBack }: ListingEditorProps) {
  const [title, setTitle] = useState(listing?.title ?? `${companyName} creators`);
  const [tagline, setTagline] = useState(listing?.tagline ?? '');
  const [about, setAbout] = useState(listing?.about ?? '');
  const [requirements, setRequirements] = useState(listing?.requirements ?? '');
  const [niches, setNiches] = useState<string[]>(listing?.niches ?? []);
  const [platforms, setPlatforms] = useState<string[]>(listing?.platforms ?? ['tiktok', 'instagram']);
  const [perWeek, setPerWeek] = useState(String(listing?.posts_per_week ?? 3));
  const [spots, setSpots] = useState(listing?.spots != null ? String(listing.spots) : '');
  const [startDays, setStartDays] = useState(String(listing?.start_days ?? 3));
  const [minAge, setMinAge] = useState(String(listing?.min_age ?? 18));
  const [contractTitle, setContractTitle] = useState(listing?.contract_title ?? 'Creator agreement');
  const [contract, setContract] = useState(listing?.contract_body ?? '');
  const [open, setOpen] = useState(listing?.status === 'open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void) => (k: string) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        tagline: tagline.trim(),
        about: about.trim(),
        requirements: requirements.trim(),
        niches,
        platforms,
        posts_per_week: Math.max(1, Number(perWeek) || 3),
        spots: spots ? Math.max(1, Number(spots)) : null,
        start_days: Math.min(60, Number(startDays) || 0),
        min_age: Math.max(18, Number(minAge) || 18),
        contract_title: contractTitle.trim(),
        // A new listing gets the starting agreement from the server; send the text only once there is one.
        ...(listing ? { contract_body: contract } : {}),
        status: listing ? (open ? 'open' : listing.status === 'open' ? 'paused' : listing.status) : 'draft',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen close={!listing} back={listing ? onBack : undefined} title="Your campaign" footer={<Button label={busy ? 'Saving' : listing ? 'Save' : 'Next: the agreement'} disabled={busy || !title.trim()} onPress={save} />}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: 24 }}>
          {listing ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={text.row}>Open to applications</Text>
                <Text style={text.meta}>{open ? 'Every creator on Noni can see this and apply.' : 'Hidden from creators. You can still reach out to them.'}</Text>
              </View>
              <Toggle on={open} onChange={setOpen} accessibilityLabel="Open to applications" />
            </Card>
          ) : (
            <Text style={[text.body, { color: color.grey4, marginBottom: 16 }]}>
              This is what creators see in the Market. Keep it short. You write the agreement next and open it when you are ready.
            </Text>
          )}

          <Group title="The pitch">
            <Field label="Campaign name" value={title} onChange={setTitle} maxLength={80} />
            <Field label="One line that sells it" value={tagline} onChange={setTagline} maxLength={140} placeholder="Make videos about the app that writes your essays" />
            <Field label="About you" value={about} onChange={setAbout} multiline maxLength={2000} placeholder="What you sell and who it is for" style={{ marginBottom: 0 }} />
          </Group>

          <Group title="Who you want">
            <Field label="In your words" value={requirements} onChange={setRequirements} multiline maxLength={1000} placeholder="College students who post study content and are comfortable on camera" />
            <Text style={[text.meta, { marginBottom: 8 }]}>Niches. The AI ranks creators on these.</Text>
            <Pills options={NICHES} value={niches} onToggle={toggle(niches, setNiches)} />
            <Text style={[text.meta, { marginTop: 16, marginBottom: 8 }]}>Where they post</Text>
            <Pills options={PLATFORMS} value={platforms} onToggle={toggle(platforms, setPlatforms)} />
          </Group>

          <Group title="The job">
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="Posts a week" value={perWeek} onChange={(v) => setPerWeek(digits(v).slice(0, 2))} keyboardType="number-pad" style={{ flex: 1 }} />
              <Field label="Creators wanted" value={spots} onChange={(v) => setSpots(digits(v).slice(0, 4))} keyboardType="number-pad" placeholder="No limit" style={{ flex: 1 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="First post due, days after accepted" value={startDays} onChange={(v) => setStartDays(digits(v).slice(0, 2))} keyboardType="number-pad" style={{ flex: 1, marginBottom: 0 }} />
              <Field label="Minimum age" value={minAge} onChange={(v) => setMinAge(digits(v).slice(0, 2))} keyboardType="number-pad" style={{ width: 120, marginBottom: 0 }} />
            </View>
            <Text style={[text.meta, { marginTop: 10 }]}>Creators earn {PAY_LINE} on every campaign.</Text>
          </Group>

          {listing ? (
            <Group title="The agreement">
              <Text style={[text.meta, { marginBottom: 12 }]}>
                Creators read and sign this when they apply, so anyone you accept is already under contract. This is a starting point, not legal advice: have your lawyer read it. Changes apply to people who sign from now on.
              </Text>
              <Field label="Title" value={contractTitle} onChange={setContractTitle} maxLength={80} />
              <Field label="Terms" value={contract} onChange={setContract} multiline style={{ marginBottom: 0 }} />
            </Group>
          ) : null}
          {error ? <Text style={[text.body, { color: color.pink }]}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={[text.card, { marginBottom: 12 }]}>{title}</Text>
      {children}
    </View>
  );
}
