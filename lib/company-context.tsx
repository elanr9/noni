import { router, useSegments } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import type { AppMode } from './active-mode';
import { useAuth } from './auth';
import {
  fetchCompanyStatusSummary,
  fetchNotificationsFeed,
  markNotificationRead,
  type CompanyMembership,
  type CompanyNotification,
  type CompanyStatus,
} from './companies-api';
import { modeForDeepLink, parseDeepLink, routeForDeepLink } from './deep-link';
import { attachForegroundPushRefresh, attachNotificationRouting } from './notifications';
import { supabase } from './supabase';

export type SwitchToastState = { companyId: string; name: string; logoPath: string | null };

type CompanyState = {
  companies: CompanyMembership[];
  active: CompanyMembership | null;
  /** company_status_summary rows keyed by company_id. Render `line` verbatim. */
  summary: Record<string, CompanyStatus>;
  summaryRows: CompanyStatus[];
  /** Other companies with something waiting, most waiting first. */
  elsewhere: CompanyStatus[];
  /** Sum of waiting across the other companies (the pill badge). */
  elsewhereTotal: number;
  anyWaiting: boolean;
  notifications: CompanyNotification[];
  unreadNotifications: number;
  switching: boolean;
  toast: SwitchToastState | null;
  switcherOpen: boolean;
  notificationsOpen: boolean;
  /** Resolves with the mode after the switch, or null when already active. */
  switchTo: (companyId: string) => Promise<AppMode | null>;
  refreshSummary: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  /** Marks read, switches company when needed, then routes to the deep link. */
  openNotification: (n: CompanyNotification) => Promise<void>;
  openSwitcher: () => void;
  closeSwitcher: () => void;
  openNotifications: () => void;
  closeNotifications: () => void;
};

const CompanyContext = createContext<CompanyState | null>(null);

const TOAST_MS = 2200;
const REALTIME_DEBOUNCE_MS = 400;

export function CompanyProvider({ children }: { children: ReactNode }) {
  const {
    profile,
    session,
    loading,
    activeMode,
    setActiveMode,
    companies,
    activeCompany,
    switchCompany,
    refreshCompanies,
  } = useAuth();
  const segments = useSegments();
  const inModeGroup = segments[0] === '(admin)' || segments[0] === '(creator)';
  const [summaryRows, setSummaryRows] = useState<CompanyStatus[]>([]);
  const [notifications, setNotifications] = useState<CompanyNotification[]>([]);
  const [switching, setSwitching] = useState(false);
  const [toast, setToast] = useState<SwitchToastState | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = profile?.id ?? null;
  const activeCompanyId = profile?.active_company_id ?? null;

  const refreshSummary = useCallback(async () => {
    if (!userId) {
      setSummaryRows([]);
      return;
    }
    try {
      setSummaryRows(await fetchCompanyStatusSummary());
    } catch (e) {
      console.error('company summary failed', e);
    }
  }, [userId]);

  const refreshNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    try {
      setNotifications(await fetchNotificationsFeed());
    } catch (e) {
      console.error('notifications feed failed', e);
    }
  }, [userId]);

  useEffect(() => {
    void refreshSummary();
    void refreshNotifications();
  }, [refreshSummary, refreshNotifications, activeCompanyId]);

  // Foreground: the badge must not be stale after time away.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshSummary();
        void refreshNotifications();
      }
    });
    return () => sub.remove();
  }, [refreshSummary, refreshNotifications]);

  // company_activity is bumped by triggers for every company the user belongs
  // to, so this is the one channel that reaches across the active company.
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`company-activity-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_activity' },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            void refreshSummary();
            void refreshNotifications();
          }, REALTIME_DEBOUNCE_MS);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, refreshSummary, refreshNotifications]);

  const showToast = useCallback((next: SwitchToastState) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const switchTo = useCallback(
    async (companyId: string) => {
      if (companyId === activeCompanyId) return null;
      setSwitching(true);
      try {
        const mode = await switchCompany(companyId);
        await Promise.all([refreshCompanies(), refreshSummary(), refreshNotifications()]);
        const target =
          companies.find((c) => c.companyId === companyId) ??
          summaryRows.find((s) => s.companyId === companyId);
        if (target) {
          showToast({ companyId, name: target.name, logoPath: target.logoPath });
        }
        return mode;
      } finally {
        setSwitching(false);
      }
    },
    [
      activeCompanyId,
      switchCompany,
      refreshCompanies,
      refreshSummary,
      refreshNotifications,
      companies,
      summaryRows,
      showToast,
    ],
  );

  // Push taps, warm and cold start. Waits for companies so a cold start tap
  // can switch before routing. attachNotificationRouting handles the cold
  // start response once per app process.
  const companiesLoaded = companies.length > 0;
  useEffect(() => {
    if (loading || !session?.user || !inModeGroup || !companiesLoaded) return;
    return attachNotificationRouting(
      () => activeMode,
      async (data) => {
        const companyId = data.company_id;
        if (typeof companyId !== 'string' || companyId.length === 0) return null;
        return switchTo(companyId);
      },
      setActiveMode,
    );
  }, [loading, session?.user, inModeGroup, companiesLoaded, activeMode, switchTo, setActiveMode]);

  // Foreground push from another company: banner shows, counts move, no switch.
  useEffect(() => {
    if (!userId) return;
    return attachForegroundPushRefresh(
      () => activeCompanyId,
      () => {
        void refreshSummary();
        void refreshNotifications();
      },
    );
  }, [userId, activeCompanyId, refreshSummary, refreshNotifications]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((rows) =>
      rows.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    try {
      await markNotificationRead(id);
    } catch (e) {
      console.error('mark notification read failed', e);
    }
  }, []);

  const openNotification = useCallback(
    async (n: CompanyNotification) => {
      void markRead(n.id);
      const link = parseDeepLink(n.deepLink);
      let mode: AppMode | null = null;
      if (n.companyId !== activeCompanyId) {
        try {
          mode = await switchTo(n.companyId);
        } catch (e) {
          console.error('notification company switch failed', e);
          return;
        }
      }
      if (!link) return;
      const wanted = modeForDeepLink(link);
      if (wanted !== (mode ?? activeMode)) await setActiveMode(wanted);
      router.push(routeForDeepLink(link) as never);
    },
    [activeCompanyId, activeMode, markRead, switchTo, setActiveMode],
  );

  const summary = useMemo(() => {
    const byId: Record<string, CompanyStatus> = {};
    for (const row of summaryRows) byId[row.companyId] = row;
    return byId;
  }, [summaryRows]);

  const elsewhere = useMemo(
    () =>
      summaryRows
        .filter((s) => s.companyId !== activeCompanyId && s.waiting > 0)
        .sort((a, b) => b.waiting - a.waiting),
    [summaryRows, activeCompanyId],
  );

  const elsewhereTotal = useMemo(
    () => elsewhere.reduce((n, s) => n + s.waiting, 0),
    [elsewhere],
  );

  const anyWaiting = useMemo(() => summaryRows.some((s) => s.waiting > 0), [summaryRows]);

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => n.readAt === null).length,
    [notifications],
  );

  const openSwitcher = useCallback(() => setSwitcherOpen(true), []);
  const closeSwitcher = useCallback(() => setSwitcherOpen(false), []);
  const openNotifications = useCallback(() => {
    void refreshNotifications();
    setNotificationsOpen(true);
  }, [refreshNotifications]);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);

  const value = useMemo<CompanyState>(
    () => ({
      companies,
      active: activeCompany,
      summary,
      summaryRows,
      elsewhere,
      elsewhereTotal,
      anyWaiting,
      notifications,
      unreadNotifications,
      switching,
      toast,
      switcherOpen,
      notificationsOpen,
      switchTo,
      refreshSummary,
      refreshNotifications,
      markRead,
      openNotification,
      openSwitcher,
      closeSwitcher,
      openNotifications,
      closeNotifications,
    }),
    [
      companies,
      activeCompany,
      summary,
      summaryRows,
      elsewhere,
      elsewhereTotal,
      anyWaiting,
      notifications,
      unreadNotifications,
      switching,
      toast,
      switcherOpen,
      notificationsOpen,
      switchTo,
      refreshSummary,
      refreshNotifications,
      markRead,
      openNotification,
      openSwitcher,
      closeSwitcher,
      openNotifications,
      closeNotifications,
    ],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyState {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}
