// The campaign card, made from the campaign's own numbers: a flat cover in
// the company's colour with its logo or name and what a post pays, then the
// title, one line and a row of chips. The feed, the campaign screen and the
// company's editor preview all draw this one.
import { useState, type ReactNode } from 'react';
import { Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { companyLogoUrl } from '../../lib/companies-api';
import {
  coverColor,
  isLightColor,
  nicheLabel,
  payHeadline,
  payLines,
  paySub,
  postsPerDayLabel,
  spotsLabel,
  type CampaignTerms,
  type CardCampaign,
} from '../../lib/marketplace';
import { color, radius, text, type Tone } from '../../theme/v2';
import { Card, Chip, Icon } from '../v2';

type CoverCampaign = Pick<CardCampaign, 'company_name' | 'logo_path' | 'brand_color' | 'video_post_cents' | 'cents_per_1k_views' | 'view_pay_cap_cents'>;

/** The 16:9 colour block: logo or name bottom left, the two pay pills top right. */
export function CampaignCover({ campaign: c, round = 'top', style }: { campaign: CoverCampaign; round?: 'top' | 'all'; style?: StyleProp<ViewStyle> }) {
  const bg = coverColor(c.brand_color);
  const ink = isLightColor(bg) ? color.ink : color.white;
  const url = companyLogoUrl(c.logo_path);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showLogo = url !== null && failedUrl !== url;
  const sub = paySub(c);
  const corners: ViewStyle = round === 'all' ? { borderRadius: radius.card } : { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card };

  return (
    <View style={[{ aspectRatio: 16 / 9, backgroundColor: bg, padding: 16, justifyContent: 'flex-end' }, corners, style]}>
      <View style={{ position: 'absolute', top: 12, right: 12, alignItems: 'flex-end', gap: 6 }}>
        <View style={{ height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.white, justifyContent: 'center' }}>
          <Text allowFontScaling={false} style={{ fontSize: 15, fontWeight: '700', color: color.ink, fontVariant: ['tabular-nums'] }}>{payHeadline(c)}</Text>
        </View>
        {sub ? (
          <View style={{ height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: color.white, justifyContent: 'center' }}>
            <Text allowFontScaling={false} style={{ fontSize: 12, fontWeight: '600', color: color.ink, fontVariant: ['tabular-nums'] }}>{sub}</Text>
          </View>
        ) : null}
      </View>
      {showLogo ? (
        <View accessibilityLabel={c.company_name} style={{ width: 72, height: 72, borderRadius: 18, overflow: 'hidden', backgroundColor: color.white }}>
          <Image source={{ uri: url }} onError={() => setFailedUrl(url)} resizeMode="cover" style={{ width: 72, height: 72 }} />
        </View>
      ) : (
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8, color: ink }}>
          {c.company_name}
        </Text>
      )}
    </View>
  );
}

export interface CampaignCardProps {
  campaign: CardCampaign;
  /** The creator's own interests: matching ones are tinted blue. */
  mine?: string[];
  /** Where the creator stands, shown as the first chip. */
  state?: { label: string; tone: Tone } | null;
  /** Shown in place of the tagline (a company's invite note). */
  note?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function CampaignCard({ campaign: c, mine = [], state, note, onPress, style }: CampaignCardProps) {
  const spots = spotsLabel(c);
  const line = note ? `“${note}”` : c.tagline;
  return (
    <Card pad={0} onPress={onPress} accessibilityLabel={`${c.company_name}, ${c.title}, ${payHeadline(c)}`} style={style}>
      <CampaignCover campaign={c} />
      <View style={{ padding: 16 }}>
        <Text numberOfLines={1} style={text.card}>{c.title}</Text>
        {line ? <Text numberOfLines={1} style={[text.body, { color: note ? color.ink : color.grey4, marginTop: 4 }]}>{line}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {state ? <Chip small label={state.label} tone={state.tone} /> : null}
          <Chip small tone="grey" label={postsPerDayLabel(c)} />
          {spots ? <Chip small tone={c.spots_left === 0 ? 'grey' : 'green'} label={spots} /> : null}
          {c.niches.slice(0, 2).map((n) => (
            <Chip key={n} small tone={mine.includes(n) ? 'blue' : 'grey'} label={nicheLabel(n)} />
          ))}
        </View>
      </View>
    </Card>
  );
}

/** The "Pay" block: one line per term. */
export function PayBlock({ terms, children, style }: { terms: Omit<CampaignTerms, 'posts_per_day_min' | 'posts_per_day_max'>; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Card style={style}>
      <Text style={[text.card, { marginBottom: 8 }]}>Pay</Text>
      {payLines(terms).map((line) => (
        <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
          <Icon name="check" size={18} weight={700} color={color.green} />
          <Text style={[text.body, { flex: 1, fontVariant: ['tabular-nums'] }]}>{line}</Text>
        </View>
      ))}
      {children}
    </Card>
  );
}
