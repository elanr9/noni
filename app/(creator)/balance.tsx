import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter } from 'expo-router';

import { LoadingScreen, Screen } from '../../components/layout/Screen';
import { SoftToast } from '../../components/states';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { PressableScale } from '../../components/ui/PressableScale';
import { useAuth } from '../../lib/auth';
import {
  formatCents,
  getOrCreateWallet,
  getStripeConnectStatus,
  getStripeConnectUrl,
  ledgerKindLabel,
  listLedger,
  type CreatorWallet,
  type StripeConnectStatus,
  type WalletLedgerRow,
} from '../../lib/wallet-api';
import {
  borderWidth,
  color,
  radius,
  space,
  type,
} from '../../theme/tokens';

const PAYOUT_SCHEDULE =
  'Payouts are net of a 3% platform fee and send every Sunday at 8PM Eastern to your connected bank. Available balance is what transfers on the next run.';

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
    return row.note?.trim() || 'Payout to bank';
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
  const [connect, setConnect] = useState<StripeConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || !profile.company_id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [w, rows, status] = await Promise.all([
        getOrCreateWallet(profile.company_id, profile.id),
        listLedger(profile.id),
        getStripeConnectStatus().catch(() => null),
      ]);
      setWallet(w);
      setLedger(rows);
      setConnect(status);
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

  async function setupConnect() {
    setBusy(true);
    try {
      const url = await getStripeConnectUrl();
      await WebBrowser.openBrowserAsync(url);
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Bank setup failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingScreen label="Loading balance" />;

  const onboarded = connect?.onboarded === true;
  const available = wallet?.available_cents ?? 0;
  const pending = wallet?.pending_cents ?? 0;

  const clearingLine =
    pending > 0
      ? `${formatCents(pending)} more clears when posts finish review`
      : 'Nothing clearing right now';

  const bankLabel = onboarded
    ? 'Bank account connected'
    : connect?.account_id
      ? 'Finish bank setup'
      : 'Connect a bank account';

  const scheduleLine = onboarded
    ? PAYOUT_SCHEDULE
    : 'Connect a bank so payouts can send. Earnings pay out automatically every Sunday at 8PM Eastern once your bank is connected.';

  return (
    <Screen
      bg={color.white}
      edges={['top', 'left', 'right']}
      contentStyle={styles.content}
      footer={
        onboarded ? undefined : (
          <Button
            block
            size="lg"
            disabled={busy}
            onPress={() => void setupConnect()}
          >
            {connect?.account_id ? 'Finish bank setup' : 'Connect bank'}
          </Button>
        )
      }
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
          <Text style={styles.heroLabel}>Available balance</Text>
          <Text style={styles.heroValue}>{formatCents(available)}</Text>
          <Text style={styles.heroClearing}>{clearingLine}</Text>
          <Text style={styles.scheduleCopy}>{scheduleLine}</Text>
        </View>

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Edit payout account"
          style={styles.bankRow}
          onPress={() => void setupConnect()}
        >
          <View style={styles.bankIcon}>
            <Icon
              name={onboarded ? 'check' : 'dollar-sign'}
              size={18}
              color={color.ink}
            />
          </View>
          <View style={styles.bankText}>
            <Text style={styles.bankLabel} numberOfLines={1}>
              {bankLabel}
            </Text>
            {onboarded ? (
              <Text style={styles.bankSub} numberOfLines={2}>
                Next payout runs Sunday at 8PM Eastern
              </Text>
            ) : null}
          </View>
          <Icon name="pencil" size={18} color={color.slate400} />
        </PressableScale>

        <Text style={styles.sectionLabel}>Recent</Text>
        {ledger.length === 0 ? (
          <EmptyState
            compact
            icon="dollar-sign"
            title="No payouts yet"
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
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: space[5],
    paddingHorizontal: space.cardPad,
    borderRadius: radius.lg,
    backgroundColor: color.offWhite,
  },
  bankIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  bankLabel: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  bankSub: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate400,
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
