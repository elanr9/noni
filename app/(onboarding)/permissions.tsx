import { router } from 'expo-router';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

import { OptionCard } from '../../components/ui/OptionCard';
import { OnboardingShell } from './_shell';

export default function PermissionsScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const cameraOn = Boolean(cameraPermission?.granted);
  const micOn = Boolean(micPermission?.granted);

  return (
    <OnboardingShell
      step={10}
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
        onPress={() => void requestCameraPermission()}
      />
      <OptionCard
        label={micOn ? 'Microphone allowed' : 'Allow microphone'}
        selected={micOn}
        onPress={() => void requestMicPermission()}
      />
    </OnboardingShell>
  );
}
