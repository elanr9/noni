import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

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
import { borderWidth, color, radius, shadow, space, type } from '../../theme/tokens';

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
  const { profile } = useAuth();
  const [template, setTemplate] = useState<AccountTemplate>(EMPTY);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
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
    await saveAccountTemplate(profile.company_id, {
      ...next,
      profilePicturePath: null,
    });
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
      const next = {
        ...template,
        profilePicturePath: null,
        exampleScreenshotPath: path,
      };
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
    <>
      <Stack.Screen
        options={{
          title: 'Account template',
          headerLeft: () => (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={goBack}
              hitSlop={8}
            >
              <Icon name="chevron-left" size={22} color={color.ink} />
            </PressableScale>
          ),
        }}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <Text style={styles.empty}>Loading template…</Text>
        ) : (
          <>
          <Text style={styles.body}>
            The standard for a creator account. Creators copy the bios and
            Instagram link, then match the example look. Setup also suggests
            display names like Name | College Soccer Recruiting and usernames
            like name.d1soccer.
          </Text>

          <Text style={styles.section}>Instagram bio</Text>
            <TextInput
              style={styles.bioInput}
              value={template.instagramBio}
              onChangeText={(instagramBio) =>
                setTemplate((t) => ({ ...t, instagramBio }))
              }
              placeholder="Exact Instagram bio creators should use"
              placeholderTextColor={color.slate400}
              multiline
            />

            <Text style={styles.section}>Instagram link</Text>
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
            />

            <Text style={styles.section}>TikTok bio</Text>
            <TextInput
              style={styles.bioInput}
              value={template.tiktokBio}
              onChangeText={(tiktokBio) =>
                setTemplate((t) => ({ ...t, tiktokBio }))
              }
              placeholder="Exact TikTok bio creators should use"
              placeholderTextColor={color.slate400}
              multiline
            />

            <Button
              size="md"
              variant="primary"
              disabled={busy}
              onPress={() => void saveCopy()}
            >
              Save
            </Button>

            <Text style={styles.section}>Example account</Text>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Replace example account screenshot"
              disabled={busy}
              onPress={() => void replaceScreenshot()}
              style={[styles.screenshotSlot, shadow.shadowCard]}
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
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: {
    paddingHorizontal: space.gutter,
    paddingVertical: 12,
    gap: 10,
    paddingBottom: 40,
  },
  empty: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    fontWeight: '600',
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
  bioInput: {
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    backgroundColor: color.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.size.bodySm,
    color: color.ink,
    textAlignVertical: 'top',
  },
  linkInput: {
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    backgroundColor: color.white,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: type.size.bodySm,
    color: color.ink,
  },
  screenshotSlot: {
    width: '100%',
    aspectRatio: EXAMPLE_ASPECT,
    borderRadius: radius.md,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenshot: { width: '100%', height: '100%' },
  slotText: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
    textAlign: 'center',
    paddingHorizontal: 14,
  },
});
