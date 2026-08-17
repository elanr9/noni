import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { LoadingScreen, Screen } from '../../components/layout/Screen';
import { SoftToast } from '../../components/states';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { PressableScale } from '../../components/ui/PressableScale';
import { useAuth } from '../../lib/auth';
import {
  formatCents,
  getOrCreateWallet,
  ledgerKindLabel,
  listLedger,
  type CreatorWallet,
  type WalletLedgerRow,
} from '../../lib/wallet-api';
import {
  borderWidth,
  color,
  radius,
  space,
  type,
} from '../../theme/tokens';

const EARNINGS_COPY =
  'Noni tracks everything you earn here. Payments are coming soon.';

function isPendingKind(kind: string): boolean {
  return kind === 'payout_hold' || kind === 'payout_pending';
}

function isCashOutKind(kind: string): boolean {
  return (
    kind === 'payout_hold' ||
    kind === 'payout_paid' ||
    kind === 'payout_failed' ||
    kind === 'payout_pending'
  );
}

function formatLedgerDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function ledgerSubtitle(row: WalletLedgerRow): string {
  if (isPendingKind(row.kind)) {
    return row.note?.trim() || 'In review';
  }
  const date = formatLedgerDate(row.created_at);
  if (isCashOutKind(row.kind)) return date;
  const label = row.note?.trim();
  if (label && date) return `${date}, ${label}`;
  if (label) return label;
  return date;
}

function ledgerTitle(row: WalletLedgerRow): string {
  if (isCashOutKind(row.kind)) {
    return row.note?.trim() || 'Payout';
  }
  return row.note?.trim() || ledgerKindLabel(row.kind);
}

function LedgerAmount({ row }: { row: WalletLedgerRow }) {
  if (isPendingKind(row.kind)) {
    return (
      <Text style={styles.amountPending}>
        {formatCents(Math.abs(row.amount_cents))} pending
      </Text>
    );
  }
  const debit = row.amount_cents < 0;
  return (
    <Text style={[styles.amount, debit && styles.amountDebit]}>
      {row.amount_cents > 0 ? '+' : ''}
      {formatCents(row.amount_cents)}
    </Text>
  );
}

export default function CreatorBalanceScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<CreatorWallet | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || !profile.company_id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [w, rows] = await Promise.all([
        getOrCreateWallet(profile.company_id, profile.id),
        listLedger(profile.id),
      ]);
      setWallet(w);
      setLedger(rows);
    } catch (e) {
      setToast(
        e instanceof Error ? e.message : 'Could not load balance. Try again.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id, profile?.company_id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) return <LoadingScreen label="Loading balance" />;

  const available = wallet?.available_cents ?? 0;
  const pending = wallet?.pending_cents ?? 0;

  const clearingLine =
    pending > 0
      ? `${formatCents(pending)} more clears when posts finish review`
      : 'Nothing clearing right now';

  return (
    <Screen
      bg={color.white}
      edges={['top', 'left', 'right']}
      contentStyle={styles.content}
    >
      <View style={styles.topBar}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Icon name="chevron-left" size={22} color={color.ink} />
        </PressableScale>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
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
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Earnings</Text>
          <Text style={styles.heroValue}>{formatCents(available)}</Text>
          <Text style={styles.heroClearing}>{clearingLine}</Text>
          <Text style={styles.scheduleCopy}>{EARNINGS_COPY}</Text>
        </View>

        <Text style={styles.sectionLabel}>Recent</Text>
        {ledger.length === 0 ? (
          <EmptyState
            compact
            icon="dollar-sign"
            title="No earnings yet"
            body="Post from Home to start earning."
          />
        ) : (
          <View>
            {ledger.map((row) => (
              <View key={row.id} style={styles.ledgerRow}>
                <View style={styles.ledgerText}>
                  <Text style={styles.ledgerTitle} numberOfLines={1}>
                    {ledgerTitle(row)}
                  </Text>
                  <Text style={styles.ledgerSub} numberOfLines={1}>
                    {ledgerSubtitle(row)}
                  </Text>
                </View>
                <LedgerAmount row={row} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <SoftToast
        visible={toast !== null}
        message={toast ?? ''}
        tone="error"
        onHide={() => setToast(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: space[2],
  },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: space.gutter,
    paddingBottom: space[9],
    gap: space[6],
  },
  topBar: {
    paddingHorizontal: space.gutter,
    marginBottom: space[2],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    gap: 6,
  },
  heroLabel: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  heroValue: {
    fontSize: type.size.hero,
    lineHeight: type.size.hero * type.leading.tight,
    letterSpacing: type.tracking.hero,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  heroClearing: {
    fontSize: type.size.meta,
    fontWeight: type.weight.regular,
    color: color.slate400,
  },
  scheduleCopy: {
    marginTop: space[2],
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  sectionLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
    marginBottom: -8,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: 14,
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  ledgerText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  ledgerTitle: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  ledgerSub: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate400,
  },
  amount: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  amountDebit: {
    color: color.slate500,
  },
  amountPending: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.heavy,
    color: color.amber,
  },
});
