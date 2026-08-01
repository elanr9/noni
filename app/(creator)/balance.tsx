import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from 'expo-router';

import { LoadingScreen, Screen, colors } from '../../components/Screen';
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

export default function CreatorBalanceScreen() {
  const { profile } = useAuth();
  const [wallet, setWallet] = useState<CreatorWallet | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);
  const [connect, setConnect] = useState<StripeConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

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

  async function cashOut() {
    if (!wallet || wallet.available_cents <= 0) return;
    Alert.alert(
      'Cash out',
      `Send ${formatCents(wallet.available_cents)} to your bank via Stripe?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cash out',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const result = await requestPayout();
                Alert.alert(
                  'Cash out started',
                  `${formatCents(result.amount_cents)} is pending until Stripe confirms.`,
                );
                await load();
              } catch (e) {
                Alert.alert(
                  'Cash out failed',
                  e instanceof Error ? e.message : 'Unknown error',
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }

  if (loading) return <LoadingScreen label="Loading balance" />;

  const onboarded = connect?.onboarded === true;
  const available = wallet?.available_cents ?? 0;
  const pending = wallet?.pending_cents ?? 0;

  return (
    <Screen style={styles.screen}>
      <ScrollView
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
        <Text style={styles.body}>
          Bounties land here when posts hit the view threshold. Cash out to your
          bank when you are ready.
        </Text>

        <View style={styles.balances}>
          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>Available</Text>
            <Text style={styles.balanceValue}>{formatCents(available)}</Text>
          </View>
          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>Pending</Text>
            <Text style={styles.balanceValue}>{formatCents(pending)}</Text>
          </View>
        </View>

        <View style={styles.box}>
          <Text style={styles.label}>Payout account</Text>
          <Text style={styles.value}>
            {onboarded
              ? 'Ready — cash outs go to your bank'
              : connect?.account_id
                ? 'Almost done — finish Stripe setup'
                : 'One time setup with Stripe (ID + bank)'}
          </Text>
          {!onboarded ? (
            <Text style={styles.hint}>
              Takes about two minutes. Stripe collects your identity and bank
              account so we can pay you. Noni never sees your bank login.
            </Text>
          ) : null}
        </View>

        {!onboarded ? (
          <Pressable
            style={[styles.btn, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void setupConnect()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>
                {connect?.account_id ? 'Finish payout setup' : 'Set up payouts'}
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.btn,
              (busy || available <= 0) && styles.disabled,
            ]}
            disabled={busy || available <= 0}
            onPress={() => void cashOut()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>
                {available > 0
                  ? `Cash out ${formatCents(available)}`
                  : 'Nothing to cash out'}
              </Text>
            )}
          </Pressable>
        )}

        <Text style={styles.sectionTitle}>History</Text>
        {ledger.length === 0 ? (
          <Text style={styles.empty}>No ledger entries yet.</Text>
        ) : (
          ledger.map((row) => (
            <View key={row.id} style={styles.ledgerRow}>
              <View style={styles.ledgerLeft}>
                <Text style={styles.ledgerKind}>
                  {ledgerKindLabel(row.kind)}
                </Text>
                {row.note ? (
                  <Text style={styles.ledgerNote} numberOfLines={1}>
                    {row.note}
                  </Text>
                ) : null}
                {row.created_at ? (
                  <Text style={styles.ledgerDate}>
                    {new Date(row.created_at).toLocaleDateString()}
                  </Text>
                ) : null}
              </View>
              <Text
                style={[
                  styles.ledgerAmount,
                  row.amount_cents < 0 ? styles.debit : styles.credit,
                ]}
              >
                {row.amount_cents > 0 ? '+' : ''}
                {formatCents(row.amount_cents)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20 },
  h1: { fontSize: 28, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  body: { fontSize: 15, color: colors.muted, marginBottom: 16 },
  balances: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  balanceBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6E2DC',
  },
  balanceLabel: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  balanceValue: { fontSize: 24, fontWeight: '700', color: colors.ink },
  box: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E6E2DC',
    marginBottom: 12,
  },
  label: { fontSize: 12, color: colors.muted },
  value: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  hint: { fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 18 },
  btn: {
    backgroundColor: colors.ink,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 10,
  },
  empty: { color: colors.muted, fontSize: 14 },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E2DC',
  },
  ledgerLeft: { flex: 1, paddingRight: 12, gap: 2 },
  ledgerKind: { fontSize: 15, fontWeight: '600', color: colors.ink },
  ledgerNote: { fontSize: 13, color: colors.muted },
  ledgerDate: { fontSize: 12, color: colors.muted },
  ledgerAmount: { fontSize: 15, fontWeight: '700' },
  credit: { color: '#1B7F4E' },
  debit: { color: colors.ink },
});
