import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, space, type } from '../../../../theme/tokens';
import { PressableScale } from '../../../ui/PressableScale';
import type { CapturePermissions } from './useCapturePermissions';

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
      <PressableScale
        accessibilityRole="button"
        style={styles.button}
        onPress={() => {
          if (blocked) permissions.openSettings();
          else void permissions.request();
        }}
      >
        <Text style={styles.buttonText}>{blocked ? 'Open Settings' : 'Allow access'}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.gutter,
    gap: space[3],
    backgroundColor: color.ink900,
  },
  title: {
    color: color.white,
    fontSize: type.size.card,
    fontWeight: type.weight.bold,
    textAlign: 'center',
  },
  body: {
    color: color.whiteA75,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
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
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
});
