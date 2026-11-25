// A creator's profile: what companies see, sort and filter on. The web sign
// up chat fills most of it; here (and on the website at /profile) the creator
// changes anything. Five tabs, nothing scrolls.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import {
  COUNTRIES,
  GENDERS,
  LANGUAGES,
  MAX_LANGUAGES,
  MAX_NICHES,
  MAX_VIDEOS,
  NICHES,
  ageFromBirthYear,
  birthYearFromAge,
  type CreatorResume,
  type Gender,
} from '../../lib/marketplace';
import { color, radius, shadow, space, text } from '../../theme/v2';
import { PlatformBadge } from '../creator/v2/setup/PlatformBadge';
import { Button, Field, Icon, Screen, Toggle, UnderlineTabs, tap } from '../v2';
import { Pills } from './parts';

export type ResumePatch = Partial<Omit<CreatorResume, 'user_id'>>;

export interface ResumeEditorProps {
  resume: CreatorResume | null;
  onSave: (patch: ResumePatch) => Promise<void>;
  /** Pushed screen: back arrow, and leaves after saving. Without it the screen is a tab root. */
  onBack?: () => void;
  /** The tab it opens on (dev preview). */
  startTab?: Tab;
}

export type Tab = 'you' | 'languages' | 'interests' | 'socials' | 'videos';

const digits = (v: string) => v.replace(/[^0-9]/g, '');
const handle = (v: string) => v.trim().replace(/^@+/, '').replace(/\s+/g, '');
const isLink = (u: string) => /^https?:\/\/\S+\.\S+/i.test(u.trim());

function toggleCapped(list: string[], key: string, max: number): string[] | null {
  if (list.includes(key)) return list.filter((x) => x !== key);
  if (list.length >= max) return null;
  return [...list, key];
}

export function ResumeEditor({ resume, onSave, onBack, startTab = 'you' }: ResumeEditorProps) {
  const startAge = ageFromBirthYear(resume?.birth_year);
  const startCountry = resume?.country ?? '';
  const known = COUNTRIES.some((c) => c.key === startCountry);

  const [tab, setTab] = useState<Tab>(startTab);
  const [age, setAge] = useState(startAge ? String(startAge) : '');
  const [gender, setGender] = useState<Gender | null>(resume?.gender ?? null);
  const [country, setCountry] = useState(known ? startCountry : startCountry ? 'other' : '');
  const [otherCountry, setOtherCountry] = useState(known ? '' : startCountry);
  const [city, setCity] = useState(resume?.location ?? '');
  const [languages, setLanguages] = useState<string[]>(resume?.languages ?? []);
  const [niches, setNiches] = useState<string[]>((resume?.niches ?? []).slice(0, MAX_NICHES));
  const [tiktok, setTiktok] = useState(resume?.tiktok ?? '');
  const [tiktokF, setTiktokF] = useState(resume?.tiktok_followers != null ? String(resume.tiktok_followers) : '');
  const [instagram, setInstagram] = useState(resume?.instagram ?? '');
  const [instagramF, setInstagramF] = useState(resume?.instagram_followers != null ? String(resume.instagram_followers) : '');
  const [youtube, setYoutube] = useState(resume?.youtube ?? '');
  const [youtubeF, setYoutubeF] = useState(resume?.youtube_followers != null ? String(resume.youtube_followers) : '');
  const [videos, setVideos] = useState<string[]>(() => {
    const v = (resume?.portfolio ?? []).map((p) => p.url).slice(0, MAX_VIDEOS);
    while (v.length < MAX_VIDEOS) v.push('');
    return v;
  });
  const [listed, setListed] = useState(resume?.listed ?? true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pop = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  const ageNum = age ? Number(age) : null;
  const ageBad = ageNum !== null && (ageNum < 13 || ageNum > 100);
  const badVideo = videos.some((v) => v.trim() !== '' && !isLink(v));

  const dirty = () => {
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    if (busy) return;
    if (ageBad) {
      setTab('you');
      setError('Check your age');
      return;
    }
    if (badVideo) {
      setTab('videos');
      setError('Paste a full link');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({
        birth_year: ageNum !== null ? birthYearFromAge(ageNum) : null,
        gender,
        country: country === 'other' ? otherCountry.trim() || null : country || null,
        location: city.trim() || null,
        languages,
        niches,
        tiktok: handle(tiktok) || null,
        tiktok_followers: tiktokF ? Number(tiktokF) : null,
        instagram: handle(instagram) || null,
        instagram_followers: instagramF ? Number(instagramF) : null,
        youtube: handle(youtube) || null,
        youtube_followers: youtubeF ? Number(youtubeF) : null,
        portfolio: videos.map((u) => u.trim()).filter(isLink).map((url) => ({ url })),
        listed,
      });
      tap();
      setSaved(true);
      pop.set(withSequence(withSpring(1.06, { damping: 8, stiffness: 400 }), withSpring(1, { damping: 12, stiffness: 300 })));
      if (onBack) setTimeout(onBack, 550);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const pick = (list: string[], set: (v: string[]) => void, key: string, max: number) => {
    const next = toggleCapped(list, key, max);
    if (!next) return;
    set(next);
    dirty();
  };

  const tabs = [
    { key: 'you' as const, label: 'You' },
    { key: 'languages' as const, label: 'Languages' },
    { key: 'interests' as const, label: 'Interests' },
    { key: 'socials' as const, label: 'Socials' },
    { key: 'videos' as const, label: 'Videos' },
  ];

  const saveButton = (
    <Animated.View style={[{ flex: 1, flexDirection: 'row' }, popStyle]}>
      <Button label={busy ? 'Saving' : saved ? 'Saved' : 'Save'} icon={saved ? 'check' : undefined} disabled={busy} onPress={save} />
    </Animated.View>
  );

  return (
    <Screen back={onBack} title="Profile" tabRoot={!onBack} footer={onBack ? saveButton : undefined}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingHorizontal: space.screen }}>
        <UnderlineTabs items={tabs} value={tab} onChange={setTab} size={15} style={{ gap: 14, justifyContent: 'space-between', marginBottom: 20 }} />

        <View style={{ flex: 1 }}>
          {tab === 'you' ? (
            <View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Field label="Age" value={age} onChange={(v) => (setAge(digits(v).slice(0, 3)), dirty())} keyboardType="number-pad" placeholder="22" style={{ width: 96 }} />
                <Field label="City" value={city} onChange={(v) => (setCity(v), dirty())} placeholder="Austin" maxLength={80} style={{ flex: 1 }} />
              </View>
              <Label>Country</Label>
              <Pills
                options={[...COUNTRIES, { key: 'other', label: 'Other' }]}
                value={country ? [country] : []}
                onToggle={(k) => {
                  setCountry(country === k ? '' : k);
                  dirty();
                }}
              />
              {country === 'other' ? (
                <Field value={otherCountry} onChange={(v) => (setOtherCountry(v), dirty())} placeholder="Your country" maxLength={60} style={{ marginTop: 12, marginBottom: 0 }} />
              ) : null}
              <Label>Gender</Label>
              <Pills
                options={GENDERS}
                value={gender ? [gender] : []}
                onToggle={(k) => {
                  setGender(gender === k ? null : k);
                  dirty();
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, paddingHorizontal: 16, height: 56, backgroundColor: color.card, borderRadius: radius.card, ...shadow.card }}>
                <Text style={[text.row, { flex: 1 }]}>Show me to brands</Text>
                <Toggle on={listed} onChange={(v) => (setListed(v), dirty())} accessibilityLabel="Show me to brands" />
              </View>
            </View>
          ) : null}

          {tab === 'languages' ? (
            <View>
              <Count n={languages.length} max={MAX_LANGUAGES} />
              <Pills options={LANGUAGES} value={languages} onToggle={(k) => pick(languages, setLanguages, k, MAX_LANGUAGES)} />
            </View>
          ) : null}

          {tab === 'interests' ? (
            <View>
              <Count n={niches.length} max={MAX_NICHES} />
              <Pills options={NICHES} value={niches} onToggle={(k) => pick(niches, setNiches, k, MAX_NICHES)} />
            </View>
          ) : null}

          {tab === 'socials' ? (
            <View style={{ gap: 12 }}>
              <SocialRow mark={<PlatformBadge platform="tiktok" size={36} />} name="TikTok" handle={tiktok} onHandle={(v) => (setTiktok(v), dirty())} followers={tiktokF} onFollowers={(v) => (setTiktokF(digits(v).slice(0, 9)), dirty())} />
              <SocialRow mark={<PlatformBadge platform="instagram" size={36} />} name="Instagram" handle={instagram} onHandle={(v) => (setInstagram(v), dirty())} followers={instagramF} onFollowers={(v) => (setInstagramF(digits(v).slice(0, 9)), dirty())} />
              <SocialRow mark={<Disc bg="#FF0000"><Icon name="play_arrow" size={22} color={color.white} /></Disc>} name="YouTube" handle={youtube} onHandle={(v) => (setYoutube(v), dirty())} followers={youtubeF} onFollowers={(v) => (setYoutubeF(digits(v).slice(0, 9)), dirty())} />
            </View>
          ) : null}

          {tab === 'videos' ? (
            <View>
              {videos.map((v, i) => (
                <Field
                  key={i}
                  label={`Video ${i + 1}`}
                  value={v}
                  onChange={(next) => {
                    setVideos((cur) => cur.map((x, j) => (j === i ? next.trim() : x)));
                    dirty();
                  }}
                  placeholder="https://www.tiktok.com/@you/video/..."
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  right={v.trim() && isLink(v) ? <Icon name="check_circle" size={20} color={color.green} /> : null}
                />
              ))}
            </View>
          ) : null}
        </View>

        {error ? <Text style={[text.body, { color: color.pink, marginBottom: 12 }]}>{error}</Text> : null}
        {!onBack ? <View style={{ flexDirection: 'row', paddingBottom: 16 }}>{saveButton}</View> : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={[text.meta, { marginTop: 20, marginBottom: 8 }]}>{children}</Text>;
}

function Count({ n, max }: { n: number; max: number }) {
  return <Text style={[text.meta, { marginBottom: 12, color: n >= max ? color.blueDeep : color.grey4 }]}>{`${n} of ${max}`}</Text>;
}

function Disc({ bg, children }: { bg: string; children: React.ReactNode }) {
  return <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}

function SocialRow({
  mark,
  name,
  handle: h,
  onHandle,
  followers,
  onFollowers,
}: {
  mark: React.ReactNode;
  name: string;
  handle: string;
  onHandle: (v: string) => void;
  followers: string;
  onFollowers: (v: string) => void;
}) {
  return (
    <View style={{ padding: 14, backgroundColor: color.card, borderRadius: radius.card, ...shadow.card, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {mark}
        <Text style={[text.row, { flex: 1 }]}>{name}</Text>
        {h.trim() ? <Icon name="check_circle" size={20} color={color.green} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Inline value={h} onChange={onHandle} placeholder="@handle" flex />
        <Inline value={followers} onChange={onFollowers} placeholder="Followers" numeric />
      </View>
    </View>
  );
}

function Inline({ value, onChange, placeholder, flex, numeric }: { value: string; onChange: (v: string) => void; placeholder: string; flex?: boolean; numeric?: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={color.grey3}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={numeric ? 'number-pad' : 'default'}
      style={{ flex: flex ? 1 : undefined, width: flex ? undefined : 112, height: 44, borderRadius: 12, backgroundColor: color.grey1, paddingHorizontal: 12, fontSize: 15, color: color.ink }}
    />
  );
}
