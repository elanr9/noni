import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar, Button, Field } from '../../components/v2';
import { toast } from '../../components/v2/Toast';
import { useAuth } from '../../lib/auth';
import { saveCreatorProfile } from '../../lib/creator-onboarding';
import { color, space, text } from '../../theme/v2';
import { OnboardingShell } from './_shell';

/** Step 1: full name and an optional selfie. The team sees both next to every post. */
export default function NameScreen() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name?.trim() ?? '');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (camera: boolean) => {
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.error(camera ? 'Noni needs the camera to take a selfie.' : 'Noni needs your photos to pick one.', {
          label: 'Settings',
          onPress: () => void Linking.openSettings(),
        });
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, cameraType: ImagePicker.CameraType.front };
      const result = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri);
    } catch {
      // The simulator has no camera; fall back to the library.
      if (camera) void pick(false);
      else toast.error('Could not open your photos. Try again.');
    }
  };

  const next = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      await saveCreatorProfile(profile.id, profile.active_company_id ?? null, name.trim(), photo);
      await refreshProfile().catch(() => undefined);
      router.push('/(onboarding)/permissions');
    } catch (e) {
      toast.error(e instanceof Error && e.message ? `Could not save your name. ${e.message}` : 'Could not save your name. Try again.', {
        label: 'Retry',
        onPress: () => void next(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell
      step={1}
      title="What's your name?"
      subtitle="Your team sees this next to every post you send."
      primaryLabel={busy ? 'Saving' : 'Next'}
      primaryBusy={busy}
      primaryDisabled={!name.trim()}
      onPrimary={() => void next()}
    >
      <Field
        label="Full name"
        value={name}
        onChange={setName}
        placeholder="First and last name"
        autoFocus={!name}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="name"
        textContentType="name"
        returnKeyType="done"
        editable={!busy}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], marginTop: space[2] }}>
        <Animated.View key={photo ?? 'none'} entering={FadeIn.duration(200)}>
          <Avatar name={name || '?'} photo={photo} size={64} ring={!!photo} />
        </Animated.View>
        <View style={{ flex: 1, gap: space[2] }}>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button pill variant="secondary" icon="photo_camera" label={photo ? 'Retake' : 'Take a selfie'} disabled={busy} onPress={() => void pick(true)} />
            <Button pill variant="quiet" icon="photo_library" label="Pick" disabled={busy} onPress={() => void pick(false)} />
          </View>
          <Text style={[text.meta, { color: color.grey4 }]}>Optional. You can add one later in Settings.</Text>
        </View>
      </View>
    </OnboardingShell>
  );
}
