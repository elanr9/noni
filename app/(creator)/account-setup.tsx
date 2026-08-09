import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';

import { SentBackCard } from '../../components/states';
import { Button } from '../../components/ui/Button';
import { Icon, type IconName } from '../../components/ui/Icon';
import { PressableScale } from '../../components/ui/PressableScale';
import { SkeletonLine } from '../../components/ui/Skeleton';
import { useAuth } from '../../lib/auth';
import {
  getAccountTemplate,
  suggestAccountNames,
  type AccountTemplate,
} from '../../lib/account-template';
import {
  getCreatorAccount,
  saveCreatorAccountDraft,
  signedVerificationUrl,
  uploadVerificationAsset,
  type CreatorAccount,
} from '../../lib/creator-accounts-api';
import { borderWidth, color, radius, shadow, space, type } from '../../theme/tokens';

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
  const [account, setAccount] = useState<CreatorAccount | null>(null);
  const [template, setTemplate] = useState<AccountTemplate | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [tiktokHandle, setTiktokHandle] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [picked, setPicked] = useState<Partial<Record<ScreenshotKind, string>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [row, tpl] = await Promise.all([
        getCreatorAccount(profile.company_id, profile.id),
        getAccountTemplate(profile.company_id).catch(() => null),
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
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
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
    Alert.alert('Copied', `Paste it into your ${label}.`);
  };

  const nameIdeas = suggestAccountNames(profile?.full_name ?? 'Creator');

  const pickSlot = async (slot: UploadSlot) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset === undefined) return;
    setPicked((prev) => ({ ...prev, [slot.kind]: asset.uri }));
  };

  const save = async () => {
    if (!profile) return;
    if (tiktokHandle.trim().length === 0 || instagramHandle.trim().length === 0) {
      Alert.alert('Handles required', 'Add both your new TikTok and Instagram handles.');
      return;
    }
    const missing = SLOTS.filter(
      (slot) => picked[slot.kind] === undefined && existingPath(account, slot.kind) === null,
    );
    if (missing.length > 0) {
      Alert.alert('Screenshots missing', missing.map((s) => s.label).join('\n'));
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
                companyId: profile.company_id,
                creatorId: profile.id,
                kind: slot.kind,
                localUri: local,
                contentType: 'image/jpeg',
              })
            : existingPath(account, slot.kind) ?? '';
      }
      await saveCreatorAccountDraft({
        companyId: profile.company_id,
        creatorId: profile.id,
        tiktokHandle: tiktokHandle.trim().replace(/^@/, ''),
        instagramHandle: instagramHandle.trim().replace(/^@/, ''),
        instagramScreenshotPath: paths['instagram-screenshot'],
        tiktokScreenshotPath: paths['tiktok-screenshot'],
      });
      setPicked({});
      await load();
      Alert.alert(
        'Accounts saved',
        'Next up: connect them, then warm them up and submit proof.',
      );
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const status = account?.status ?? null;
  const formOpen = status === null || status === 'needs_changes';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {loading ? (
        <View style={styles.loadingStack}>
          <SkeletonLine width="100%" height={72} radius={radius.lg} />
          <SkeletonLine width="100%" height={120} radius={radius.lg} />
          <SkeletonLine width="100%" height={120} radius={radius.lg} />
        </View>
      ) : (
        <>
          {status === 'approved' && (
            <StatusCard
              icon="circle-check-big"
              tint={color.green}
              bg={color.greenSoft}
              title="Accounts approved"
              body="You are cleared to receive posts."
            />
          )}
          {status === 'pending' && (
            <StatusCard
              icon="clock"
              tint={color.blue700}
              bg={color.blue100}
              title="In review"
              body="Your accounts are submitted. You will hear back soon."
            />
          )}
          {status === 'needs_changes' && account?.reason != null ? (
            <SentBackCard reason={account.reason} />
          ) : null}

          <Text style={styles.body}>
            Create a fresh TikTok and Instagram account that match the
            template below. Save your handles and a screenshot of each
            profile. Warming up and proof come in the next step.
          </Text>

          <Text style={styles.section}>Name ideas</Text>
          <View style={[styles.card, shadow.shadowCard]}>
            <Text style={styles.cardLabel}>Display name</Text>
            <Text style={styles.hintInline}>
              Use your name plus College Soccer Recruiting.
            </Text>
            {nameIdeas.displayNames.map((name) => (
              <View key={name} style={styles.suggestRow}>
                <Text style={styles.bioText}>{name}</Text>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => void copyText(name, 'display name')}
                >
                  Copy
                </Button>
              </View>
            ))}
            <Text style={styles.cardLabel}>Username</Text>
            <Text style={styles.hintInline}>
              Mix your name with d1soccer, d1recruit, recruiting, and similar.
            </Text>
            {nameIdeas.usernames.map((handle) => (
              <View key={handle} style={styles.suggestRow}>
                <Text style={styles.bioText}>@{handle}</Text>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    void copyText(handle, 'username');
                    if (!instagramHandle) setInstagramHandle(handle);
                    if (!tiktokHandle) setTiktokHandle(handle);
                  }}
                >
                  Use
                </Button>
              </View>
            ))}
          </View>

          {template !== null && (
            <>
              <Text style={styles.section}>The standard</Text>
              <View style={[styles.card, shadow.shadowCard]}>
                {template.instagramBio.length > 0 && (
                  <>
                    <Text style={styles.cardLabel}>Instagram bio</Text>
                    <Text style={styles.bioText}>{template.instagramBio}</Text>
                    <Button
                      size="sm"
                      variant="outline"
                      icon="link"
                      onPress={() => void copyText(template.instagramBio, 'Instagram bio')}
                    >
                      Copy Instagram bio
                    </Button>
                  </>
                )}
                {template.instagramLink.length > 0 && (
                  <>
                    <Text style={styles.cardLabel}>Instagram link</Text>
                    <Text style={styles.bioText}>{template.instagramLink}</Text>
                    <Button
                      size="sm"
                      variant="outline"
                      icon="link"
                      onPress={() =>
                        void copyText(template.instagramLink, 'Instagram link')
                      }
                    >
                      Copy Instagram link
                    </Button>
                  </>
                )}
                {template.tiktokBio.length > 0 && (
                  <>
                    <Text style={styles.cardLabel}>TikTok bio</Text>
                    <Text style={styles.bioText}>{template.tiktokBio}</Text>
                    <Button
                      size="sm"
                      variant="outline"
                      icon="link"
                      onPress={() => void copyText(template.tiktokBio, 'TikTok bio')}
                    >
                      Copy TikTok bio
                    </Button>
                  </>
                )}
                {screenshotUrl !== null && (
                  <View style={styles.templateAsset}>
                    <Text style={styles.cardLabel}>Example account</Text>
                    <Image
                      source={{ uri: screenshotUrl }}
                      style={styles.templateScreenshot}
                      resizeMode="cover"
                    />
                  </View>
                )}
              </View>
            </>
          )}

          {formOpen && (
            <>
              <Text style={styles.section}>Your handles</Text>
              <TextInput
                style={styles.input}
                value={tiktokHandle}
                onChangeText={setTiktokHandle}
                placeholder="TikTok handle"
                placeholderTextColor={color.slate400}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                value={instagramHandle}
                onChangeText={setInstagramHandle}
                placeholder="Instagram handle"
                placeholderTextColor={color.slate400}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.section}>Profile screenshots</Text>
              {SLOTS.map((slot) => {
                const chosen = picked[slot.kind] !== undefined;
                const already = existingPath(account, slot.kind) !== null;
                return (
                  <PressableScale
                    key={slot.kind}
                    accessibilityRole="button"
                    accessibilityLabel={slot.label}
                    disabled={busy}
                    onPress={() => void pickSlot(slot)}
                    style={[styles.slot, shadow.shadowCard]}
                  >
                    <Icon
                      name="images"
                      size={19}
                      color={chosen || already ? color.green : color.slate400}
                    />
                    <View style={styles.slotText}>
                      <Text style={styles.slotLabel}>{slot.label}</Text>
                      <Text style={styles.slotHint}>
                        {chosen
                          ? 'Ready to upload'
                          : already
                            ? 'Uploaded. Tap to replace'
                            : slot.hint}
                      </Text>
                    </View>
                    {(chosen || already) && (
                      <Icon name="circle-check-big" size={18} color={color.green} />
                    )}
                  </PressableScale>
                );
              })}

              <Button
                size="lg"
                variant="primary"
                block
                disabled={busy}
                onPress={() => void save()}
              >
                {busy ? 'Uploading…' : 'Save accounts'}
              </Button>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function StatusCard(props: {
  icon: IconName;
  tint: string;
  bg: string;
  title: string;
  body: string;
}) {
  return (
    <View style={[styles.statusCard, { backgroundColor: props.bg }]}>
      <Icon name={props.icon} size={20} color={props.tint} />
      <View style={styles.statusText}>
        <Text style={[styles.statusTitle, { color: props.tint }]}>{props.title}</Text>
        <Text style={styles.statusBody}>{props.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: space.gutter, paddingVertical: 12, gap: 10, paddingBottom: 48 },
  loadingStack: {
    gap: space[4],
  },
  statusCard: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: radius.md,
    padding: 14,
  },
  statusText: { flex: 1, gap: 2 },
  statusTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '800',
  },
  statusBody: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.ink,
    lineHeight: 19,
  },
  body: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: 21,
  },
  section: {
    marginTop: 10,
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 10,
  },
  cardLabel: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
  hintInline: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
    marginTop: -4,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  bioText: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '500',
    color: color.ink,
    lineHeight: 21,
  },
  templateAsset: { gap: 8, marginTop: 4 },
  templateScreenshot: {
    width: '100%',
    aspectRatio: 2.6,
    borderRadius: radius.cell,
    backgroundColor: color.fillQuiet,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    backgroundColor: color.white,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: type.size.bodySm,
    color: color.ink,
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  slotText: { flex: 1, gap: 2 },
  slotLabel: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  slotHint: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
  },
});
