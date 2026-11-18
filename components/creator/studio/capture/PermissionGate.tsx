import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CapturePermissions } from './useCapturePermissions';
import { color, editor, editorType, radius, space } from '../../../../theme/v2';
import { Press } from '../../../v2';

export function PermissionGate({ permissions }: { permissions: CapturePermissions }): JSX.Element {
  const blocked = permissions.state === 'blocked';
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Camera and mic needed</Text>
      <Text style={styles.body}>
        {blocked
          ? 'Noni needs the camera and microphone to record. Turn both on in Settings and come back.'
          : 'Allow both so you can record clips for this post.'}
      </Text>
      <Press
        accessibilityRole="button"
        style={styles.button}
        onPress={() => {
          if (blocked) permissions.openSettings();
          else void permissions.request();
        }}
      >
        <Text style={styles.buttonText}>{blocked ? 'Open Settings' : 'Allow access'}</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[6],
    gap: space[3],
    backgroundColor: editor.deep,
  },
  title: {
    color: color.white,
    fontSize: editorType.size.card,
    fontWeight: editorType.weight.bold,
    textAlign: 'center',
  },
  body: {
    color: editor.w75,
    fontSize: editorType.size.bodySm,
    lineHeight: editorType.size.bodySm * editorType.leading.body,
    textAlign: 'center',
  },
  button: {
    marginTop: space[2],
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    backgroundColor: color.white,
  },
  buttonText: {
    color: color.ink,
    fontSize: editorType.size.bodySm,
    fontWeight: editorType.weight.bold,
  },
});
