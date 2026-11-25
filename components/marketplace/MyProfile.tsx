// Loads the signed in creator's profile and shows the editor. Pushed from the
// Market (onBack) or as the Profile tab before any company has taken them on.
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../../lib/auth';
import type { CreatorResume } from '../../lib/marketplace';
import { loadMyResume, saveMyResume } from '../../lib/marketplace-api';
import { color } from '../../theme/v2';
import { Screen } from '../v2';
import { ResumeEditor } from './ResumeEditor';

export function MyProfile({ onBack }: { onBack?: () => void }) {
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
      <Screen back={onBack} title="Profile" tabRoot={!onBack}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.grey4} />
        </View>
      </Screen>
    );
  }
  return (
    <ResumeEditor
      resume={resume}
      onBack={onBack}
      onSave={async (patch) => {
        setResume(await saveMyResume(patch));
      }}
    />
  );
}
