import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { LoadError } from '../../components/creator/v2/LoadError';
import { PlatformBadge, type SetupPlatform } from '../../components/creator/v2/setup/PlatformBadge';
import { Notice, SentBackNote, SetupLabel, UploadSlot } from '../../components/creator/v2/setup/SetupParts';
import { Button, Field, Press, Screen, Skeleton } from '../../components/v2';
import { toast } from '../../components/v2/Toast';
import { useAuth } from '../../lib/auth';
import {
  getAccountTemplate,
  suggestAccountNames,
  type AccountTemplate,
} from '../../lib/account-template';
import { useCompanyNiche } from '../../lib/company-copy-api';
import {
  getCreatorAccount,
  saveCreatorAccountDraft,
  signedVerificationUrl,
  uploadVerificationAsset,
  type CreatorAccount,
} from '../../lib/creator-accounts-api';
import { color, radius, shadow, space, text } from '../../theme/v2';

type ScreenshotKind = 'instagram-screenshot' | 'tiktok-screenshot';

type UploadSlot = {
  kind: ScreenshotKind;
  label: string;
  hint: string;
};

const SLOTS: UploadSlot[] = [
  {
    kind: 'instagram-screenshot',
    label: 'Instagram profile screenshot',
    hint: 'Your full profile page',
  },
  {
    kind: 'tiktok-screenshot',
    label: 'TikTok profile screenshot',
    hint: 'Your full profile page',
  },
];

function existingPath(
  account: CreatorAccount | null,
  kind: ScreenshotKind,
): string | null {
  if (account === null) return null;
  return kind === 'instagram-screenshot'
    ? account.instagram_screenshot_path
    : account.tiktok_screenshot_path;
}

export default function AccountSetupScreen() {
  const { profile } = useAuth();
  const company = useCompanyNiche();
  const [account, setAccount] = useState<CreatorAccount | null>(null);
  const [template, setTemplate] = useState<AccountTemplate | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [tiktokHandle, setTiktokHandle] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [picked, setPicked] = useState<Partial<Record<ScreenshotKind, string>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoadError(null);
    try {
      const [row, tpl] = await Promise.all([
        getCreatorAccount(profile.active_company_id, profile.id),
        getAccountTemplate(profile.active_company_id).catch(() => null),
      ]);
      setAccount(row);
      setTemplate(tpl);
      if (row !== null) {
        setTiktokHandle(row.tiktok_handle ?? '');
        setInstagramHandle(row.instagram_handle ?? '');
      }
      if (tpl?.exampleScreenshotPath) {
        setScreenshotUrl(
          await signedVerificationUrl(tpl.exampleScreenshotPath).catch(() => null),
        );
      }
      if (tpl?.profilePicturePath) {
        setProfilePhotoUrl(
          await signedVerificationUrl(tpl.profilePicturePath).catch(() => null),
        );
      }
    } catch (e) {
      setLoadError(e instanceof Error && e.message ? e.message : null);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyText = async (value: string, label: string) => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    toast.success(`Copied. Paste it into your ${label}.`);
  };

  const nameIdeas = suggestAccountNames(profile?.full_name ?? 'Creator', company);
  const tiktokExample = nameIdeas.usernames[0] ?? 'yourname.creates';
  const instagramExample = nameIdeas.usernames[1] ?? nameIdeas.usernames[0] ?? 'yourname.creates';

  const pickSlot = async (slot: UploadSlot) => {
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? `Could not open your photos. ${e.message}` : 'Could not open your photos. Try again.');
      return;
    }
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset === undefined) return;
    setPicked((prev) => ({ ...prev, [slot.kind]: asset.uri }));
  };

  const save = async () => {
    if (!profile) return;
    if (tiktokHandle.trim().length === 0 || instagramHandle.trim().length === 0) {
      toast.error('Add both your new TikTok and Instagram handles.');
      return;
    }
    const missing = SLOTS.filter(
      (slot) => picked[slot.kind] === undefined && existingPath(account, slot.kind) === null,
    );
    if (missing.length > 0) {
      toast.error(`Add your ${missing.map((s) => s.label).join(' and ')} first.`);
      return;
    }
    setBusy(true);
    try {
      const paths: Record<ScreenshotKind, string> = {
        'instagram-screenshot': '',
        'tiktok-screenshot': '',
      };
      for (const slot of SLOTS) {
        const local = picked[slot.kind];
        paths[slot.kind] =
          local !== undefined
            ? await uploadVerificationAsset({
                companyId: profile.active_company_id,
                creatorId: profile.id,
                kind: slot.kind,
                localUri: local,
                contentType: 'image/jpeg',
              })
            : existingPath(account, slot.kind) ?? '';
      }
      await saveCreatorAccountDraft({
        companyId: profile.active_company_id,
        creatorId: profile.id,
        tiktokHandle: tiktokHandle.trim().replace(/^@/, ''),
        instagramHandle: instagramHandle.trim().replace(/^@/, ''),
        instagramScreenshotPath: paths['instagram-screenshot'],
        tiktokScreenshotPath: paths['tiktok-screenshot'],
      });
      setPicked({});
      await load();
      toast.success('Accounts saved. Next up: connect them, then warm them up.');
    } catch (e) {
      toast.error(e instanceof Error && e.message ? `Could not save. ${e.message}` : 'Could not save. Try again.', { label: 'Retry', onPress: () => void save() });
    } finally {
      setBusy(false);
    }
  };

  const status = account?.status ?? null;
  const formOpen = status === null || status === 'needs_changes';

  const footer =
    !loading && loadError === null && formOpen ? (
      <Button label={busy ? 'Uploading' : 'Save accounts'} disabled={busy} onPress={() => void save()} />
    ) : undefined;

  return (
    <Screen back title="Account setup" footer={footer}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.screen, paddingTop: space[2], paddingBottom: space[8] }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <>
            <Skeleton h={72} />
            <Skeleton h={120} />
            <Skeleton h={120} />
          </>
        ) : loadError !== null ? (
          <LoadError
            title="Could not load your accounts"
            message={loadError}
            retrying={retrying}
            onRetry={() => {
              setRetrying(true);
              void load().finally(() => setRetrying(false));
            }}
          />
        ) : (
          <Animated.View entering={FadeIn.duration(220)}>
            {status === 'approved' ? (
              <Notice tone="green" icon="check_circle" title="Accounts approved" body="You are cleared to receive posts." />
            ) : null}
            {status === 'pending' ? (
              <Notice tone="blue" icon="schedule" title="In review" body="Your accounts are submitted. You will hear back soon." />
            ) : null}
            {status === 'needs_changes' && account?.reason != null ? <SentBackNote reason={account.reason} /> : null}

            <Text style={[text.body, { color: color.grey4 }]}>
              Make a fresh TikTok and a fresh Instagram. Use the examples below, then save your handles and one screenshot of each profile.
            </Text>

            <SetupLabel>Example usernames</SetupLabel>
            <Group>
              <SuggestRow
                platform="tiktok"
                label="TikTok"
                value={`@${tiktokExample}`}
                action="Use"
                onPress={() => {
                  void copyText(tiktokExample, 'TikTok username');
                  if (!tiktokHandle) setTiktokHandle(tiktokExample);
                }}
              />
              <SuggestRow
                platform="instagram"
                label="Instagram"
                value={`@${instagramExample}`}
                action="Use"
                last
                onPress={() => {
                  void copyText(instagramExample, 'Instagram username');
                  if (!instagramHandle) setInstagramHandle(instagramExample);
                }}
              />
            </Group>

            {template !== null ? (
              <>
                <SetupLabel>Bio and photo</SetupLabel>
                <Group>
                  {template.instagramBio.length > 0 ? (
                    <SuggestRow
                      label={template.tiktokBio === template.instagramBio || template.tiktokBio.length === 0 ? 'Bio for both apps' : 'Instagram bio'}
                      value={template.instagramBio}
                      action="Copy"
                      onPress={() => void copyText(template.instagramBio, 'bio')}
                    />
                  ) : null}
                  {template.tiktokBio.length > 0 && template.tiktokBio !== template.instagramBio ? (
                    <SuggestRow label="TikTok bio" value={template.tiktokBio} action="Copy" onPress={() => void copyText(template.tiktokBio, 'TikTok bio')} />
                  ) : null}
                  {template.instagramLink.length > 0 ? (
                    <SuggestRow
                      label="Link for your Instagram bio"
                      value={template.instagramLink}
                      action="Copy"
                      onPress={() => void copyText(template.instagramLink, 'Instagram link')}
                    />
                  ) : null}
                  {profilePhotoUrl !== null ? (
                    <View style={{ gap: 8, paddingVertical: 12, borderBottomWidth: screenshotUrl !== null ? 1 : 0, borderBottomColor: color.grey1 }}>
                      <Text style={text.meta}>Use this profile photo</Text>
                      <Image source={{ uri: profilePhotoUrl }} resizeMode="cover" style={{ width: 96, height: 96, borderRadius: radius.pill, backgroundColor: color.grey1 }} />
                    </View>
                  ) : null}
                  {screenshotUrl !== null ? (
                    <View style={{ gap: 8, paddingVertical: 12 }}>
                      <Text style={text.meta}>Your profile should look like this</Text>
                      <Image source={{ uri: screenshotUrl }} resizeMode="cover" style={{ width: '100%', aspectRatio: 2.6, borderRadius: radius.thumb, backgroundColor: color.grey1 }} />
                    </View>
                  ) : null}
                </Group>
              </>
            ) : null}

            {formOpen ? (
              <Animated.View entering={FadeInDown.duration(240)}>
                <SetupLabel>Your handles</SetupLabel>
                <Field value={tiktokHandle} onChange={setTiktokHandle} placeholder="TikTok handle" autoCapitalize="none" autoCorrect={false} editable={!busy} />
                <Field value={instagramHandle} onChange={setInstagramHandle} placeholder="Instagram handle" autoCapitalize="none" autoCorrect={false} editable={!busy} />

                <SetupLabel>Profile screenshots</SetupLabel>
                {SLOTS.map((slot, i) => (
                  <UploadSlot
                    key={slot.kind}
                    icon="image"
                    label={slot.label}
                    hint={slot.hint}
                    index={i}
                    disabled={busy}
                    chosen={picked[slot.kind] !== undefined}
                    already={existingPath(account, slot.kind) !== null}
                    onPress={() => void pickSlot(slot)}
                  />
                ))}
              </Animated.View>
            ) : null}
          </Animated.View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: color.card, borderRadius: radius.card, paddingHorizontal: 16, marginBottom: space[2], ...shadow.card }}>{children}</View>;
}

function SuggestRow({
  platform,
  label,
  value,
  action,
  last,
  onPress,
}: {
  platform?: SetupPlatform;
  label: string;
  value: string;
  action: string;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: color.grey1 }}>
      {platform ? <PlatformBadge platform={platform} size={32} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={text.meta}>{label}</Text>
        <Text style={[text.body, { fontWeight: '600' }]}>{value}</Text>
      </View>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`${action} ${label}`}
        onPress={onPress}
        style={{ height: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: color.blueTint, justifyContent: 'center' }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: color.blueDeep }}>{action}</Text>
      </Press>
    </View>
  );
}
