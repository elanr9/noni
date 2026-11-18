// The Create tab: a transparent modal holding the three-row sheet. Until
// setup is done it explains what is left instead. Upload from library goes
// straight into the editor with the picked videos.
import { useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { videoAsset } from '../../components/creator/studio/capture/media-assets';
import { CreateSheet } from '../../components/creator/v2/CreateSheet';
import { SetupGateSheet } from '../../components/creator/v2/SetupGateSheet';
import { recordToDoc, saveEditHandoff } from '../../components/creator/v2/record/model';
import { toast } from '../../components/v2/Toast';
import { useAuth } from '../../lib/auth';
import { startCreatorPost } from '../../lib/creator-posts-api';
import { saveProject } from '../../lib/projects-api';
import { isSetupCompleteFlag, useSetupState } from '../../lib/setup';
import { useStudioStore } from '../../lib/studio-store';
import { color, radius } from '../../theme/v2';

/** Most clips one library pick brings in. */
const MAX_PICK = 10;

type PickResult = { assets: ImagePicker.ImagePickerAsset[] } | { denied: true; settings: boolean } | null;

async function pickVideos(): Promise<PickResult> {
  const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    const asked = perm.canAskAgain ? await ImagePicker.requestMediaLibraryPermissionsAsync() : perm;
    if (!asked.granted && asked.accessPrivileges !== 'limited') return { denied: true, settings: !asked.canAskAgain };
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: MAX_PICK,
    orderedSelection: true,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return { assets: result.assets };
}

export default function CreateRoute() {
  const router = useRouter();
  const { profile } = useAuth();
  const setupFlagged = profile !== null && isSetupCompleteFlag(profile.onboarding_answers);
  const setup = useSetupState(!setupFlagged ? profile : null);
  const gated = !setupFlagged && setup.state !== null && !setup.state.complete;
  const [preparing, setPreparing] = useState(false);

  const fromLibrary = async () => {
    const companyId = profile?.active_company_id;
    const creatorId = profile?.id;
    if (!companyId || !creatorId) {
      router.back();
      return;
    }
    let picked: PickResult;
    try {
      picked = await pickVideos();
    } catch (e) {
      router.back();
      toast.error(e instanceof Error && /permission/i.test(e.message) ? 'Noni needs photo access to upload a video.' : 'Could not open your library. Try again.');
      return;
    }
    if (!picked) {
      router.back();
      return;
    }
    if ('denied' in picked) {
      router.back();
      toast.error('Allow photo access to upload a video.', picked.settings ? { label: 'Settings', onPress: () => void Linking.openSettings() } : undefined);
      return;
    }
    setPreparing(true);
    try {
      const assets = await Promise.all(picked.assets.map((a) => videoAsset(a.uri, Math.round(a.duration ?? 0), a.width > 0 && a.height > 0 ? { width: a.width, height: a.height } : null)));
      const clips = assets.map((asset, slot) => ({ slot, asset, gs: null }));
      const { doc, scripts } = recordToDoc(clips, null);
      const a = await startCreatorPost({ companyId, title: 'New post', format: 'video' });
      useStudioStore.getState().load(doc, a.id);
      await saveProject({ companyId, creatorId, assignmentId: a.id, document: doc });
      await saveEditHandoff(a.id, { title: '', scripts, draftKey: null });
      router.replace({ pathname: '/(creator)/edit/[id]', params: { id: a.id } });
    } catch (e) {
      setPreparing(false);
      router.back();
      toast.error(e instanceof Error ? `Could not start the post. ${e.message}` : 'Could not start the post.', { label: 'Retry', onPress: () => router.push('/(creator)/create') });
    }
  };

  if (gated && setup.state) {
    return (
      <SetupGateSheet
        state={setup.state}
        onClose={() => router.back()}
        onOpen={(href) => {
          router.back();
          router.push(href);
        }}
      />
    );
  }

  if (preparing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View entering={FadeIn.duration(160)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim }} />
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: color.ink }}>
          <ActivityIndicator color={color.white} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: color.white }}>Getting your video ready</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <CreateSheet
      onClose={() => router.back()}
      onPick={(choice) => {
        if (choice === 'library') {
          void fromLibrary();
          return;
        }
        router.back();
        if (choice === 'record') router.push({ pathname: '/(creator)/capture', params: { mode: 'free' } });
        else router.push('/(creator)/briefs');
      }}
    />
  );
}
