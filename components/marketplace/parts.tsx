// Small pieces both sides of the marketplace share.
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { CENTS_PER_1K_VIEWS, STATIC_POST_CENTS, VIDEO_POST_CENTS } from '../../lib/creator-pay';
import { nicheLabel } from '../../lib/marketplace';
import { money } from '../../lib/v2-format';
import { color, num, radius, shadow, text, tone as tones, type Tone } from '../../theme/v2';
import { Icon, Press, type IconName } from '../v2';

/** The pay every campaign on Noni runs on, in one line. */
export const PAY_LINE = `${money(VIDEO_POST_CENTS)} a video + ${money(CENTS_PER_1K_VIEWS)} per 1k views`;

export const PAY_FIGURES = [
  { value: money(VIDEO_POST_CENTS), label: 'per video' },
  { value: money(STATIC_POST_CENTS), label: 'per static post' },
  { value: money(CENTS_PER_1K_VIEWS), label: 'per 1k views' },
];

/** Wrapping pick-any pills: grey when off, blue when on. */
export function Pills<K extends string>({
  options,
  value,
  onToggle,
  onWhite,
  style,
}: {
  options: readonly { key: K; label: string }[];
  value: readonly K[];
  onToggle: (key: K) => void;
  /** Inside a sheet or a white card: grey pills instead of white ones. */
  onWhite?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>
      {options.map((o) => {
        const on = value.includes(o.key);
        return (
          <Press
            key={o.key}
            onPress={() => onToggle(o.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? color.blue : onWhite ? color.grey1 : color.card, justifyContent: 'center', ...(on || onWhite ? null : shadow.card) }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: on ? color.white : color.ink }}>{o.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

/** Read-only niche tags, at most `max` then "+2". */
export function NicheTags({ niches, max = 3, highlight }: { niches: string[]; max?: number; highlight?: string[] }) {
  if (niches.length === 0) return null;
  const shown = niches.slice(0, max);
  const more = niches.length - shown.length;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {shown.map((n) => {
        const hit = highlight?.includes(n);
        return (
          <View key={n} style={{ height: 24, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: hit ? color.blueTint : color.grey1, justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: hit ? color.blueDeep : color.grey4 }}>{nicheLabel(n)}</Text>
          </View>
        );
      })}
      {more > 0 ? (
        <View style={{ height: 24, justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: color.grey3 }}>+{more}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Three figures side by side with a label under each. */
export function Figures({ items, style }: { items: { value: string; label: string }[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row' }, style]}>
      {items.map((it, i) => (
        <View key={it.label} style={{ flex: 1, paddingLeft: i === 0 ? 0 : 12, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: color.grey1 }}>
          <Text style={num.sm}>{it.value}</Text>
          <Text style={[text.meta, { fontSize: 12, lineHeight: 16 }]}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** A company's square mark: its initial on a tint, until logos are public. */
export function CompanyMark({ name, size = 48, tone = 'blue' }: { name: string; size?: number; tone?: Tone }) {
  const t = tones[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), backgroundColor: t.tint, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text allowFontScaling={false} style={{ fontSize: Math.round(size * 0.44), fontWeight: '700', color: t.text }}>
        {(name || '?').trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const TONES: Tone[] = ['blue', 'purple', 'green', 'amber', 'pink'];

/** A steady tone per id so a company or creator keeps its colour between visits. */
export function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

/** Icon and a line of text, for the facts list on a campaign. */
export function FactRow({ icon, children }: { icon: IconName; children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 }}>
      <Icon name={icon} size={20} color={color.grey4} style={{ marginTop: 1 }} />
      <Text style={[text.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

/** The fit score: AI scores carry the sparkle. */
export function MatchPill({ score, ai }: { score: number; ai: boolean }) {
  const strong = score >= 80;
  const bg = strong ? color.blue : color.blueTint;
  const fg = strong ? color.white : color.blueDeep;
  return (
    <View accessibilityLabel={`${score} percent match`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 26, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: bg }}>
      {ai ? <Icon name="auto_awesome" size={13} color={fg} /> : null}
      <Text style={{ fontSize: 13, fontWeight: '700', color: fg, fontVariant: ['tabular-nums'] }}>{score}%</Text>
    </View>
  );
}

/** The agreement text as paragraphs. */
export function ContractText({ body, lines }: { body: string; lines?: number }) {
  return (
    <Text numberOfLines={lines} style={[text.body, { color: color.ink, lineHeight: 22 }]}>
      {body.trim()}
    </Text>
  );
}
