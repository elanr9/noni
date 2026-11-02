// Payouts (behind the Earnings row): what may be paid out, what is clearing,
// the payout account setup, and the history of payouts and credits.
import { Alert, ScrollView, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { payoutSetupLabel, payoutStatus, payoutStatusLabel, type PayoutSummary } from '../../../lib/payouts-api';
import { money, shortDate } from '../../../lib/v2-format';
import { ledgerKindLabel, type WalletLedgerRow } from '../../../lib/wallet-api';
import { color, text } from '../../../theme/v2';
import { Button, Card, Chip, Empty, Label, Row, Screen, Skeleton } from '../../v2';

export interface PayoutsScreenProps {
  summary: PayoutSummary | null;
  ledger: WalletLedgerRow[];
  onBack: () => void;
}

export function PayoutsScreen({ summary, ledger, onBack }: PayoutsScreenProps) {
  const setup = async () => {
    const url = summary?.wallet.mercury_onboarding_url;
    if (!url) {
      Alert.alert('Payout setup', 'Your team sends the payout invite. It lands here once it is ready.');
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  };
  const credits = ledger.filter((r) => r.amount_cents > 0 && !r.kind.startsWith('payout')).slice(0, 10);
  return (
    <Screen back={onBack} title="Payouts">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {!summary ? (
          <>
            <Skeleton h={120} />
            <Skeleton h={76} />
          </>
        ) : (
          <>
            <Card>
              <Text style={text.meta}>Payout allowed</Text>
              <Text style={{ fontSize: 36, lineHeight: 40, fontWeight: '800', letterSpacing: -1, color: color.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>{money(summary.wallet.available_cents)}</Text>
              <Text style={[text.meta, { marginTop: 4 }]}>{summary.wallet.pending_cents > 0 ? `${money(summary.wallet.pending_cents)} more clears when posts finish review` : 'Nothing clearing right now'}</Text>
              <Text style={[text.meta, { marginTop: 10 }]}>Payouts go out every Sunday evening.</Text>
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
                <View style={{ paddingTop: 4, paddingBottom: 12 }}>
                  <Button label={summary.wallet.mercury_onboarding_url ? 'Set up payouts' : 'Waiting for the invite'} onPress={() => void setup()} disabled={!summary.wallet.mercury_onboarding_url} />
                </View>
              ) : null}
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
                        <Text style={text.meta}>{p.completed_at ?? p.created_at ? shortDate(new Date((p.completed_at ?? p.created_at) as string)) : ""}</Text>
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
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
