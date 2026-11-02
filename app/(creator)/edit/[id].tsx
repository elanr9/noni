import { useLocalSearchParams } from 'expo-router';

import { EditorScreen } from '../../../components/creator/v2/record/EditorScreen';

/** The editor for a creator-started post, keyed by its assignment. */
export default function EditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <EditorScreen assignmentId={id} />;
}
