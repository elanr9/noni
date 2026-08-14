// Analytics — the same explorer engine as the usenoni.app admin console
// (Filters · Sort by · time range · Graph|Calendar), rebuilt for the phone.
// Money exists only from the day the admin connected the company's Stripe:
// views and posts are platform data and are always there; anything in
// dollars starts on the connect day and earlier days simply have no money.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import {
  AdminHeader,
  AdminScreen,
  Avatar,
  Card,
  EmptyState,
  SectionLabel,
  SkeletonCard,
  Thumb,
} from '../../../components/admin/shared';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import type { ContentFormat } from '../../../lib/admin-review-types';
import {
  ANALYTICS_RANGES,
  buildMoneyGate,
  buildViewsSeries,
  fetchCompanyAnalytics,
  formatMoney,
  moneyOn,
  shortDayLabel,
  type AnalyticsDay,
  type AnalyticsPost,
  type AnalyticsRange,
  type ChartSeries,
  type CompanyAnalytics,
  type MoneyGate,
} from '../../../lib/analytics-api';
import { formatMetric } from '../../../lib/analytics';
import { useAuth } from '../../../lib/auth';
import { getStripeConnectedAt } from '../../../lib/company-billing-api';
import { borderWidth, color, motion, shadow, type } from '../../../theme/tokens';

const SORTS = ['Views over time', 'Top creators', 'Top posts', 'Formats'] as const;
type SortKey = (typeof SORTS)[number];

const ALL_FORMATS = 'All formats';
const ALL_CREATORS = 'All creators';
const FORMAT_LABELS = ['Reel', 'Slideshow'] as const;

function formatLabel(format: ContentFormat): string {
  return format === 'video' ? 'Reel' : 'Slideshow';
}

// ————— Anchored menu pill —————

type MenuItem = { label: string; on: boolean; onPick: () => void };
type MenuSection = { header?: string; items: MenuItem[] };

function MenuPill({
  label,
  active = false,
  sections,
}: {
  label: string;
  active?: boolean;
  sections: MenuSection[];
}) {
  const { width: winW } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<View>(null);
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (anchor === null) return;
    appear.setValue(0);
    Animated.timing(appear, {
      toValue: 1,
      duration: motion.fast,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [anchor, appear]);

  function open() {
    ref.current?.measureInWindow((x, y, w, h) => {
      setAnchor({
        top: y + h + 6,
        left: Math.max(12, Math.min(x, winW - 200)),
      });
    });
  }

  return (
    <>
      <View ref={ref} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          hitSlop={7}
          onPress={open}
          style={[
            styles.menuPill,
            shadow.shadowCard,
            active && styles.menuPillActive,
          ]}
        >
          <Text style={[styles.menuPillText, active && styles.menuPillTextActive]}>
            {label}
          </Text>
          <Icon
            name="chevron-down"
            size={13}
            color={active ? color.blue700 : color.slate400}
          />
        </Pressable>
      </View>

      <Modal
        visible={anchor !== null}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => setAnchor(null)}
      >
        <Pressable
          accessibilityLabel="Close menu"
          style={styles.menuScrim}
          onPress={() => setAnchor(null)}
        />
        {anchor !== null && (
          <Animated.View
            style={[
              styles.menuPanel,
              shadow.shadowRaised,
              {
                top: anchor.top,
                left: anchor.left,
                maxWidth: winW - 24,
                opacity: appear,
                transform: [
                  {
                    scale: appear.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                  {
                    translateY: appear.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-6, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {sections.map((section, si) => (
              <View key={si} style={si > 0 && styles.menuSectionDivider}>
                {section.header !== undefined && (
                  <SectionLabel style={styles.menuSectionHeader}>
                    {section.header}
                  </SectionLabel>
                )}
                {section.items.map((item) => (
                  <Pressable
                    key={item.label}
                    accessibilityRole="button"
                    onPress={() => {
                      setAnchor(null);
                      item.onPick();
                    }}
                    style={styles.menuItem}
                  >
                    <Text style={styles.menuItemLabel}>{item.label}</Text>
                    {item.on && <Icon name="check" size={13} color={color.blue700} />}
                  </Pressable>
                ))}
              </View>
            ))}
          </Animated.View>
        )}
      </Modal>
    </>
  );
}

// ————— Area chart —————

const CHART_W = 350;
const CHART_H = 170;
const CHART_PAD = { t: 12, r: 8, b: 22, l: 34 };

function AreaChart({ series }: { series: ChartSeries }) {
  const data = series.points.length > 1 ? series.points : [0, 0];
  const max = Math.max(...data, 1) * 1.15;
  const iw = CHART_W - CHART_PAD.l - CHART_PAD.r;
  const ih = CHART_H - CHART_PAD.t - CHART_PAD.b;
  const pts = data.map((v, i) => [
    CHART_PAD.l + (iw * i) / (data.length - 1),
    CHART_PAD.t + ih * (1 - v / max),
  ]);
  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(' ');
  const last = pts[pts.length - 1];

  return (
    <View style={styles.chartBox}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
        {[0, 0.5, 1].map((f) => (
          <Line
            key={f}
            x1={CHART_PAD.l}
            x2={CHART_W - CHART_PAD.r}
            y1={CHART_PAD.t + ih * f}
            y2={CHART_PAD.t + ih * f}
            stroke={color.line}
            strokeWidth={1}
          />
        ))}
        {[0, 0.5, 1].map((f) => (
          <SvgText
            key={`y${f}`}
            x={CHART_PAD.l - 7}
            y={CHART_PAD.t + ih * f + 4}
            textAnchor="end"
            fontSize={11}
            fontWeight="600"
            fill={color.slate400}
          >
            {formatMetric(Math.round(max * (1 - f)))}
          </SvgText>
        ))}
        <Path
          d={`${line} L ${(CHART_PAD.l + iw).toFixed(1)} ${CHART_PAD.t + ih} L ${CHART_PAD.l} ${CHART_PAD.t + ih} Z`}
          fill={color.blue500}
          fillOpacity={0.1}
        />
        <Path
          d={line}
          fill="none"
          stroke={color.blue500}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle
          cx={last[0]}
          cy={last[1]}
          r={4.5}
          fill={color.blue500}
          stroke={color.white}
          strokeWidth={2}
        />
        {series.labels.map((w, i) => (
          <SvgText
            key={`${w}${i}`}
            x={
              CHART_PAD.l +
              (iw * (series.labels.length > 1 ? i / (series.labels.length - 1) : 0))
            }
            y={CHART_H - 6}
            textAnchor={
              i === 0 ? 'start' : i === series.labels.length - 1 ? 'end' : 'middle'
            }
            fontSize={11}
            fontWeight="600"
            fill={color.slate400}
          >
            {w}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

// ————— Rows —————

function RankRow({
  rank,
  name,
  views,
  max,
  onOpen,
}: {
  rank: number;
  name: string;
  views: number;
  max: number;
  onOpen: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={styles.rankRow}>
      <Text style={[styles.rankNum, rank === 1 && { color: color.blue700 }]}>
        {`#${rank}`}
      </Text>
      <Avatar name={name} size={30} />
      <View style={styles.rankMid}>
        <View style={styles.rankNameRow}>
          <Text numberOfLines={1} style={styles.rankName}>
            {name}
          </Text>
          <Text style={styles.rankViews}>{`${formatMetric(views)} views`}</Text>
        </View>
        <View style={styles.rankTrack}>
          <View
            style={[styles.rankFill, { width: `${Math.round((views / max) * 100)}%` }]}
          />
        </View>
      </View>
      <Icon name="chevron-right" size={15} color={color.slate300} />
    </Pressable>
  );
}

function PostRow({
  post,
  gate,
  showFinancials,
  border,
  onOpen,
}: {
  post: AnalyticsPost;
  gate: MoneyGate;
  showFinancials: boolean;
  border: boolean;
  onOpen: () => void;
}) {
  const money = showFinancials && moneyOn(gate, post.day);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={[styles.postRow, border && styles.postRowBorder]}
    >
      <Thumb format={post.format} width={38} height={50} radius={9} />
      <View style={styles.postRowMid}>
        <Text numberOfLines={1} style={styles.postRowTitle}>
          {post.title}
        </Text>
        <Text numberOfLines={1} style={styles.postRowMeta}>
          {`${post.creatorFirst} · ${formatLabel(post.format)} · ${shortDayLabel(post.day)}`}
        </Text>
      </View>
      <View style={styles.postRowRight}>
        <Text style={styles.postRowViews}>{formatMetric(post.views)}</Text>
        {money && (
          <Text style={styles.postRowEarned}>{formatMoney(post.earnedCents)}</Text>
        )}
      </View>
      <Icon name="chevron-right" size={15} color={color.slate300} />
    </Pressable>
  );
}

// ————— Post detail —————

function PlatformCol({
  name,
  icon,
  stats,
}: {
  name: string;
  icon: 'music-2' | 'at-sign';
  stats: { views: number; likes: number; saves: number };
}) {
  const rows: Array<[string, string]> = [
    ['Views', formatMetric(stats.views)],
    ['Likes', formatMetric(stats.likes)],
    ['Saves', formatMetric(stats.saves)],
  ];
  return (
    <View style={styles.platformCol}>
      <View style={styles.platformHead}>
        <Icon name={icon} size={14} color={color.ink} />
        <Text style={styles.platformName}>{name}</Text>
      </View>
      {rows.map(([l, v]) => (
        <View key={l} style={styles.platformStat}>
          <Text style={styles.platformStatLabel}>{l}</Text>
          <Text style={styles.platformStatValue}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function PostDetail({
  post,
  gate,
  showFinancials,
  onBack,
}: {
  post: AnalyticsPost;
  gate: MoneyGate;
  showFinancials: boolean;
  onBack: () => void;
}) {
  const money = showFinancials && moneyOn(gate, post.day);
  const cells: Array<[string, string]> = [
    ['Total views', formatMetric(post.views)],
    ...(showFinancials
      ? ([['Earned', money ? formatMoney(post.earnedCents) : 'Not tracked']] as Array<
          [string, string]
        >)
      : []),
    ['Posted', shortDayLabel(post.day)],
  ];
  return (
    <View>
      <View style={styles.detailHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={6}
          onPress={onBack}
          style={styles.detailBack}
        >
          <Icon name="chevron-left" size={16} color={color.ink} />
        </Pressable>
        <View style={styles.detailHeadText}>
          <Text numberOfLines={1} style={styles.detailTitle}>
            {post.title}
          </Text>
          <Text numberOfLines={1} style={styles.postRowMeta}>
            {`${post.creatorFirst} · ${formatLabel(post.format)} · ${shortDayLabel(post.day)}`}
          </Text>
        </View>
      </View>

      <View style={styles.detailStrip}>
        {cells.map(([l, v]) => (
          <View key={l} style={styles.detailCell}>
            <Text numberOfLines={1} style={styles.detailCellLabel}>
              {l}
            </Text>
            <Text numberOfLines={1} style={styles.detailCellValue}>
              {v}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.platformRow}>
        <PlatformCol name="TikTok" icon="music-2" stats={post.tiktok} />
        <PlatformCol name="Instagram" icon="at-sign" stats={post.instagram} />
      </View>

      {post.postUrl !== null && (
        <View style={styles.openPostRow}>
          <Button
            size="sm"
            variant="tint"
            icon="share-2"
            onPress={() => {
              const url = post.postUrl;
              if (url !== null) void Linking.openURL(url);
            }}
          >
            Open post
          </Button>
        </View>
      )}
    </View>
  );
}

// ————— Day detail —————

function DayDetail({
  day,
  posts,
  gate,
  showSignups,
  showFinancials,
  onOpenPost,
  onClose,
}: {
  day: AnalyticsDay;
  posts: AnalyticsPost[];
  gate: MoneyGate;
  showSignups: boolean;
  showFinancials: boolean;
  onOpenPost: (post: AnalyticsPost) => void;
  onClose: () => void;
}) {
  const money = showFinancials && moneyOn(gate, day.day);
  return (
    <View>
      <View style={styles.dayHead}>
        <Text style={styles.dayTitle}>{shortDayLabel(day.day)}</Text>
        <Text numberOfLines={1} style={styles.daySummary}>
          <Text style={styles.daySummaryStrong}>{formatMetric(day.views)}</Text>
          {' views'}
          {showSignups && (
            <>
              {' · '}
              <Text style={styles.daySummaryStrong}>{day.signups}</Text>
              {' sign-ups'}
            </>
          )}
          {money && (
            <>
              {' · '}
              <Text style={styles.daySummaryStrong}>
                {formatMoney(day.salesCents)}
              </Text>
              {' sales'}
            </>
          )}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={9}
          onPress={onClose}
          style={styles.dayClose}
        >
          <Icon name="x" size={13} color={color.slate500} />
        </Pressable>
      </View>

      {showFinancials && gate.connectedDay !== null && !money && (
        <Text style={styles.dayNoMoney}>
          {`No money data for this day. Stripe was connected ${gate.sinceLabel ?? ''}.`}
        </Text>
      )}

      <SectionLabel>{`Posted ${shortDayLabel(day.day)}`}</SectionLabel>
      {posts.length === 0 ? (
        <Text style={styles.dayNothing}>Nothing posted this day.</Text>
      ) : (
        posts.map((p, i) => (
          <PostRow
            key={p.id}
            post={p}
            gate={gate}
            showFinancials={showFinancials}
            border={i < posts.length - 1}
            onOpen={() => onOpenPost(p)}
          />
        ))
      )}
    </View>
  );
}

// ————— Month calendar —————

function MonthCal({
  days,
  gate,
  showSignups,
  showFinancials,
  selected,
  onPick,
}: {
  days: AnalyticsDay[];
  gate: MoneyGate;
  showSignups: boolean;
  showFinancials: boolean;
  selected: string | null;
  onPick: (day: string) => void;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const offset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();

  const byDay = new Map<string, AnalyticsDay>();
  for (const d of days) byDay.set(d.day, d);
  const keyOf = (d: number) =>
    `${year}-${`${month + 1}`.padStart(2, '0')}-${`${d}`.padStart(2, '0')}`;

  const cells: Array<number | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View>
      <View style={styles.calGrid}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <View key={`${d}${i}`} style={styles.calCellWrap}>
            <Text style={styles.calWeekday}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={`e${i}`} style={styles.calCellWrap} />;
          const key = keyOf(d);
          const data = byDay.get(key);
          const posted = data !== undefined && data.postIds.length > 0;
          const has =
            data !== undefined &&
            (data.views > 0 ||
              (showSignups && data.signups > 0) ||
              (showFinancials && data.salesCents > 0) ||
              posted);
          const future = d > today;
          const on = selected === key;
          return (
            <View key={d} style={styles.calCellWrap}>
              <Pressable
                accessibilityRole="button"
                disabled={!has}
                onPress={() => onPick(key)}
                style={[
                  styles.calCell,
                  on && styles.calCellOn,
                  future && { opacity: 0.4 },
                ]}
              >
                <View style={styles.calDayRow}>
                  <Text style={styles.calDayNum}>{d}</Text>
                  {posted && <View style={styles.calDot} />}
                </View>
                {has && showFinancials && moneyOn(gate, key) && (
                  <Text numberOfLines={1} style={styles.calMoney}>
                    {formatMoney(data.salesCents)}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
      <Text numberOfLines={1} style={styles.calFoot}>
        {showFinancials
          ? gate.connectedDay !== null
            ? `$ = sales, tracked since ${gate.sinceLabel ?? ''} · dot = posts`
            : '$ appears once Stripe is connected · dot = posts'
          : 'dot = posts'}
      </Text>
    </View>
  );
}

// ————— Screen —————

export default function AnalyticsScreen() {
  const { profile, managerAccess, refreshManagerAccess } = useAuth();
  const [data, setData] = useState<CompanyAnalytics | null>(null);
  const [gate, setGate] = useState<MoneyGate>({ connectedDay: null, sinceLabel: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<0 | 1>(0);
  const [range, setRange] = useState<AnalyticsRange>('Last 7 days');
  const [sortBy, setSortBy] = useState<SortKey>('Views over time');
  const [formatF, setFormatF] = useState<string>(ALL_FORMATS);
  const [creatorF, setCreatorF] = useState<string>(ALL_CREATORS);
  const [day, setDay] = useState<string | null>(null);
  const [post, setPost] = useState<AnalyticsPost | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [analytics, connectedAt] = await Promise.all([
        fetchCompanyAnalytics(profile.company_id),
        // Managers without the billing permission fall back on the first
        // completed payout: money can only exist after Stripe connected.
        getStripeConnectedAt().catch(() => null),
        refreshManagerAccess(),
      ]);
      setData(analytics);
      setGate(buildMoneyGate(connectedAt, analytics.payouts[0]?.day));
    } catch {
      // Pull to refresh retries; the skeleton keeps the surface calm.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile, refreshManagerAccess]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const posts = data?.posts ?? [];
  const showSignups = managerAccess.viewSignups;
  const showFinancials = managerAccess.viewFinancials;
  const empty =
    posts.length === 0 &&
    (!showSignups || data === null || data.totals.signups === 0);

  const creators = (() => {
    const map = new Map<string, { id: string; name: string; views: number }>();
    for (const p of posts) {
      if (p.creatorId === null) continue;
      const entry = map.get(p.creatorId) ?? { id: p.creatorId, name: p.creatorName, views: 0 };
      entry.views += p.views;
      map.set(p.creatorId, entry);
    }
    return [...map.values()].sort((a, b) => b.views - a.views);
  })();

  const nF = (formatF !== ALL_FORMATS ? 1 : 0) + (creatorF !== ALL_CREATORS ? 1 : 0);
  const byFormat = (p: AnalyticsPost) =>
    formatF === ALL_FORMATS || formatLabel(p.format) === formatF;
  const byCreator = (p: AnalyticsPost) =>
    creatorF === ALL_CREATORS || p.creatorName === creatorF;
  const filtered = posts.filter((p) => byFormat(p) && byCreator(p));

  const crObj = creators.find((c) => c.name === creatorF);
  const ranked = (crObj ? [crObj] : creators)
    .map((c) => ({
      ...c,
      v: posts
        .filter((p) => p.creatorId === c.id && byFormat(p))
        .reduce((n, p) => n + p.views, 0),
    }))
    .sort((a, b) => b.v - a.v);
  const maxCr = Math.max(...ranked.map((c) => c.v), 1);

  const topPosts = [...filtered].sort((a, b) => b.views - a.views);

  const fmtEntries = FORMAT_LABELS.filter(
    (k) => formatF === ALL_FORMATS || k === formatF,
  ).map((k) => ({
    label: k,
    count: posts.filter((p) => formatLabel(p.format) === k && byCreator(p)).length,
  }));
  const maxFmt = Math.max(...fmtEntries.map((f) => f.count), 1);

  const cut =
    (formatF !== ALL_FORMATS ? ` · ${formatF}s` : '') +
    (crObj ? ` · ${crObj.name.split(' ')[0]}` : '');

  const chart = buildViewsSeries(filtered, range);

  const paidOutCents =
    gate.connectedDay !== null && data !== null
      ? data.payouts
          .filter((p) => moneyOn(gate, p.day))
          .reduce((n, p) => n + p.amountCents, 0)
      : 0;

  const stats: Array<[string, string, string]> = data
    ? [
        [
          'Views',
          formatMetric(data.totals.views),
          data.totals.viewsDeltaPct !== null
            ? `${data.totals.viewsDeltaPct >= 0 ? '+' : ''}${data.totals.viewsDeltaPct}%`
            : '',
        ],
        [
          'Posts',
          `${data.totals.posts}`,
          data.totals.postsThisWeek > 0 ? `+${data.totals.postsThisWeek} wk` : '',
        ],
        ...(showSignups
          ? ([
              [
                'Sign-ups',
                data.totals.signups.toLocaleString('en-US'),
                data.totals.signupsDeltaPct !== null
                  ? `${data.totals.signupsDeltaPct >= 0 ? '+' : ''}${data.totals.signupsDeltaPct}%`
                  : '',
              ],
            ] as Array<[string, string, string]>)
          : []),
        ...(showFinancials
          ? ([
              [
                'Paid out',
                gate.connectedDay !== null ? formatMoney(paidOutCents) : 'Not tracked',
                gate.sinceLabel !== null ? `since ${gate.sinceLabel}` : '',
              ],
            ] as Array<[string, string, string]>)
          : []),
      ]
    : [];

  const selectedDay =
    day !== null ? (data?.days.find((d) => d.day === day) ?? null) : null;
  const dayPosts = day !== null ? posts.filter((p) => p.day === day) : [];

  let graphBody: ReactNode = null;
  if (sortBy === 'Views over time') {
    graphBody = (
      <>
        <SectionLabel style={styles.chartLabel}>
          {`Views · ${range.toLowerCase()}${cut}`}
        </SectionLabel>
        <AreaChart series={chart} />
      </>
    );
  } else if (sortBy === 'Top creators') {
    graphBody = (
      <>
        <SectionLabel>{`Top creators${cut}`}</SectionLabel>
        {ranked.map((c, i) => (
          <RankRow
            key={c.id}
            rank={i + 1}
            name={c.name}
            views={c.v}
            max={maxCr}
            onOpen={() => router.push(`/(admin)/creator/${c.id}`)}
          />
        ))}
      </>
    );
  } else if (sortBy === 'Top posts') {
    graphBody = (
      <>
        <SectionLabel>{`Top posts${cut}`}</SectionLabel>
        {topPosts.length === 0 ? (
          <Text style={styles.noMatch}>No posts match these filters.</Text>
        ) : (
          topPosts.map((q, i) => (
            <PostRow
              key={q.id}
              post={q}
              gate={gate}
              showFinancials={showFinancials}
              border={i < topPosts.length - 1}
              onOpen={() => setPost(q)}
            />
          ))
        )}
      </>
    );
  } else {
    graphBody = (
      <>
        <SectionLabel style={styles.fmtLabel}>
          {`Posts by format${crObj ? ` · ${crObj.name.split(' ')[0]}` : ''}`}
        </SectionLabel>
        <View style={styles.fmtList}>
          {fmtEntries.map((f) => (
            <View key={f.label} style={styles.fmtRow}>
              <Text style={styles.fmtName}>{`${f.label}s`}</Text>
              <View style={styles.fmtTrack}>
                <View
                  style={[
                    styles.fmtFill,
                    { width: `${Math.round((100 * f.count) / maxFmt)}%` },
                  ]}
                />
              </View>
              <Text style={styles.fmtCount}>{f.count}</Text>
            </View>
          ))}
        </View>
      </>
    );
  }

  return (
    <AdminScreen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <AdminHeader
        title="Analytics"
        trailing={
          <View style={styles.headerRight}>
            {!loading && !empty && (
              <View style={styles.modeTrack}>
                {(['Graph', 'Calendar'] as const).map((t, i) => (
                  <Pressable
                    key={t}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === i }}
                    hitSlop={7}
                    onPress={() => {
                      setMode(i === 1 ? 1 : 0);
                      setPost(null);
                    }}
                    style={[
                      styles.modeItem,
                      mode === i && [styles.modeItemActive, shadow.shadowCard],
                    ]}
                  >
                    <Text
                      style={[styles.modeText, mode === i && styles.modeTextActive]}
                    >
                      {t}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => router.push('/(admin)/(tabs)/settings')}
              style={[styles.gearBtn, shadow.shadowCard]}
            >
              <Icon name="settings" size={19} color={color.slate500} />
            </PressableScale>
          </View>
        }
      />

      {loading && (
        <View style={styles.stack}>
          <SkeletonCard height={96} />
          <SkeletonCard height={44} />
          <SkeletonCard height={280} />
        </View>
      )}

      {!loading && empty && (
        <EmptyState
          icon="chart-column"
          title="No numbers yet"
          body="Metrics start landing the day the first post goes live."
          style={styles.emptyState}
        />
      )}

      {!loading && !empty && data !== null && (
        <View style={styles.stack}>
          <Card pad={12}>
            <View style={styles.statRow}>
              {stats.map(([l, v, d]) => (
                <View key={l} style={styles.statCell}>
                  <Text numberOfLines={1} style={styles.statLabel}>
                    {l}
                  </Text>
                  <Text numberOfLines={1} style={styles.statValue}>
                    {v}
                  </Text>
                  <Text numberOfLines={1} style={styles.statHint}>
                    {d}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {mode === 0 ? (
            <Card pad={16}>
              {post !== null ? (
                <PostDetail
                  post={post}
                  gate={gate}
                  showFinancials={showFinancials}
                  onBack={() => setPost(null)}
                />
              ) : (
                <>
                  <View style={styles.filterRow}>
                    <MenuPill
                      label={nF > 0 ? `Filters · ${nF}` : 'Filters'}
                      active={nF > 0}
                      sections={[
                        {
                          header: 'Format',
                          items: [ALL_FORMATS, ...FORMAT_LABELS].map((f) => ({
                            label: f,
                            on: formatF === f,
                            onPick: () => setFormatF(f),
                          })),
                        },
                        {
                          header: 'Creator',
                          items: [ALL_CREATORS, ...creators.map((c) => c.name)].map(
                            (c) => ({
                              label: c,
                              on: creatorF === c,
                              onPick: () => setCreatorF(c),
                            }),
                          ),
                        },
                      ]}
                    />
                    <MenuPill
                      label="Sort by"
                      sections={[
                        {
                          items: SORTS.map((s) => ({
                            label: s,
                            on: sortBy === s,
                            onPick: () => setSortBy(s),
                          })),
                        },
                      ]}
                    />
                    <MenuPill
                      label={range}
                      sections={[
                        {
                          items: ANALYTICS_RANGES.map((r) => ({
                            label: r,
                            on: range === r,
                            onPick: () => setRange(r),
                          })),
                        },
                      ]}
                    />
                  </View>
                  {graphBody}
                </>
              )}
            </Card>
          ) : (
            <>
              <Card pad={12}>
                <SectionLabel style={styles.calLabel}>
                  {`Daily activity · ${new Date().toLocaleDateString('en-US', { month: 'long' })}`}
                </SectionLabel>
                <MonthCal
                  days={data.days}
                  gate={gate}
                  showSignups={showSignups}
                  showFinancials={showFinancials}
                  selected={day}
                  onPick={(d) => {
                    setDay(d);
                    setPost(null);
                  }}
                />
              </Card>
              {selectedDay !== null && (
                <Card pad={12}>
                  {post !== null ? (
                    <PostDetail
                      post={post}
                      gate={gate}
                      showFinancials={showFinancials}
                      onBack={() => setPost(null)}
                    />
                  ) : (
                    <DayDetail
                      day={selectedDay}
                      posts={dayPosts}
                      gate={gate}
                      showSignups={showSignups}
                      showFinancials={showFinancials}
                      onOpenPost={setPost}
                      onClose={() => setDay(null)}
                    />
                  )}
                </Card>
              )}
            </>
          )}
        </View>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeTrack: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
  },
  modeItem: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  modeItemActive: {
    backgroundColor: color.white,
  },
  modeText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: color.slate400,
  },
  modeTextActive: {
    color: color.ink,
  },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
  },
  stack: {
    gap: 12,
  },
  emptyState: {
    marginTop: 40,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCell: {
    flex: 1,
    minWidth: 0,
  },
  statLabel: {
    fontSize: type.size.micro11,
    fontWeight: '600',
    color: color.slate400,
  },
  statValue: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: color.ink,
  },
  statHint: {
    marginTop: 1,
    fontSize: type.size.micro11,
    fontWeight: '600',
    color: color.slate400,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 16,
  },
  menuPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    backgroundColor: color.white,
  },
  menuPillActive: {
    backgroundColor: color.blue100,
  },
  menuPillText: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.ink,
  },
  menuPillTextActive: {
    color: color.blue700,
  },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  menuPanel: {
    position: 'absolute',
    minWidth: 180,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    borderRadius: 14,
    padding: 6,
  },
  menuSectionDivider: {
    marginTop: 6,
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
  },
  menuSectionHeader: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.ink,
  },
  chartLabel: {
    paddingBottom: 10,
  },
  chartBox: {
    width: '100%',
    aspectRatio: CHART_W / CHART_H,
  },
  noMatch: {
    marginTop: 10,
    marginBottom: 2,
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate400,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    minHeight: 44,
  },
  rankNum: {
    width: 24,
    fontSize: type.size.chip,
    fontWeight: '800',
    color: color.slate400,
  },
  rankMid: {
    flex: 1,
    minWidth: 0,
  },
  rankNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  rankName: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: color.ink,
  },
  rankViews: {
    fontSize: 12.5,
    fontWeight: '700',
    color: color.slate500,
  },
  rankTrack: {
    marginTop: 5,
    height: 8,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
  rankFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: color.blue500,
  },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    minHeight: 44,
  },
  postRowBorder: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  postRowMid: {
    flex: 1,
    minWidth: 0,
  },
  postRowTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: color.ink,
  },
  postRowMeta: {
    marginTop: 2,
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  postRowRight: {
    alignItems: 'flex-end',
  },
  postRowViews: {
    fontSize: 13.5,
    fontWeight: '700',
    color: color.ink,
  },
  postRowEarned: {
    fontSize: 11.5,
    fontWeight: '700',
    color: color.green,
  },
  detailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  detailBack: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeadText: {
    flex: 1,
    minWidth: 0,
  },
  detailTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: color.ink,
  },
  detailStrip: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: color.fillQuiet,
    marginBottom: 12,
  },
  detailCell: {
    flex: 1,
    minWidth: 0,
  },
  detailCellLabel: {
    fontSize: type.size.micro11,
    fontWeight: '600',
    color: color.slate400,
  },
  detailCellValue: {
    marginTop: 2,
    fontSize: type.size.body,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: color.ink,
  },
  platformRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  platformCol: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: 13,
  },
  platformHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  platformName: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.ink,
  },
  platformStat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingVertical: 4,
  },
  platformStatLabel: {
    flex: 1,
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  platformStatValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: color.ink,
  },
  openPostRow: {
    flexDirection: 'row',
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dayTitle: {
    fontSize: type.size.body,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: color.ink,
  },
  daySummary: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    fontSize: 12.5,
    fontWeight: '600',
    color: color.slate500,
  },
  daySummaryStrong: {
    color: color.ink,
    fontWeight: '700',
  },
  dayClose: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNoMoney: {
    marginBottom: 8,
    fontSize: type.size.label,
    fontWeight: '600',
    lineHeight: type.size.label * 1.4,
    color: color.slate400,
  },
  dayNothing: {
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: '600',
    color: color.slate400,
  },
  calLabel: {
    paddingBottom: 8,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  calCellWrap: {
    width: `${100 / 7}%`,
    padding: 2,
  },
  calWeekday: {
    textAlign: 'center',
    fontSize: type.size.micro11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: color.slate400,
  },
  calCell: {
    minHeight: 44,
    borderRadius: 9,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    backgroundColor: color.white,
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 1,
  },
  calCellOn: {
    borderWidth: borderWidth.field,
    borderColor: color.blue500,
    backgroundColor: color.blue100,
  },
  calDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  calDayNum: {
    fontSize: type.size.micro11,
    fontWeight: '700',
    color: color.ink,
  },
  calDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: color.blue500,
  },
  calMoney: {
    fontSize: type.size.micro11,
    fontWeight: '700',
    color: color.blue700,
  },
  calFoot: {
    marginTop: 8,
    fontSize: type.size.micro11,
    fontWeight: '600',
    color: color.slate400,
  },
  fmtLabel: {
    paddingBottom: 12,
  },
  fmtList: {
    gap: 13,
  },
  fmtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fmtName: {
    width: 74,
    fontSize: 12.5,
    fontWeight: '600',
    color: color.slate500,
  },
  fmtTrack: {
    flex: 1,
    height: 9,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
  fmtFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: color.blue500,
  },
  fmtCount: {
    width: 34,
    textAlign: 'right',
    fontSize: 12.5,
    fontWeight: '700',
    color: color.ink,
  },
});
