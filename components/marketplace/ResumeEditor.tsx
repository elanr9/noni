// A creator's marketplace profile: what companies see, sort and filter on.
// The web apply chat fills most of it; this is where the rest is added and
// anything is changed.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import {
  EXPERIENCE,
  GENDERS,
  NICHES,
  ageFromBirthYear,
  birthYearFromAge,
  type CreatorResume,
  type Experience,
  type Gender,
} from '../../lib/marketplace';
import { color, space, text } from '../../theme/v2';
import { Button, Card, Field, Screen, Toggle } from '../v2';
import { Pills } from './parts';

export type ResumePatch = Partial<Omit<CreatorResume, 'user_id'>>;

export interface ResumeEditorProps {
  resume: CreatorResume | null;
  onSave: (patch: ResumePatch) => Promise<void>;
  onBack: () => void;
}

const digits = (v: string) => v.replace(/[^0-9]/g, '');
const handle = (v: string) => v.trim().replace(/^@+/, '').replace(/\s+/g, '');

export function ResumeEditor({ resume, onSave, onBack }: ResumeEditorProps) {
  const startAge = ageFromBirthYear(resume?.birth_year);
  const [age, setAge] = useState(startAge ? String(startAge) : '');
  const [gender, setGender] = useState<Gender | null>(resume?.gender ?? null);
  const [location, setLocation] = useState(resume?.location ?? '');
  const [tiktok, setTiktok] = useState(resume?.tiktok ?? '');
  const [tiktokFollowers, setTiktokFollowers] = useState(resume?.tiktok_followers != null ? String(resume.tiktok_followers) : '');
  const [instagram, setInstagram] = useState(resume?.instagram ?? '');
  const [instagramFollowers, setInstagramFollowers] = useState(resume?.instagram_followers != null ? String(resume.instagram_followers) : '');
  const [niches, setNiches] = useState<string[]>(resume?.niches ?? []);
  const [experience, setExperience] = useState<Experience | null>(resume?.experience ?? null);
  const [bio, setBio] = useState(resume?.bio ?? '');
  const [best, setBest] = useState(resume?.best_campaign ?? '');
  const [links, setLinks] = useState((resume?.portfolio ?? []).map((p) => p.url).join('\n'));
  const [listed, setListed] = useState(resume?.listed ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ageNum = age ? Number(age) : null;
  const ageBad = ageNum !== null && (ageNum < 13 || ageNum > 100);
  const tooYoung = ageNum !== null && !ageBad && ageNum < 18;

  const save = async () => {
    if (busy || ageBad) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        birth_year: ageNum !== null ? birthYearFromAge(ageNum) : null,
        gender,
        location: location.trim() || null,
        tiktok: handle(tiktok) || null,
        tiktok_followers: tiktokFollowers ? Number(tiktokFollowers) : null,
        instagram: handle(instagram) || null,
        instagram_followers: instagramFollowers ? Number(instagramFollowers) : null,
        niches,
        ...(experience ? { experience } : {}),
        bio: bio.trim() || null,
        best_campaign: best.trim() || null,
        portfolio: links
          .split(/\s+/)
          .map((u) => u.trim())
          .filter((u) => /^https?:\/\/\S+\.\S+/i.test(u))
          .slice(0, 8)
          .map((url) => ({ url })),
        listed,
      });
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back={onBack} title="Your profile" footer={<Button label={busy ? 'Saving' : 'Save'} disabled={busy || ageBad} onPress={save} />}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: 24 }}>
          <Text style={[text.body, { color: color.grey4, marginBottom: 16 }]}>
            This is your resume. Companies see it when you apply, and the better it is the higher you show up when they search.
          </Text>

          <Group title="About you">
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="Age" value={age} onChange={(v) => setAge(digits(v).slice(0, 3))} keyboardType="number-pad" placeholder="22" style={{ width: 96 }} />
              <Field label="City" value={location} onChange={setLocation} placeholder="Austin, TX" maxLength={80} style={{ flex: 1 }} />
            </View>
            {tooYoung ? <Text style={[text.meta, { color: color.amber, marginBottom: 12 }]}>You can build your profile now. Signing an agreement takes being 18.</Text> : null}
            {ageBad ? <Text style={[text.meta, { color: color.pink, marginBottom: 12 }]}>That age does not look right.</Text> : null}
            <Text style={[text.meta, { marginBottom: 8 }]}>Gender</Text>
            <Pills options={GENDERS} value={gender ? [gender] : []} onToggle={(k) => setGender(gender === k ? null : k)} />
          </Group>

          <Group title="Where you post">
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="TikTok" value={tiktok} onChange={setTiktok} placeholder="@handle" autoCapitalize="none" autoCorrect={false} style={{ flex: 1 }} />
              <Field label="Followers" value={tiktokFollowers} onChange={(v) => setTiktokFollowers(digits(v).slice(0, 9))} keyboardType="number-pad" placeholder="0" style={{ width: 112 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="Instagram" value={instagram} onChange={setInstagram} placeholder="@handle" autoCapitalize="none" autoCorrect={false} style={{ flex: 1 }} />
              <Field label="Followers" value={instagramFollowers} onChange={(v) => setInstagramFollowers(digits(v).slice(0, 9))} keyboardType="number-pad" placeholder="0" style={{ width: 112 }} />
            </View>
          </Group>

          <Group title="What you make">
            <Pills options={NICHES} value={niches} onToggle={(k) => setNiches((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))} />
          </Group>

          <Group title="Experience">
            <Pills options={EXPERIENCE} value={experience ? [experience] : []} onToggle={(k) => setExperience(k)} />
            <View style={{ height: 16 }} />
            <Field label="About you, in a line or two" value={bio} onChange={setBio} multiline maxLength={600} placeholder="What you are like on camera and what you love making" />
            <Field label="Your best campaign" value={best} onChange={setBest} multiline maxLength={600} placeholder="The brand, what you made, how it did" />
            <Field label="Links to your best videos, one per line" value={links} onChange={setLinks} multiline autoCapitalize="none" autoCorrect={false} placeholder="https://www.tiktok.com/@you/video/..." style={{ marginBottom: 0 }} />
          </Group>

          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={text.row}>Show me to companies</Text>
              <Text style={text.meta}>Companies can find you and invite you. Turn off to only be seen where you apply.</Text>
            </View>
            <Toggle on={listed} onChange={setListed} accessibilityLabel="Show me to companies" />
          </Card>
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
