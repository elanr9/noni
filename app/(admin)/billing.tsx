import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { router, Stack, useFocusEffect } from 'expo-router';

import {
  AdminScreen,
  PushHeader,
  SectionLabel,
  SkeletonCard,
} from '../../components/admin/shared';
import { Button } from '../../components/ui/Button';
import { PressableScale } from '../../components/ui/PressableScale';
import { useAuth } from '../../lib/auth';
import { forecastMonthlyBudget } from '../../lib/budget-forecast';
import {
  DEFAULT_BOUNTY_AMOUNT_CENTS,
  DEFAULT_BOUNTY_VIEW_THRESHOLD,
  fetchBountySettings,
} from '../../lib/bounty';
import {
  getBankSetupUrl,
  getBillingStatus,
  getTopUpUrl,
  setMonthlyBudget,
  type CompanyBillingStatus,
} from '../../lib/company-billing-api';
import { formatCents } from '../../lib/wallet-api';
import {
  borderWidth,
  color,
  radius,
  radiusAdmin,
  shadow,
  type,
} from '../../theme/tokens';

const TOPUP_CHIPS = [100, 500, 1000] as const;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(admin)/(tabs)/settings');
}

function dollarsFromInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (cleaned.trim() === '') return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function centsFromDollars(dollars: number): number {
  return Math.round(dollars * 100);
}

function formatRoas(roas: number): string {
  if (!Number.isFinite(roas) || roas <= 0) return '—';
  return `${roas.toFixed(roas >= 10 ? 0 : 1)}x`;
}

function ForecastCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={[styles.forecastCard, shadow.shadowCard]}>
      <Text style={styles.forecastLabel}>{label}</Text>
      <Text style={styles.forecastValue}>{value}</Text>
    </View>
  );
}

export default function BillingScreen() {
  const { profile } = useAuth();
  const [status, setStatus] = useState<CompanyBillingStatus | null>(null);
  const [bountyAmountCents, setBountyAmountCents] = useState(
    DEFAULT_BOUNTY_AMOUNT_CENTS,
  );
  const [viewThreshold, setViewThreshold] = useState(
    DEFAULT_BOUNTY_VIEW_THRESHOLD,
  );
  const [budgetDollars, setBudgetDollars] = useState('');
  const [topUpChoice, setTopUpChoice] = useState<number | 'custom'>(100);
  const [customTopUpDollars, setCustomTopUpDollars] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.company_id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [billing, bounty] = await Promise.all([
        getBillingStatus(),
        fetchBountySettings(profile.company_id).catch(() => ({
          amountCents: DEFAULT_BOUNTY_AMOUNT_CENTS,
          viewThreshold: DEFAULT_BOUNTY_VIEW_THRESHOLD,
        })),
      ]);
      setStatus(billing);
      setBountyAmountCents(bounty.amountCents);
      setViewThreshold(bounty.viewThreshold);
      setBudgetDollars(
        billing.monthly_budget_cents > 0
          ? String(billing.monthly_budget_cents / 100)
          : '',
      );
    } catch (e) {
      Alert.alert(
        'Could not load',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.company_id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const budgetCents = centsFromDollars(dollarsFromInput(budgetDollars));
  const forecast = useMemo(
    () => forecastMonthlyBudget(budgetCents, bountyAmountCents, viewThreshold),
    [budgetCents, bountyAmountCents, viewThreshold],
  );

  const creditBalance = status?.credit_balance_cents ?? 0;
  const monthlyBudget = status?.monthly_budget_cents ?? 0;
  const lowBalance =
    monthlyBudget > 0 && creditBalance < monthlyBudget * 0.2;

  const showBankOption =
    status != null &&
    (typeof status.bank_connected === 'boolean' ||
      status.stripe_payment_method_id != null ||
      status.bank_last4 != null);
  const bankConnected = status?.bank_connected === true;
  const bankLabel = bankConnected
    ? `${status?.bank_name ?? 'Bank'} ····${status?.bank_last4 ?? ''}`
    : 'Optional for saved payments';

  const topUpCents =
    topUpChoice === 'custom'
      ? centsFromDollars(dollarsFromInput(customTopUpDollars))
      : topUpChoice * 100;

  async function addCredits() {
    if (topUpCents < 1000) {
      Alert.alert('Minimum top-up', 'Add at least $10 in credits.');
      return;
    }
    setBusy(true);
    try {
      const url = await getTopUpUrl(topUpCents);
      await WebBrowser.openBrowserAsync(url);
      await load();
    } catch (e) {
      Alert.alert(
        'Top-up failed',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setBusy(false);
    }
  }

  async function connectBank() {
    setBusy(true);
    try {
      const url = await getBankSetupUrl();
      await WebBrowser.openBrowserAsync(url);
      await load();
    } catch (e) {
      Alert.alert(
        'Bank setup failed',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveBudget() {
    setBusy(true);
    try {
      await setMonthlyBudget(budgetCents);
      Alert.alert('Saved', 'Monthly budget updated.');
      await load();
    } catch (e) {
      Alert.alert(
        'Could not save',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setBusy(false);
    }
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
      actionBar={
        loading ? undefined : (
          <Button
            size="md"
            variant="primary"
            block
            disabled={busy}
            onPress={() => void addCredits()}
          >
            Add credits
          </Button>
        )
      }
    >
      <Stack.Screen options={{ headerShown: false }} />
      <PushHeader
        title="Billing"
        subtitle="Prepaid credits for creator bounties"
        onBack={goBack}
      />

      {loading ? (
        <View style={styles.stack}>
          <SkeletonCard height={96} radius={radiusAdmin.lg} />
          <SkeletonCard height={120} radius={radiusAdmin.lg} />
          <SkeletonCard height={160} radius={radiusAdmin.lg} />
        </View>
      ) : (
        <>
          <View style={[styles.hero, shadow.shadowCard]}>
            <Text style={styles.heroLabel}>Available credits</Text>
            <Text style={styles.heroValue}>{formatCents(creditBalance)}</Text>
            {lowBalance ? (
              <View style={styles.warnBox}>
                <Text style={styles.warnText}>
                  Low balance — under 20% of your monthly budget. Add credits so
                  bounties keep paying out.
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.explain}>
            Credits fund creator bounties. Companies pay 10% on each payout.
            Creators receive 97% (3% platform fee).
          </Text>

          <SectionLabel style={styles.section}>Add credits</SectionLabel>
          <View style={[styles.card, shadow.shadowCard]}>
            <View style={styles.chipRow}>
              {TOPUP_CHIPS.map((dollars) => {
                const on = topUpChoice === dollars;
                return (
                  <PressableScale
                    key={dollars}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setTopUpChoice(dollars)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      ${dollars}
                    </Text>
                  </PressableScale>
                );
              })}
              <PressableScale
                accessibilityRole="button"
                accessibilityState={{ selected: topUpChoice === 'custom' }}
                onPress={() => setTopUpChoice('custom')}
                style={[styles.chip, topUpChoice === 'custom' && styles.chipOn]}
              >
                <Text
                  style={[
                    styles.chipText,
                    topUpChoice === 'custom' && styles.chipTextOn,
                  ]}
                >
                  Custom
                </Text>
              </PressableScale>
            </View>
            {topUpChoice === 'custom' ? (
              <View style={styles.dollarRow}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={styles.dollarInput}
                  value={customTopUpDollars}
                  onChangeText={setCustomTopUpDollars}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={color.slate400}
                  accessibilityLabel="Custom top-up amount in dollars"
                />
              </View>
            ) : null}
          </View>

          <SectionLabel style={styles.section}>Monthly budget</SectionLabel>
          <View style={[styles.card, shadow.shadowCard]}>
            <Text style={styles.inputLabel}>Planned spend per month</Text>
            <View style={styles.dollarRow}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.dollarInput}
                value={budgetDollars}
                onChangeText={setBudgetDollars}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={color.slate400}
                accessibilityLabel="Monthly budget in dollars"
              />
            </View>
            <Button
              size="md"
              variant="tint"
              block
              disabled={busy}
              onPress={() => void saveBudget()}
            >
              Save
            </Button>
          </View>

          <View style={styles.forecastGrid}>
            <ForecastCard
              label="Expected payout"
              value={formatCents(forecast.expected_creator_payout_cents)}
            />
            <ForecastCard
              label="Expected trials"
              value={`~${Math.round(forecast.expected_trials)}`}
            />
            <ForecastCard
              label="Expected revenue"
              value={formatCents(forecast.expected_revenue_cents)}
            />
            <ForecastCard
              label="ROAS"
              value={formatRoas(forecast.expected_roas)}
            />
          </View>

          <Text style={styles.summary}>{forecast.summary}</Text>

          {showBankOption ? (
            <>
              <SectionLabel style={styles.section}>
                Payment method (optional)
              </SectionLabel>
              <View style={[styles.card, shadow.shadowCard]}>
                <Text style={styles.bankMeta}>
                  {bankConnected ? bankLabel : 'Not required — top-ups use card checkout'}
                </Text>
                <Button
                  size="md"
                  variant="ghost"
                  block
                  disabled={busy}
                  onPress={() => void connectBank()}
                >
                  {bankConnected ? 'Manage bank' : 'Connect bank'}
                </Button>
              </View>
            </>
          ) : null}

          <Text style={styles.note}>
            Creators are paid every Sunday at 8PM Eastern from prepaid credits.
          </Text>
        </>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
    marginTop: 8,
  },
  section: {
    marginTop: 20,
    marginBottom: 10,
  },
  hero: {
    marginTop: 8,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 6,
  },
  heroLabel: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.slate500,
  },
  heroValue: {
    fontSize: 36,
    fontWeight: '700',
    color: color.ink,
    letterSpacing: -0.8,
  },
  warnBox: {
    marginTop: 8,
    backgroundColor: color.amberSoft,
    borderRadius: radiusAdmin.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warnText: {
    fontSize: type.size.chip,
    fontWeight: '600',
    lineHeight: type.size.chip * type.leading.body,
    color: color.amber,
  },
  explain: {
    marginTop: 14,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.slate500,
  },
  card: {
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: 14,
    gap: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  chipOn: {
    backgroundColor: color.blue100,
  },
  chipText: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.slate500,
  },
  chipTextOn: {
    color: color.blue700,
  },
  bankMeta: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
  },
  inputLabel: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.slate500,
  },
  dollarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dollarSign: {
    fontSize: 28,
    fontWeight: '700',
    color: color.ink,
  },
  dollarInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: color.ink,
    paddingVertical: 0,
  },
  forecastGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  forecastCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  forecastLabel: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.slate500,
  },
  forecastValue: {
    fontSize: 20,
    fontWeight: '700',
    color: color.ink,
    letterSpacing: -0.3,
  },
  summary: {
    marginTop: 14,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.slate500,
  },
  note: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: type.size.chip,
    fontWeight: '600',
    lineHeight: type.size.chip * type.leading.body,
    color: color.slate400,
  },
});
