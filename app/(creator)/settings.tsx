import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { AccountSwitcherSheet } from '../../components/AccountSwitcherSheet';
import {
  AdminScreen,
  Card,
  ConfirmationTakeover,
  PushHeader,
  Sheet,
} from '../../components/admin/shared';
import { Button } from '../../components/ui/Button';
import { Icon, type IconName } from '../../components/ui/Icon';
import { switchAccountRowLabel } from '../../lib/active-mode';
import { useAuth } from '../../lib/auth';
import { getCompany } from '../../lib/onboarding';
import { contactSupport } from '../../lib/support';
import { borderWidth, color, type } from '../../theme/tokens';

type OpenSheet = 'notifs' | 'signout' | null;

function NavRow({
  icon,
  label,
  tone = 'plain',
  last = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  tone?: 'plain' | 'danger';
  last?: boolean;
  onPress?: () => void;
}) {
  const danger = tone === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.navRow, !last && styles.navRowBorder]}
    >
      <Icon name={icon} size={19} color={danger ? color.danger : color.slate500} />
      <Text style={[styles.navLabel, danger && { color: color.danger }]}>{label}</Text>
      {!danger && <Icon name="chevron-right" size={17} color={color.slate300} />}
    </Pressable>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      hitSlop={8}
      onPress={() => onChange(!on)}
      style={[styles.toggle, { backgroundColor: on ? color.blue500 : color.lineStrong }]}
    >
      <View style={[styles.toggleKnob, on && { alignSelf: 'flex-end' }]} />
    </Pressable>
  );
}

const NOTIF_ROWS: Array<{
  key: 'week' | 'live' | 'earn';
  label: string;
  sub: string;
}> = [
  { key: 'week', label: 'New week is live', sub: 'Your briefs are ready to record' },
  { key: 'live', label: 'Posts going live', sub: 'An approved post publishes' },
  { key: 'earn', label: 'Earnings', sub: 'A post hits a view milestone' },
];

export default function CreatorSettingsScreen() {
  const { profile, signOut, activeMode } = useAuth();
  const router = useRouter();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenSheet>(null);
  const [switcher, setSwitcher] = useState(false);
  const [ended, setEnded] = useState(false);
  const [notifs, setNotifs] = useState({ week: true, live: true, earn: true });

  useFocusEffect(
    useCallback(() => {
      const companyId = profile?.company_id;
      if (!companyId) return;
      void getCompany(companyId)
        .then((company) => setCompanyName(company.name))
        .catch(() => undefined);
    }, [profile?.company_id]),
  );

  const company = companyName ?? 'your company';

  return (
    <>
      <AdminScreen>
        <PushHeader title="Settings" onBack={() => router.back()} />

        <View style={styles.stack}>
          <Card pad={0}>
            <NavRow
              icon="arrow-left-right"
              label={switchAccountRowLabel(profile, activeMode)}
              onPress={() => setSwitcher(true)}
            />
            <NavRow icon="bell" label="Notifications" onPress={() => setOpen('notifs')} />
            <NavRow
              icon="message-circle"
              label="Contact support"
              last
              onPress={() => contactSupport('Noni creator support', profile?.full_name)}
            />
          </Card>

          <Card pad={0}>
            <NavRow
              icon="log-out"
              label="Sign out"
              tone="danger"
              last
              onPress={() => setOpen('signout')}
            />
          </Card>

          <Text style={styles.foot}>{`Signed in as creator · ${company}`}</Text>
        </View>
      </AdminScreen>

      <Sheet
        visible={open === 'notifs'}
        onClose={() => setOpen(null)}
        title="Notifications"
        subtitle="What Noni pings you about."
        footer={
          <Button variant="primary" size="lg" block onPress={() => setOpen(null)}>
            Done
          </Button>
        }
      >
        <View>
          {NOTIF_ROWS.map((row, i) => (
            <View
              key={row.key}
              style={[styles.notifRow, i < NOTIF_ROWS.length - 1 && styles.notifRowBorder]}
            >
              <View style={styles.notifText}>
                <Text style={styles.notifLabel}>{row.label}</Text>
                <Text style={styles.notifSub}>{row.sub}</Text>
              </View>
              <Toggle
                on={notifs[row.key]}
                onChange={(v) => setNotifs({ ...notifs, [row.key]: v })}
              />
            </View>
          ))}
        </View>
      </Sheet>

      <Sheet
        visible={open === 'signout'}
        onClose={() => setOpen(null)}
        title="Sign out?"
        subtitle="Are you sure? You can sign back in anytime with the same email."
        footer={
          <View style={styles.footerStack}>
            <Button
              variant="danger"
              size="lg"
              block
              onPress={() => {
                setOpen(null);
                setEnded(true);
              }}
            >
              Sign out
            </Button>
            <Button variant="ghost" size="lg" block onPress={() => setOpen(null)}>
              Stay signed in
            </Button>
          </View>
        }
      >
        <Text style={styles.sheetBody}>
          {`Your posts and balance stay with ${company}. Nothing is lost.`}
        </Text>
      </Sheet>

      <AccountSwitcherSheet
        visible={switcher}
        onClose={() => setSwitcher(false)}
      />

      {ended ? (
        <ConfirmationTakeover
          icon="log-out"
          tone="brand"
          title="Signed out"
          body="Sign back in anytime with the same email."
          actionLabel="Sign back in"
          onAction={() => void signOut()}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
    paddingTop: 4,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  navRowBorder: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  navLabel: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
  },
  foot: {
    marginHorizontal: 2,
    textAlign: 'center',
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate300,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  notifRowBorder: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  notifText: {
    flex: 1,
    minWidth: 0,
  },
  notifLabel: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
  },
  notifSub: {
    marginTop: 2,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.4,
    color: color.slate400,
  },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 999,
    padding: 2,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: color.white,
    alignSelf: 'flex-start',
  },
  footerStack: {
    gap: 8,
  },
  sheetBody: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.5,
    color: color.slate500,
  },
});
