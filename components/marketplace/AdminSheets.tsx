// The sheets on the company Market tab: a creator's full profile, the
// filters, and the note that goes with reaching out.
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import {
  AGE_BANDS,
  EARNED_FLOORS,
  EXPERIENCE,
  FOLLOWER_FLOORS,
  GENDERS,
  NICHES,
  NO_FILTERS,
  VIEW_FLOORS,
  ageBandKey,
  creatorFactLine,
  creatorStats,
  dayLabel,
  experienceLabel,
  type CreatorFilters,
  type Experience,
  type Gender,
  type Listing,
  type MarketCreator,
} from '../../lib/marketplace';
import { fmt, money } from '../../lib/v2-format';
import { color, radius, text } from '../../theme/v2';
import { Avatar, Button, Field, Icon, Press, Sheet } from '../v2';
import { Figures, MatchPill, NicheTags, Pills, toneFor } from './parts';

// ------------------------------------------------------------ creator profile

export interface CreatorSheetProps {
  creator: MarketCreator | null;
  photo: string | null;
  listing: Listing | null;
  busy?: boolean;
  onClose: () => void;
  onInvite: (creator: MarketCreator) => void;
  onDecide: (creator: MarketCreator, accept: boolean) => void;
}

export function CreatorSheet({ creator, photo, listing, busy, onClose, onInvite, onDecide }: CreatorSheetProps) {
  // Keep the last creator while the sheet slides shut.
  const [shown, setShown] = useState(creator);
  if (creator && creator !== shown) setShown(creator);
  const c = creator ?? shown;
  if (!c) return null;

  const name = c.full_name?.trim() || 'Creator';
  const waiting = c.application_status === 'applied';
  const invited = c.application_status === 'invited';
  const footer = waiting ? (
    <>
      <Button label="Pass" variant="quiet" disabled={busy} onPress={() => onDecide(c, false)} />
      <Button label="Accept" icon="check" disabled={busy} onPress={() => onDecide(c, true)} />
    </>
  ) : invited ? (
    <Button label="Invited, waiting on them" variant="quiet" disabled />
  ) : c.is_member ? (
    <Button label="Already on your team" variant="quiet" disabled />
  ) : listing ? (
    <Button label="Reach out" icon="send" onPress={() => onInvite(c)} />
  ) : (
    <Button label="Set up your campaign to reach out" variant="quiet" disabled />
  );

  const about = [
    experienceLabel(c.experience),
    c.campaigns_done ? `${c.campaigns_done} campaigns` : null,
    c.weekly_capacity ? `${c.weekly_capacity} videos a week` : null,
    c.companies_count > 0 ? `Creates for ${c.companies_count} ${c.companies_count === 1 ? 'company' : 'companies'} on Noni` : null,
  ].filter(Boolean) as string[];

  return (
    <Sheet open={creator !== null} onClose={onClose} footer={footer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Avatar name={name} photo={photo} tone={toneFor(c.creator_id)} size={64} ring={false} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[text.card, { fontSize: 22, lineHeight: 26 }]}>{name}</Text>
          <Text numberOfLines={1} style={text.meta}>{creatorFactLine(c) || 'New to Noni'}</Text>
        </View>
        <MatchPill score={c.match_score} ai={c.match_ai} />
      </View>

      {c.match_reason ? (
        <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.card, backgroundColor: color.blueTint, marginBottom: 16 }}>
          <Icon name="auto_awesome" size={18} color={color.blueDeep} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, color: color.blueDeep }}>{c.match_reason}</Text>
        </View>
      ) : null}

      <Figures items={[...creatorStats(c), { label: 'Posts live', value: fmt(c.posts_live) }]} style={{ marginBottom: 16 }} />

      {waiting ? (
        <Block title={`Applied ${dayLabel(c.applied_at) ?? ''}`.trim()}>
          {c.application_note ? <Text style={[text.body, { marginBottom: 8 }]}>“{c.application_note}”</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="verified" size={18} color={color.green} />
            <Text style={[text.meta, { color: color.green, flex: 1 }]}>
              Signed your agreement as {c.signed_name ?? name}{c.signed_at ? ` on ${dayLabel(c.signed_at)}` : ''}
            </Text>
          </View>
        </Block>
      ) : null}

      {c.bio ? (
        <Block title="About">
          <Text style={text.body}>{c.bio}</Text>
        </Block>
      ) : null}

      {c.niches.length > 0 ? (
        <Block title="Makes content about">
          <NicheTags niches={c.niches} highlight={listing?.niches ?? []} max={12} />
        </Block>
      ) : null}

      {about.length > 0 || c.best_campaign ? (
        <Block title="Experience">
          {about.length > 0 ? <Text style={text.body}>{about.join(' · ')}</Text> : null}
          {c.best_campaign ? <Text style={[text.body, { marginTop: about.length > 0 ? 8 : 0 }]}>{c.best_campaign}</Text> : null}
        </Block>
      ) : null}

      {c.tiktok || c.instagram ? (
        <Block title="Accounts">
          {c.tiktok ? <LinkRow label={`TikTok @${c.tiktok}`} url={`https://www.tiktok.com/@${c.tiktok}`} /> : null}
          {c.instagram ? <LinkRow label={`Instagram @${c.instagram}`} url={`https://www.instagram.com/${c.instagram}`} /> : null}
        </Block>
      ) : null}

      {c.portfolio.length > 0 ? (
        <Block title="Best videos">
          {c.portfolio.slice(0, 8).map((p, i) => (
            <LinkRow key={`${p.url}-${i}`} label={p.note || shortUrl(p.url)} url={p.url} />
          ))}
        </Block>
      ) : null}
    </Sheet>
  );
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\?.*$/, '').slice(0, 44);
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[text.meta, { fontWeight: '600', marginBottom: 6 }]}>{title}</Text>
      {children}
    </View>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <Press
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url).catch(() => undefined)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.option, backgroundColor: color.grey1, marginBottom: 6 }}
    >
      <Icon name="play_circle" size={20} color={color.grey4} />
      <Text numberOfLines={1} style={[text.body, { flex: 1 }]}>{label}</Text>
      <Icon name="open_in_new" size={18} color={color.grey3} />
    </Press>
  );
}

// ------------------------------------------------------------------- filters

export interface FiltersSheetProps {
  open: boolean;
  filters: CreatorFilters;
  onApply: (filters: CreatorFilters) => void;
  onClose: () => void;
}

const one = <K extends string>(key: K | null): K[] => (key ? [key] : []);

export function FiltersSheet({ open, filters, onApply, onClose }: FiltersSheetProps) {
  const [f, setF] = useState(filters);
  // Each opening starts from the filters in force, not from an abandoned edit.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setF(filters);
  }

  const floors = (values: readonly (number | null)[], label: (n: number) => string) =>
    values.map((v) => ({ key: v === null ? 'any' : String(v), label: v === null ? 'Any' : label(v) }));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter creators"
      footer={
        <>
          <Button label="Clear" variant="quiet" onPress={() => setF(NO_FILTERS)} />
          <Button
            label="Show creators"
            onPress={() => {
              onApply(f);
              onClose();
            }}
          />
        </>
      }
    >
      <FilterGroup title="Niche">
        <Pills onWhite options={NICHES} value={f.niches} onToggle={(k) => setF((c) => ({ ...c, niches: c.niches.includes(k) ? c.niches.filter((x) => x !== k) : [...c.niches, k] }))} />
      </FilterGroup>
      <FilterGroup title="Age">
        <Pills
          onWhite
          options={AGE_BANDS}
          value={[ageBandKey(f)]}
          onToggle={(k) => {
            const band = AGE_BANDS.find((b) => b.key === k) ?? AGE_BANDS[0];
            setF((c) => ({ ...c, minAge: band.min, maxAge: band.max }));
          }}
        />
      </FilterGroup>
      <FilterGroup title="Gender">
        <Pills onWhite options={GENDERS.filter((g) => g.key !== 'undisclosed')} value={one<Gender>(f.gender)} onToggle={(k) => setF((c) => ({ ...c, gender: c.gender === k ? null : k }))} />
      </FilterGroup>
      <FilterGroup title="Views on Noni posts">
        <Pills onWhite options={floors(VIEW_FLOORS, (n) => `${fmt(n)}+`)} value={[f.minViews === null ? 'any' : String(f.minViews)]} onToggle={(k) => setF((c) => ({ ...c, minViews: k === 'any' ? null : Number(k) }))} />
      </FilterGroup>
      <FilterGroup title="Total earned on Noni">
        <Pills onWhite options={floors(EARNED_FLOORS, (n) => `${money(n)}+`)} value={[f.minEarnedCents === null ? 'any' : String(f.minEarnedCents)]} onToggle={(k) => setF((c) => ({ ...c, minEarnedCents: k === 'any' ? null : Number(k) }))} />
      </FilterGroup>
      <FilterGroup title="Followers">
        <Pills onWhite options={floors(FOLLOWER_FLOORS, (n) => `${fmt(n)}+`)} value={[f.minFollowers === null ? 'any' : String(f.minFollowers)]} onToggle={(k) => setF((c) => ({ ...c, minFollowers: k === 'any' ? null : Number(k) }))} />
      </FilterGroup>
      <FilterGroup title="Experience" last>
        <Pills onWhite options={EXPERIENCE} value={one<Experience>(f.experience)} onToggle={(k) => setF((c) => ({ ...c, experience: c.experience === k ? null : k }))} />
      </FilterGroup>
    </Sheet>
  );
}

function FilterGroup({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={{ marginBottom: last ? 4 : 20 }}>
      <Text style={[text.row, { marginBottom: 10 }]}>{title}</Text>
      {children}
    </View>
  );
}

// ----------------------------------------------------------------- reach out

export interface InviteSheetProps {
  creator: MarketCreator | null;
  listing: Listing | null;
  onSend: (creator: MarketCreator, message: string) => Promise<void>;
  onClose: () => void;
}

export function InviteSheet({ creator, listing, onSend, onClose }: InviteSheetProps) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(creator);
  if (creator && creator !== shown) {
    setShown(creator);
    setMessage('');
    setError(null);
  }
  const c = creator ?? shown;
  if (!c) return null;
  const first = c.full_name?.trim().split(/\s+/)[0] || 'them';

  return (
    <Sheet
      open={creator !== null}
      onClose={onClose}
      title={`Reach out to ${first}`}
      footer={
        <Button
          label={busy ? 'Sending' : 'Send invite'}
          icon="send"
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSend(c, message);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not send. Try again.');
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <Text style={[text.body, { color: color.grey4, marginBottom: 16 }]}>
        {first} gets your note and {listing ? `"${listing.title}"` : 'your campaign'} at the top of their Market. They sign your agreement and they are on your team, no second approval.
      </Text>
      <View style={{ backgroundColor: color.grey1, borderRadius: radius.card, paddingHorizontal: 0 }}>
        <Field value={message} onChange={setMessage} multiline maxLength={600} placeholder={`Hey ${first}, we love your videos and think you would be great for this.`} style={{ marginBottom: 0 }} />
      </View>
      {error ? <Text style={[text.body, { color: color.pink, marginTop: 12 }]}>{error}</Text> : null}
    </Sheet>
  );
}
