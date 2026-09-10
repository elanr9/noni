import { useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import { router } from 'expo-router';
import {
  useCameraPermissions,
  useMicrophonePermissions,
  type PermissionResponse,
} from 'expo-camera';

import { OptionCard } from '../../components/ui/OptionCard';
import { OnboardingShell } from './_shell';

function askOrOpenSettings(
  permission: PermissionResponse | null,
  request: () => Promise<PermissionResponse>,
): void {
  if (permission && !permission.granted && !permission.canAskAgain) {
    void Linking.openSettings();
    return;
  }
  void request();
}

export default function PermissionsScreen() {
  const [cameraPermission, requestCameraPermission, getCameraPermission] =
    useCameraPermissions();
  const [micPermission, requestMicPermission, getMicPermission] =
    useMicrophonePermissions();

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void getCameraPermission();
      void getMicPermission();
    });
    return () => sub.remove();
  }, [getCameraPermission, getMicPermission]);

  const cameraOn = Boolean(cameraPermission?.granted);
  const micOn = Boolean(micPermission?.granted);

  return (
    <OnboardingShell
      step={2}
      total={3}
      onBack={() => router.back()}
      title="Camera and microphone"
      subtitle="Both are only used while you record. Tap each to allow."
      primaryLabel="Continue"
      primaryDisabled={!cameraOn || !micOn}
      onPrimary={() => router.push('/(onboarding)/done')}
    >
      <OptionCard
        label={cameraOn ? 'Camera allowed' : 'Allow camera'}
        selected={cameraOn}
        onPress={() => askOrOpenSettings(cameraPermission, requestCameraPermission)}
      />
      <OptionCard
        label={micOn ? 'Microphone allowed' : 'Allow microphone'}
        selected={micOn}
        onPress={() => askOrOpenSettings(micPermission, requestMicPermission)}
      />
    </OnboardingShell>
  );
}
