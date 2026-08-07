import { router } from 'expo-router';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

import { CalOption, CalShell } from '../../components/OnboardingUI';

const TOTAL = 12;

export default function PermissionsScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const cameraOn = Boolean(cameraPermission?.granted);
  const micOn = Boolean(micPermission?.granted);

  return (
    <CalShell
      progress={11 / TOTAL}
      onBack={() => router.back()}
      title="Camera and microphone"
      subtitle="Both are only used while you record. Tap each to allow."
      primaryLabel="Continue"
      primaryDisabled={!cameraOn || !micOn}
      onPrimary={() => router.push('/(onboarding)/done')}
    >
      <CalOption
        label={cameraOn ? 'Camera allowed' : 'Allow camera'}
        selected={cameraOn}
        onPress={() => void requestCameraPermission()}
      />
      <CalOption
        label={micOn ? 'Microphone allowed' : 'Allow microphone'}
        selected={micOn}
        onPress={() => void requestMicPermission()}
      />
    </CalShell>
  );
}
