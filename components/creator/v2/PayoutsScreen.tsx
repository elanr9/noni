// Payouts (behind the Earnings row): what may be paid out, what is clearing,
// the payout account setup, and the history of payouts and credits.
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';

import { CENTS_PER_1K_VIEWS, STATIC_POST_CENTS, VIDEO_POST_CENTS, VIEW_PAY_CAP_CENTS, VIEW_WINDOW_DAYS } from '../../../lib/creator-pay';
import { checkPayoutSetup, payoutSetupLabel, payoutStatus, payoutStatusLabel, startPayoutSetup, type PayoutSummary } from '../../../lib/payouts-api';
import { money, shortDate } from '../../../lib/v2-format';
import { ledgerKindLabel, type WalletLedgerRow } from '../../../lib/wallet-api';
import { color, text } from '../../../theme/v2';
import { Button, Card, Chip, Empty, Label, Row, Screen, Skeleton } from '../../v2';
import { toast } from '../../v2/Toast';
import { LoadError } from './LoadError';

export interface PayoutsScreenProps {
  summary: PayoutSummary | null;
  ledger: WalletLedgerRow[];
  /** The first load failed: Retry in place of the skeleton. */
  failed?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onBack: () => void;
}

export function PayoutsScreen({ summary, ledger, failed = false, refreshing = false, onRefresh, onBack }: PayoutsScreenProps) {
  const [busy, setBusy] = useState<'start' | 'check' | null>(null);
  const wallet = summary?.wallet;
  const linkSent = !!wallet && !wallet.payout_ready && (!!wallet.mercury_invite_sent_at || !!wallet.mercury_onboarding_url);

  // Mercury emails the creator a secure link; the app starts it and confirms it.
  const start = async () => {
    setBusy('start');
    try {
      const { alreadySetUp } = await startPayoutSetup();
      toast.success(alreadySetUp ? 'Payouts are already set up' : 'Check your email for a link from Mercury');
      onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Could not start payout setup', { label: 'Retry', onPress: () => void start() });
    } finally {
      setBusy(null);
    }
  };
  const openLink = async () => {
    const url = wallet?.mercury_onboarding_url;
    if (!url) return void start();
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      toast.error('Could not open payout setup', { label: 'Retry', onPress: () => void openLink() });
    }
  };
  const check = async () => {
    setBusy('check');
    try {
      const res = await checkPayoutSetup();
      if (res.ready) toast.success(res.message);
      else toast.show(res.message);
      onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Could not check your setup', { label: 'Retry', onPress: () => void check() });
    } finally {
      setBusy(null);
    }
  };
  const credits = ledger.filter((r) => r.amount_cents > 0 && !r.kind.startsWith('payout')).slice(0, 10);
  return (
    <Screen back={onBack} title="Payouts">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.grey4} /> : undefined}
      >
        {!summary && failed ? (
          <LoadError title="Could not load your payouts" onRetry={() => onRefresh?.()} retrying={refreshing} />
        ) : !summary ? (
          <>
            <Skeleton h={120} />
            <Skeleton h={76} />
          </>
        ) : (
          <Animated.View entering={FadeIn.duration(220)}>
            <Card>
              <Text style={text.meta}>Payout allowed</Text>
              <Text style={{ fontSize: 36, lineHeight: 40, fontWeight: '800', letterSpacing: -1, color: color.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>{money(summary.wallet.available_cents)}</Text>
              <Text style={[text.meta, { marginTop: 4 }]}>{summary.wallet.pending_cents > 0 ? `${money(summary.wallet.pending_cents)} on the way to your bank` : 'Nothing on the way right now'}</Text>
              <Text style={[text.meta, { marginTop: 10 }]}>Payouts go out Sundays at 8 PM Eastern.</Text>
            </Card>
            <Card pad={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
              <Row last={summary.wallet.payout_ready}>
                <View style={{ flex: 1 }}>
                  <Text style={text.row}>Payout account</Text>
                  <Text style={text.meta}>{summary.wallet.payout_ready ? 'Connected' : 'Connect a bank account to get paid'}</Text>
                </View>
                <Chip tone={summary.wallet.payout_ready ? 'green' : 'amber'} label={payoutSetupLabel(summary.wallet)} />
              </Row>
              {!summary.wallet.payout_ready ? (
                <View style={{ paddingTop: 4, paddingBottom: 12, gap: 8 }}>
                  {linkSent ? (
                    <>
                      <Text style={text.meta}>Mercury, our bank partner, emailed you a secure link. Add your bank there, then tap below.</Text>
                      <Button label={busy === 'check' ? 'Checking' : "I've finished setup"} onPress={() => void check()} disabled={busy !== null} />
                      <Button variant="secondary" label={summary.wallet.mercury_onboarding_url ? 'Open the setup link' : busy === 'start' ? 'Sending' : 'Send the link again'} onPress={() => void (summary.wallet.mercury_onboarding_url ? openLink() : start())} disabled={busy !== null} />
                    </>
                  ) : (
                    <Button label={busy === 'start' ? 'Sending your link' : 'Set up payouts'} onPress={() => void start()} disabled={busy !== null} />
                  )}
                </View>
              ) : null}
            </Card>
            <Card>
              <Text style={text.row}>How pay works</Text>
              <Text style={[text.meta, { marginTop: 4 }]}>
                {`${money(VIDEO_POST_CENTS)} for every video and ${money(STATIC_POST_CENTS)} for every static post once it is live, plus ${money(CENTS_PER_1K_VIEWS)} for every 1,000 views in its first ${VIEW_WINDOW_DAYS} days, up to ${money(VIEW_PAY_CAP_CENTS)} per post.`}
              </Text>
            </Card>
            <Label style={{ marginTop: 8, marginBottom: 8, marginLeft: 4 }}>History</Label>
            {summary.payouts.length === 0 && credits.length === 0 ? (
              <Empty>No payouts yet.</Empty>
            ) : (
              <Card pad={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
                {summary.payouts.map((p, i) => {
                  const s = payoutStatus(p);
                  return (
                    <Row key={p.id} last={i === summary.payouts.length - 1 && credits.length === 0}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={text.row}>Payout</Text>
                        <Text style={text.meta}>{p.completed_at ?? p.created_at ? shortDate(new Date((p.completed_at ?? p.created_at) as string)) : ''}</Text>
                      </View>
                      <Chip tone={s === 'paid' ? 'green' : s === 'failed' ? 'amber' : 'blue'} small label={payoutStatusLabel(s)} />
                      <Text style={[text.row, { fontVariant: ['tabular-nums'] }]}>{money(p.amount_cents)}</Text>
                    </Row>
                  );
                })}
                {credits.map((r, i) => (
                  <Row key={r.id} last={i === credits.length - 1}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={text.row}>{r.note?.trim() || ledgerKindLabel(r.kind)}</Text>
                      <Text style={text.meta}>{r.created_at ? shortDate(new Date(r.created_at)) : ''}</Text>
                    </View>
                    <Text style={[text.row, { color: color.green, fontVariant: ['tabular-nums'] }]}>{`+${money(r.amount_cents)}`}</Text>
                  </Row>
                ))}
              </Card>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </Screen>
  );
}
