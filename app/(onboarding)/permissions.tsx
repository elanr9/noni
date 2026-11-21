import { useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { router } from 'expo-router';
import { useCameraPermissions, useMicrophonePermissions, type PermissionResponse } from 'expo-camera';

import { toast } from '../../components/v2/Toast';
import { OnboardingShell, QuietButton, StepCard } from './_shell';

/** Asks, or opens Settings once the system will not ask again. Resolves with whether it is granted now. */
async function askOrOpenSettings(permission: PermissionResponse | null, request: () => Promise<PermissionResponse>): Promise<boolean> {
  if (permission?.granted) return true;
  if (permission && !permission.canAskAgain) {
    await Linking.openSettings();
    return false;
  }
  return (await request()).granted;
}

/** Step 3: camera and microphone, both needed to film with the teleprompter. */
export default function PermissionsScreen() {
  const [camera, requestCamera, getCamera] = useCameraPermissions();
  const [mic, requestMic, getMic] = useMicrophonePermissions();
  const [busy, setBusy] = useState(false);

  // Coming back from Settings picks up the change.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void getCamera();
      void getMic();
    });
    return () => sub.remove();
  }, [getCamera, getMic]);

  const cameraOn = !!camera?.granted;
  const micOn = !!mic?.granted;
  const both = cameraOn && micOn;
  const next = () => router.push('/(onboarding)/notifications');

  const allow = async () => {
    if (both) {
      next();
      return;
    }
    setBusy(true);
    try {
      const cam = await askOrOpenSettings(camera, requestCamera);
      const m = cam ? await askOrOpenSettings(mic, requestMic) : false;
      if (cam && m) next();
    } catch {
      toast.error('Could not ask for access. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const one = async (which: 'camera' | 'mic') => {
    try {
      if (which === 'camera') await askOrOpenSettings(camera, requestCamera);
      else await askOrOpenSettings(mic, requestMic);
    } catch {
      toast.error('Could not ask for access. Try again.');
    }
  };

  return (
    <OnboardingShell
      step={3}
      onBack={() => router.back()}
      title="Camera and mic"
      subtitle="Both are needed to film with the teleprompter. Nothing records until you press the button."
      primaryLabel={both ? 'Next' : 'Allow both'}
      primaryBusy={busy}
      onPrimary={() => void allow()}
      footerExtra={both ? undefined : <QuietButton label="Not now" disabled={busy} onPress={next} />}
    >
      <StepCard icon="videocam" label="Camera" hint={cameraOn ? 'Allowed' : 'So you can film your takes in the app.'} done={cameraOn} onPress={cameraOn ? undefined : () => void one('camera')} />
      <StepCard icon="mic" label="Microphone" hint={micOn ? 'Allowed' : 'So your voice is captured with the video.'} done={micOn} onPress={micOn ? undefined : () => void one('mic')} />
    </OnboardingShell>
  );
}
