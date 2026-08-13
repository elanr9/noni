import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { CopyChip } from '../../components/admin/approval/CopyChip';
import { AdminScreen, PushHeader, SectionLabel } from '../../components/admin/shared';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { PressableScale } from '../../components/ui/PressableScale';
import { useAuth } from '../../lib/auth';
import {
  getAccountTemplate,
  saveAccountTemplate,
  uploadTemplateAsset,
  type AccountTemplate,
} from '../../lib/account-template';
import { signedVerificationUrl } from '../../lib/creator-accounts-api';
import { borderWidth, color, radiusAdmin, type } from '../../theme/tokens';

const EMPTY: AccountTemplate = {
  instagramBio: '',
  tiktokBio: '',
  instagramLink: '',
  profilePicturePath: null,
  exampleScreenshotPath: null,
};

/** Wide profile-header crop (avatar + bio), not a full phone frame. */
const EXAMPLE_ASPECT = 2.6;

async function pickImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
  return result.canceled ? null : result.assets[0]?.uri ?? null;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(admin)/(tabs)/settings');
}

export default function AccountTemplateScreen() {
  const { profile, permissions } = useAuth();
  const canEdit = permissions.edit_account_template;
  const [template, setTemplate] = useState<AccountTemplate>(EMPTY);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const saved = await getAccountTemplate(profile.company_id);
      if (saved !== null) {
        setTemplate(saved);
        if (saved.exampleScreenshotPath !== null) {
          setScreenshotUrl(
            await signedVerificationUrl(saved.exampleScreenshotPath).catch(() => null),
          );
        }
        if (saved.profilePicturePath !== null) {
          setPictureUrl(
            await signedVerificationUrl(saved.profilePicturePath).catch(() => null),
          );
        }
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

  const persist = async (next: AccountTemplate) => {
    if (!profile) return;
    await saveAccountTemplate(profile.company_id, next);
  };

  const replaceScreenshot = async () => {
    if (!profile) return;
    const uri = await pickImage();
    if (uri === null) return;
    setBusy(true);
    try {
      const path = await uploadTemplateAsset(
        profile.company_id,
        'example-screenshot',
        uri,
      );
      const next = { ...template, exampleScreenshotPath: path };
      await persist(next);
      setTemplate(next);
      setScreenshotUrl(await signedVerificationUrl(path).catch(() => null));
    } catch (e) {
      Alert.alert('Could not upload', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const saveCopy = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      await persist(template);
      Alert.alert('Saved', 'Creators see the updated template on their setup screen.');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminScreen
      actionBar={
        loading || !canEdit ? undefined : (
          <Button size="md" variant="primary" block disabled={busy} onPress={() => void saveCopy()}>
            Save
          </Button>
        )
      }
    >
      <Stack.Screen options={{ headerShown: false }} />
      <PushHeader
        title="Account template"
        subtitle="Creators see the same values during setup"
        onBack={goBack}
      />

      {loading ? (
        <Text style={styles.loading}>Loading template…</Text>
      ) : (
        <>
          <Text style={styles.body}>
            {canEdit
              ? 'The standard for a creator account. Creators copy the bios and Instagram link, then match the example look. Setup also suggests display names like Name | College Soccer Recruiting and usernames like name.d1soccer.'
              : 'The standard for a creator account. Your Noni admin manages this template; you can view it but not change it.'}
          </Text>

          <SectionLabel style={styles.sectionLabel}>Instagram bio</SectionLabel>
          <View style={styles.fieldCard}>
            <TextInput
              style={styles.bioInput}
              value={template.instagramBio}
              onChangeText={(instagramBio) =>
                setTemplate((t) => ({ ...t, instagramBio }))
              }
              placeholder="Exact Instagram bio creators should use"
              placeholderTextColor={color.slate400}
              multiline
              editable={canEdit}
            />
            <View style={styles.fieldFooter}>
              <CopyChip value={template.instagramBio} label="Instagram bio" />
            </View>
          </View>

          <SectionLabel style={styles.sectionLabel}>Link in bio</SectionLabel>
          <View style={styles.fieldCard}>
            <View style={styles.linkRow}>
              <TextInput
                style={styles.linkInput}
                value={template.instagramLink}
                onChangeText={(instagramLink) =>
                  setTemplate((t) => ({ ...t, instagramLink }))
                }
                placeholder="fieldvisionai.com"
                placeholderTextColor={color.slate400}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={canEdit}
              />
              <CopyChip value={template.instagramLink} label="link in bio" />
            </View>
          </View>

          <SectionLabel style={styles.sectionLabel}>TikTok bio</SectionLabel>
          <View style={styles.fieldCard}>
            <TextInput
              style={styles.bioInput}
              value={template.tiktokBio}
              onChangeText={(tiktokBio) => setTemplate((t) => ({ ...t, tiktokBio }))}
              placeholder="Exact TikTok bio creators should use"
              placeholderTextColor={color.slate400}
              multiline
              editable={canEdit}
            />
            <View style={styles.fieldFooter}>
              <CopyChip value={template.tiktokBio} label="TikTok bio" />
            </View>
          </View>

          <SectionLabel style={styles.sectionLabel}>Profile picture</SectionLabel>
          <View style={styles.pictureCard}>
            <View style={styles.pictureThumb}>
              {pictureUrl !== null ? (
                <Image
                  source={{ uri: pictureUrl }}
                  resizeMode="cover"
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <Icon name="circle-user-round" size={26} color={color.slate300} />
              )}
            </View>
            <View style={styles.pictureText}>
              <Text style={styles.pictureTitle}>1080 × 1080</Text>
              <Text style={styles.pictureMeta}>
                {pictureUrl !== null
                  ? 'Every creator account uses this picture.'
                  : 'No profile picture yet.'}
              </Text>
            </View>
            {pictureUrl !== null && (
              <Button
                size="sm"
                variant="tint"
                onPress={() => void Linking.openURL(pictureUrl)}
              >
                Download
              </Button>
            )}
          </View>

          <SectionLabel style={styles.sectionLabel}>Example account</SectionLabel>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Replace example account screenshot"
            disabled={busy || !canEdit}
            onPress={() => void replaceScreenshot()}
            style={styles.screenshotSlot}
          >
            {screenshotUrl !== null ? (
              <Image
                source={{ uri: screenshotUrl }}
                style={styles.screenshot}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.slotText}>
                Tap to add a profile header screenshot of an example account
              </Text>
            )}
          </PressableScale>
          <Text style={styles.barLine}>
            This is the bar. Same bio shape, same grid, no gym content.
          </Text>
        </>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  body: {
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.5,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  sectionLabel: {
    marginTop: 18,
    marginBottom: 8,
  },
  fieldCard: {
    gap: 8,
    padding: 12,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  bioInput: {
    minHeight: 84,
    textAlignVertical: 'top',
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * 1.45,
    color: color.ink,
    padding: 0,
  },
  fieldFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkInput: {
    flex: 1,
    fontSize: type.size.bodySm,
    color: color.ink,
    padding: 0,
  },
  pictureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  pictureThumb: {
    width: 56,
    height: 56,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pictureText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pictureTitle: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  pictureMeta: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  screenshotSlot: {
    width: '100%',
    aspectRatio: EXAMPLE_ASPECT,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenshot: {
    width: '100%',
    height: '100%',
  },
  slotText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.semibold,
    color: color.slate500,
    textAlign: 'center',
    paddingHorizontal: 14,
  },
  barLine: {
    marginTop: 8,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.45,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
});
