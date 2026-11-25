// The company's campaign: the card creators see, what the job is, what it
// pays and the agreement they sign. Noni writes the first draft; here the
// company changes it. The card at the top redraws as they type. Six tabs,
// one Save.
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { BRAND_COLORS, NICHES, PAY_FLOORS, PLATFORMS, coverColor, type CardCampaign, type Listing } from '../../lib/marketplace';
import type { ListingPatch } from '../../lib/marketplace-api';
import { color, num, radius, shadow, space, text } from '../../theme/v2';
import { Button, Field, Icon, Press, Screen, TabPane, Toggle, tap } from '../v2';
import { CampaignCard } from './CampaignCard';
import { Pills } from './parts';

export type { ListingPatch };
export type EditorTab = 'card' | 'about' | 'creators' | 'job' | 'pay' | 'terms';

export interface ListingEditorProps {
  listing: Listing;
  companyName: string;
  logoPath?: string | null;
  /** The tab it opens on (dev preview). */
  startTab?: EditorTab;
  onSave: (patch: ListingPatch) => Promise<void>;
  onBack: () => void;
}

const TABS: { key: EditorTab; label: string }[] = [
  { key: 'card', label: 'Card' },
  { key: 'about', label: 'About' },
  { key: 'creators', label: 'Creators' },
  { key: 'job', label: 'Job' },
  { key: 'pay', label: 'Pay' },
  { key: 'terms', label: 'Terms' },
];

const PREVIEW_SCALE = 0.55;

const digits = (v: string) => v.replace(/[^0-9]/g, '');
/** Digits with at most one point and two decimals. */
const dollars = (v: string) => {
  const [whole = '', ...rest] = v.replace(/[^0-9.]/g, '').split('.');
  return rest.length > 0 ? `${whole.slice(0, 5)}.${rest.join('').slice(0, 2)}` : whole.slice(0, 5);
};
const fromCents = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
const toCents = (v: string, floor = 0) => Math.max(floor, Math.round((Number(v) || 0) * 100));

export function ListingEditor({ listing, companyName, logoPath, startTab = 'card', onSave, onBack }: ListingEditorProps) {
  const [tab, setTab] = useState<EditorTab>(startTab);
  const [title, setTitle] = useState(listing.title);
  const [tagline, setTagline] = useState(listing.tagline ?? '');
  const [about, setAbout] = useState(listing.about ?? '');
  const [requirements, setRequirements] = useState(listing.requirements ?? '');
  const [niches, setNiches] = useState<string[]>(listing.niches);
  const [platforms, setPlatforms] = useState<string[]>(listing.platforms);
  const [brand, setBrand] = useState<string | null>(listing.brand_color ? coverColor(listing.brand_color) : null);
  const [dayMin, setDayMin] = useState(listing.posts_per_day_min);
  const [dayMax, setDayMax] = useState(Math.max(listing.posts_per_day_min, listing.posts_per_day_max));
  const [spots, setSpots] = useState(listing.spots != null ? String(listing.spots) : '');
  const [startDays, setStartDays] = useState(String(listing.start_days));
  const [minAge, setMinAge] = useState(String(listing.min_age));
  const [video, setVideo] = useState(fromCents(listing.video_post_cents));
  const [slideshow, setSlideshow] = useState(fromCents(listing.static_post_cents));
  const [minViews, setMinViews] = useState(String(listing.min_views));
  const [perK, setPerK] = useState(fromCents(listing.cents_per_1k_views));
  const [cap, setCap] = useState(fromCents(listing.view_pay_cap_cents));
  const [contractTitle, setContractTitle] = useState(listing.contract_title);
  const [contract, setContract] = useState(listing.contract_body);
  const [open, setOpen] = useState(listing.status === 'open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const toggle = (list: string[], set: (v: string[]) => void) => (k: string) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  const terms = {
    posts_per_day_min: dayMin,
    posts_per_day_max: dayMax,
    video_post_cents: toCents(video, PAY_FLOORS.video_post_cents),
    static_post_cents: toCents(slideshow, PAY_FLOORS.static_post_cents),
    cents_per_1k_views: toCents(perK, PAY_FLOORS.cents_per_1k_views),
    view_pay_cap_cents: toCents(cap),
    min_views: Number(minViews) || 0,
  };
  const spotCount = spots ? Math.max(1, Number(spots)) : null;
  const card: CardCampaign = {
    ...terms,
    company_name: companyName,
    logo_path: logoPath ?? null,
    brand_color: brand,
    title: title.trim() || companyName,
    tagline: tagline.trim() || null,
    niches,
    spots: spotCount,
    spots_left: spotCount,
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        ...terms,
        title: title.trim(),
        tagline: tagline.trim(),
        about: about.trim(),
        requirements: requirements.trim(),
        niches,
        platforms,
        ...(brand ? { brand_color: brand } : {}),
        spots: spotCount,
        start_days: Math.min(60, Number(startDays) || 0),
        min_age: Math.max(18, Number(minAge) || 18),
        contract_title: contractTitle.trim(),
        // An agreement nobody edited keeps following the campaign's numbers on the server.
        ...(contract !== listing.contract_body ? { contract_body: contract } : {}),
        status: open ? 'open' : listing.status === 'open' ? 'paused' : listing.status,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const previewW = box.w * PREVIEW_SCALE;

  return (
    <Screen back={onBack} title="Your campaign" footer={<Button label={busy ? 'Saving' : 'Save'} disabled={busy || !title.trim()} onPress={save} />}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: space.screen }}>
          {/* The real card, drawn full size and scaled down, so it is exactly what creators get. */}
          <View
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              setBox((b) => (b.w === w ? b : { ...b, w }));
            }}
            style={{ flexDirection: 'row', alignItems: 'center', height: box.h ? box.h * PREVIEW_SCALE : 170, marginBottom: 14 }}
          >
            <View pointerEvents="none" style={{ width: previewW, alignSelf: 'stretch' }}>
              {box.w > 0 ? (
                <View
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    setBox((b) => (b.h === h ? b : { ...b, h }));
                  }}
                  style={{ position: 'absolute', top: 0, left: 0, width: box.w, transformOrigin: 'top left', transform: [{ scale: PREVIEW_SCALE }] }}
                >
                  <CampaignCard campaign={card} style={{ marginBottom: 0 }} />
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1, paddingLeft: 16, gap: 10 }}>
              <Text style={text.row}>Open to creators</Text>
              <Toggle
                on={open}
                onChange={(v) => {
                  setOpen(v);
                  setError(null);
                }}
                accessibilityLabel="Open to creators"
              />
            </View>
          </View>
          <TabRow value={tab} onChange={setTab} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: space.screen, paddingTop: 18, paddingBottom: 16 }}
        >
          <TabPane k={tab}>
            {tab === 'card' ? (
              <>
                <Field label="Campaign name" value={title} onChange={setTitle} maxLength={80} />
                <Field label="One line" value={tagline} onChange={setTagline} maxLength={140} placeholder="Make videos about the app that writes your essays" />
                <Label>Color</Label>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {BRAND_COLORS.map((hex) => {
                    const on = brand === hex;
                    return (
                      <Press
                        key={hex}
                        onPress={() => setBrand(hex)}
                        haptic={!on}
                        hitSlop={3}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`Color ${hex}`}
                        style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: hex, alignItems: 'center', justifyContent: 'center' }}
                      >
                        {on ? (
                          <Animated.View entering={ZoomIn.springify().damping(11)}>
                            <Icon name="check" size={20} weight={700} color={color.white} />
                          </Animated.View>
                        ) : null}
                      </Press>
                    );
                  })}
                </View>
              </>
            ) : null}

            {tab === 'about' ? (
              <>
                <Field label="About you" value={about} onChange={setAbout} multiline maxLength={2000} placeholder="What you sell and who it is for" />
                <Field label="Who you want" value={requirements} onChange={setRequirements} multiline maxLength={1000} placeholder="College students who post study content" style={{ marginBottom: 0 }} />
              </>
            ) : null}

            {tab === 'creators' ? (
              <>
                <Label first>Niches</Label>
                <Pills options={NICHES} value={niches} onToggle={toggle(niches, setNiches)} />
              </>
            ) : null}

            {tab === 'job' ? (
              <>
                <Label first>Posts a day</Label>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                  <Stepper
                    label="From"
                    value={dayMin}
                    onChange={(v) => {
                      setDayMin(v);
                      if (v > dayMax) setDayMax(v);
                    }}
                  />
                  <Stepper
                    label="To"
                    value={dayMax}
                    onChange={(v) => {
                      setDayMax(v);
                      if (v < dayMin) setDayMin(v);
                    }}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Field label="Creators wanted" value={spots} onChange={(v) => setSpots(digits(v).slice(0, 4))} keyboardType="number-pad" placeholder="No limit" style={{ flex: 1 }} />
                  <Field label="Minimum age" value={minAge} onChange={(v) => setMinAge(digits(v).slice(0, 2))} keyboardType="number-pad" style={{ flex: 1 }} />
                </View>
                <Field label="Days to first post" value={startDays} onChange={(v) => setStartDays(digits(v).slice(0, 2))} keyboardType="number-pad" />
                <Label>Where they post</Label>
                <Pills options={PLATFORMS} value={platforms} onToggle={toggle(platforms, setPlatforms)} />
              </>
            ) : null}

            {tab === 'pay' ? (
              <>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Amount label="Per video" value={video} onChange={setVideo} floorCents={PAY_FLOORS.video_post_cents} />
                  <Amount label="Per slideshow" value={slideshow} onChange={setSlideshow} floorCents={PAY_FLOORS.static_post_cents} />
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Amount label="Per 1,000 views" value={perK} onChange={setPerK} floorCents={PAY_FLOORS.cents_per_1k_views} />
                  <Amount label="View pay cap" value={cap} onChange={setCap} floorCents={0} />
                </View>
                <Field label="Minimum views" value={minViews} onChange={(v) => setMinViews(digits(v).slice(0, 7))} onBlur={() => setMinViews((v) => String(Number(v) || 0))} keyboardType="number-pad" style={{ marginBottom: 0 }} />
              </>
            ) : null}

            {tab === 'terms' ? (
              <>
                <Field label="Title" value={contractTitle} onChange={setContractTitle} maxLength={80} />
                <View style={{ height: 250, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: color.card, borderRadius: radius.card, ...shadow.card }}>
                  <TextInput
                    value={contract}
                    onChangeText={setContract}
                    multiline
                    accessibilityLabel="Agreement"
                    placeholderTextColor={color.grey3}
                    style={{ flex: 1, padding: 0, margin: 0, fontSize: 15, lineHeight: 20, color: color.ink, textAlignVertical: 'top' }}
                  />
                </View>
              </>
            ) : null}

            {error ? <Text style={[text.body, { color: color.pink, marginTop: 12 }]}>{error}</Text> : null}
          </TabPane>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function TabRow({ value, onChange }: { value: EditorTab; onChange: (t: EditorTab) => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: color.grey2 }}>
      {TABS.map((t) => {
        const on = t.key === value;
        return (
          <Press
            key={t.key}
            onPress={() => {
              if (!on) onChange(t.key);
            }}
            haptic={!on}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ height: 42, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: on ? '700' : '600', color: on ? color.blueDeep : color.grey4 }}>{t.label}</Text>
            {on ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, borderRadius: 2, backgroundColor: color.blue }} /> : null}
          </Press>
        );
      })}
    </View>
  );
}

function Label({ children, first }: { children: string; first?: boolean }) {
  return <Text style={[text.meta, { marginTop: first ? 0 : 8, marginBottom: 8 }]}>{children}</Text>;
}

/** 1 to 7, one tap at a time. */
function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const step = (by: number) => {
    const next = Math.min(7, Math.max(1, value + by));
    if (next !== value) onChange(next);
  };
  return (
    <View style={{ flex: 1, height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 14, paddingRight: 8, backgroundColor: color.card, borderRadius: radius.card, ...shadow.card }}>
      <Text style={[text.meta, { flex: 1 }]}>{label}</Text>
      <StepButton icon="remove" label={`${label}, one less`} disabled={value <= 1} onPress={() => step(-1)} />
      <Animated.Text key={value} entering={ZoomIn.springify().damping(12)} style={[num.sm, { width: 22, textAlign: 'center' }]}>
        {value}
      </Animated.Text>
      <StepButton icon="add" label={`${label}, one more`} disabled={value >= 7} onPress={() => step(1)} />
    </View>
  );
}

function StepButton({ icon, label, disabled, onPress }: { icon: 'add' | 'remove'; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} disabled={disabled} hitSlop={4} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={{ width: 34, height: 34, borderRadius: radius.pill, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <Icon name={icon} size={20} weight={700} color={color.ink} />
    </Press>
  );
}

/** A dollar amount; leaving the field lifts it to the floor. */
function Amount({ label, value, onChange, floorCents }: { label: string; value: string; onChange: (v: string) => void; floorCents: number }): ReactNode {
  return (
    <View style={{ flex: 1, marginBottom: 12 }}>
      <Text style={[text.meta, { marginBottom: 6 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: color.card, borderRadius: radius.card, ...shadow.card }}>
        <Text style={{ fontSize: 15, lineHeight: 20, color: color.grey4 }}>$</Text>
        <TextInput
          value={value}
          onChangeText={(v) => onChange(dollars(v))}
          onBlur={() => {
            const cents = toCents(value, floorCents);
            if (cents !== Math.round((Number(value) || 0) * 100)) tap();
            onChange(fromCents(cents));
          }}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          style={{ flex: 1, padding: 0, margin: 0, fontSize: 15, lineHeight: 20, color: color.ink, fontVariant: ['tabular-nums'] }}
        />
      </View>
    </View>
  );
}
