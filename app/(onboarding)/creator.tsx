import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

import { Screen, colors } from '../../components/Screen';
import { OptionCard, StepShell } from '../../components/OnboardingUI';
import { useAuth } from '../../lib/auth';
import {
  getSocialConnectStatus,
  getSocialConnectUrl,
  type SocialConnectStatus,
} from '../../lib/admin-api';
import { saveCreatorBasics, uploadAvatar } from '../../lib/onboarding';

const TOTAL_STEPS = 4;

function connectedLabel(value: unknown): string {
  if (!value) return 'Not connected';
  if (typeof value === 'string') return value || 'Not connected';
  if (typeof value === 'object') {
    const obj = value as { display_name?: string; username?: string };
    return obj.display_name ?? obj.username ?? 'Connected';
  }
  return 'Connected';
}

export default function CreatorOnboarding() {
  const router = useRouter();
  const { profile } = useAuth();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [selfieUri, setSelfieUri] = useState<string | null>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [socialStatus, setSocialStatus] = useState<SocialConnectStatus | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);

  useEffect(() => {
    if (step !== 2) return;
    setSocialLoading(true);
    void getSocialConnectStatus()
      .then(setSocialStatus)
      .catch(() => setSocialStatus(null))
      .finally(() => setSocialLoading(false));
  }, [step]);

  async function takeSelfie() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera needed', 'Noni needs the camera for your avatar selfie.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setSelfieUri(result.assets[0].uri);
    }
  }

  async function saveBasics() {
    if (!profile) return;
    setBusy(true);
    try {
      let avatarPath: string | null = profile.avatar_path;
      if (selfieUri) {
        avatarPath = await uploadAvatar(profile.company_id, profile.id, selfieUri);
      }
      await saveCreatorBasics(profile.id, fullName.trim(), avatarPath);
      setStep(1);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  async function connectSocials() {
    setBusy(true);
    try {
      const url = await getSocialConnectUrl();
      await WebBrowser.openBrowserAsync(url);
      setSocialStatus(await getSocialConnectStatus());
    } catch (e) {
      Alert.alert('Connect failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  if (step === 0) {
    return (
      <Screen>
        <StepShell
          step={0}
          total={TOTAL_STEPS}
          title="Who are you?"
          subtitle="Your name and face, so your team knows whose takes they are watching."
          primaryLabel={busy ? 'Saving…' : 'Next'}
          onPrimary={() => void saveBasics()}
          primaryDisabled={!fullName.trim() || busy}
        >
          <Text style={styles.label}>Your name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Alex Rivera"
            autoCapitalize="words"
          />
          <View style={styles.selfieRow}>
            {selfieUri ? (
              <Image source={{ uri: selfieUri }} style={styles.selfie} />
            ) : (
              <View style={[styles.selfie, styles.selfieEmpty]}>
                <Text style={styles.selfieEmptyText}>You</Text>
              </View>
            )}
            <Text style={styles.selfieBtn} onPress={() => void takeSelfie()}>
              {selfieUri ? 'Retake selfie' : 'Take a selfie'}
            </Text>
          </View>
        </StepShell>
      </Screen>
    );
  }

  if (step === 1) {
    return (
      <Screen>
        <StepShell
          step={1}
          total={TOTAL_STEPS}
          title="Two permissions"
          subtitle="Both are only used while you record."
          onBack={() => setStep(0)}
          primaryLabel="Next"
          onPrimary={() => setStep(2)}
          primaryDisabled={!cameraPermission?.granted || !micPermission?.granted}
        >
          <OptionCard
            label={cameraPermission?.granted ? 'Camera on ✓' : 'Allow camera'}
            hint="So you can record your takes in the app"
            selected={Boolean(cameraPermission?.granted)}
            onPress={() => void requestCameraPermission()}
          />
          <OptionCard
            label={micPermission?.granted ? 'Mic on ✓' : 'Allow mic'}
            hint="So your takes have sound"
            selected={Boolean(micPermission?.granted)}
            onPress={() => void requestMicPermission()}
          />
        </StepShell>
      </Screen>
    );
  }

  if (step === 2) {
    const accounts = socialStatus?.social_accounts ?? {};
    return (
      <Screen>
        <StepShell
          step={2}
          total={TOTAL_STEPS}
          title="Connect your accounts"
          subtitle="Approved content posts to your own TikTok and Instagram."
          onBack={() => setStep(1)}
          primaryLabel="Next"
          onPrimary={() => setStep(3)}
        >
          {socialLoading ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <View style={styles.statusCard}>
              <Text style={styles.label}>TikTok</Text>
              <Text style={styles.statusValue}>{connectedLabel(accounts.tiktok)}</Text>
              <Text style={styles.label}>Instagram</Text>
              <Text style={styles.statusValue}>{connectedLabel(accounts.instagram)}</Text>
            </View>
          )}
          <OptionCard
            label={busy ? 'Opening…' : 'Connect socials'}
            hint="You can also do this later in Settings"
            selected={false}
            onPress={() => {
              if (!busy) void connectSocials();
            }}
          />
        </StepShell>
      </Screen>
    );
  }

  return (
    <Screen>
      <StepShell
        step={3}
        total={TOTAL_STEPS}
        title="Learn the teleprompter"
        subtitle="Record a 15 second practice clip against sample text. It goes nowhere, it is just for you."
        onBack={() => setStep(2)}
        primaryLabel="Try the teleprompter"
        onPrimary={() => router.push('/(onboarding)/practice')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.ink,
  },
  selfieRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 },
  selfie: { width: 88, height: 88, borderRadius: 44 },
  selfieEmpty: {
    backgroundColor: '#E6E2DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfieEmptyText: { color: colors.muted, fontWeight: '700' },
  selfieBtn: { fontSize: 16, fontWeight: '700', color: colors.accent, padding: 8 },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    padding: 18,
    gap: 4,
  },
  statusValue: { fontSize: 16, fontWeight: '600', color: colors.ink },
});
