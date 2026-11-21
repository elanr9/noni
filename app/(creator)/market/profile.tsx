import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ResumeEditor } from '../../../components/marketplace/ResumeEditor';
import { Screen } from '../../../components/v2';
import { useAuth } from '../../../lib/auth';
import type { CreatorResume } from '../../../lib/marketplace';
import { loadMyResume, saveMyResume } from '../../../lib/marketplace-api';
import { color } from '../../../theme/v2';

/** The creator's marketplace profile. */
export default function CreatorMarketProfile() {
  const router = useRouter();
  const { profile } = useAuth();
  const meId = profile?.id;
  const [resume, setResume] = useState<CreatorResume | null | undefined>(undefined);

  useEffect(() => {
    if (!meId) return;
    let off = false;
    void loadMyResume(meId)
      .then((r) => {
        if (!off) setResume(r);
      })
      .catch(() => {
        if (!off) setResume(null);
      });
    return () => {
      off = true;
    };
  }, [meId]);

  if (resume === undefined) {
    return (
      <Screen back title="Your profile">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.grey4} />
        </View>
      </Screen>
    );
  }
  return (
    <ResumeEditor
      resume={resume}
      onBack={() => router.back()}
      onSave={async (patch) => {
        await saveMyResume(patch);
      }}
    />
  );
}
