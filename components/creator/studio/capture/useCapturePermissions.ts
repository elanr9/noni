import { useCallback, useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

export type CapturePermissionState = 'loading' | 'granted' | 'ask' | 'blocked';

export type CapturePermissions = {
  state: CapturePermissionState;
  request(): Promise<boolean>;
  openSettings(): void;
};

export function useCapturePermissions(): CapturePermissions {
  const [camera, requestCamera] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const askedOnMount = useRef(false);

  const request = useCallback(async () => {
    const cam = camera?.granted ? camera : await requestCamera();
    const audio = mic?.granted ? mic : await requestMic();
    return Boolean(cam?.granted && audio?.granted);
  }, [camera, mic, requestCamera, requestMic]);

  useEffect(() => {
    if (askedOnMount.current || !camera || !mic) return;
    askedOnMount.current = true;
    if (!(camera.granted && mic.granted)) void request();
  }, [camera, mic, request]);

  let state: CapturePermissionState = 'loading';
  if (camera && mic) {
    if (camera.granted && mic.granted) state = 'granted';
    else if ((!camera.granted && !camera.canAskAgain) || (!mic.granted && !mic.canAskAgain)) state = 'blocked';
    else state = 'ask';
  }

  return {
    state,
    request,
    openSettings: () => {
      void Linking.openSettings();
    },
  };
}
