import { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter } from 'expo-router';

import { LoadingScreen, Screen } from '../../components/layout/Screen';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { PressableScale } from '../../components/ui/PressableScale';
import { SheetShell } from '../../components/ui/SheetShell';
import { useAuth } from '../../lib/auth';
import {
  formatCents,
  getOrCreateWallet,
  getStripeConnectStatus,
  getStripeConnectUrl,
  ledgerKindLabel,
  listLedger,
  requestPayout,
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
    return row.note?.trim() || 'Cash out to bank';
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successCents, setSuccessCents] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || !profile.company_id) return;
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
      Alert.alert(
        'Could not load balance',
        e instanceof Error ? e.message : 'Unknown error',
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
      Alert.alert(
        'Setup failed',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmCashOut() {
    setBusy(true);
    try {
      const result = await requestPayout();
      setConfirmOpen(false);
      setSuccessCents(result.amount_cents);
      await load();
    } catch (e) {
      Alert.alert(
        'Cash out failed',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingScreen label="Loading balance" />;

  const onboarded = connect?.onboarded === true;
  const available = wallet?.available_cents ?? 0;
  const pending = wallet?.pending_cents ?? 0;
  const canCashOut = onboarded && available > 0 && !busy;

  const clearingLine =
    pending > 0
      ? `${formatCents(pending)} more clears when posts finish review`
      : 'Nothing clearing right now';

  const bankLabel = onboarded
    ? 'Bank account connected'
    : connect?.account_id
      ? 'Finish bank setup'
      : 'Connect a bank account';

  if (successCents !== null) {
    return (
      <Screen
        bg={color.white}
        contentStyle={styles.successBody}
        footer={
          <Button
            block
            size="lg"
            onPress={() => {
              setSuccessCents(null);
              router.back();
            }}
          >
            Done
          </Button>
        }
      >
        <View style={styles.successIcon}>
          <Icon name="check" size={28} color={color.green} />
        </View>
        <Text style={styles.successTitle}>Cash out started</Text>
        <Text style={styles.successBodyText}>
          {formatCents(successCents)} is on the way to your bank. Stripe usually
          finishes in one to three business days.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      bg={color.white}
      edges={['top', 'left', 'right']}
      contentStyle={styles.content}
      footer={
        onboarded ? (
          <Button
            block
            size="lg"
            icon="download"
            disabled={!canCashOut}
            onPress={() => setConfirmOpen(true)}
          >
            {available > 0
              ? `Cash out ${formatCents(available)}`
              : 'Nothing to cash out'}
          </Button>
        ) : (
          <Button
            block
            size="lg"
            disabled={busy}
            onPress={() => void setupConnect()}
          >
            {connect?.account_id ? 'Finish payout setup' : 'Set up payouts'}
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
          <Text style={styles.heroLabel}>Available to cash out</Text>
          <Text style={styles.heroValue}>{formatCents(available)}</Text>
          <Text style={styles.heroClearing}>{clearingLine}</Text>
        </View>

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Edit payout account"
          style={styles.bankRow}
          onPress={() => void setupConnect()}
        >
          <View style={styles.bankIcon}>
            <Icon name="dollar-sign" size={18} color={color.ink} />
          </View>
          <Text style={styles.bankLabel} numberOfLines={1}>
            {bankLabel}
          </Text>
          <Icon name="pencil" size={18} color={color.slate400} />
        </PressableScale>

        <Text style={styles.sectionLabel}>Recent</Text>
        {ledger.length === 0 ? (
          <Text style={styles.empty}>No payouts yet. Post to start earning.</Text>
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

      <SheetShell
        visible={confirmOpen}
        onClose={() => {
          if (!busy) setConfirmOpen(false);
        }}
        footer={
          <View style={styles.sheetFooter}>
            <Button
              block
              size="lg"
              icon="download"
              disabled={busy}
              onPress={() => void confirmCashOut()}
            >
              Cash out {formatCents(available)}
            </Button>
            <Button
              block
              size="md"
              variant="ghost"
              disabled={busy}
              onPress={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
          </View>
        }
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>Cash out?</Text>
          <Text style={styles.sheetCopy}>
            Send {formatCents(available)} to your connected bank via Stripe.
            Noni never sees your bank login.
          </Text>
        </View>
      </SheetShell>
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
  bankLabel: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  sectionLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
    marginBottom: -8,
  },
  empty: {
    fontSize: type.size.meta,
    color: color.slate500,
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
  sheetBody: {
    gap: space[3],
  },
  sheetTitle: {
    fontSize: type.size.titleSm,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  sheetCopy: {
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
  },
  sheetFooter: {
    gap: space[2],
  },
  successBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
    paddingHorizontal: space[4],
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: color.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: type.size.titleSm,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.title,
    color: color.ink,
    textAlign: 'center',
  },
  successBodyText: {
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
    textAlign: 'center',
  },
});
