import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { CreateSheet } from '../../components/creator/v2/CreateSheet';

/** The Create tab: a transparent modal holding the three-row sheet. */
export default function CreateRoute() {
  const router = useRouter();
  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    const asset = result.canceled ? null : result.assets[0];
    router.back();
    if (asset) router.push({ pathname: '/(creator)/capture', params: { mode: 'free', clip: asset.uri, clipMs: String(Math.round(asset.duration ?? 0)) } });
  };
  return (
    <CreateSheet
      onClose={() => router.back()}
      onPick={(choice) => {
        if (choice === 'library') {
          void pickVideo();
          return;
        }
        router.back();
        if (choice === 'record') router.push({ pathname: '/(creator)/capture', params: { mode: 'free' } });
        else router.push('/(creator)/briefs');
      }}
    />
  );
}
