import { StyleSheet, Text, View } from 'react-native';

import { editor } from '../../../../theme/v2';
import { GradientFill } from '../../../admin/v2/newbrief/ClipFrame';
import { Icon, type IconName } from '../../../v2';

/** For You page furniture drawn over the canvas at 85%, so text lands where TikTok leaves room. */
export function TikTokChrome({ handle = '@creator', caption = 'Caption written per creator', width }: { handle?: string; caption?: string; width: number }) {
  const k = width / 300;
  const side = (name: IconName, flip?: boolean) => (
    <View key={name} style={{ alignItems: 'center', gap: 2, marginBottom: 14 * k }}>
      <Icon name={name} size={30 * k} color={editor.white} style={flip ? { transform: [{ scaleX: -1 }] } : undefined} />
      <Text style={{ fontSize: 11 * k, lineHeight: 14 * k, fontWeight: '600', color: editor.white }}>0</Text>
    </View>
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.85 }]}>
      <GradientFill colors={[editor.k35, editor.clear]} deg={180} style={{ bottom: undefined, height: 90 * k }} />
      <GradientFill colors={[editor.clear, editor.k50]} deg={180} style={{ top: undefined, height: 200 * k }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: 54 * k, flexDirection: 'row', justifyContent: 'center', gap: 22 * k }}>
        <Text style={{ fontSize: 15 * k, lineHeight: 20 * k, fontWeight: '500', color: editor.w70 }}>Following</Text>
        <View>
          <Text style={{ fontSize: 15 * k, lineHeight: 20 * k, fontWeight: '700', color: editor.white }}>For You</Text>
          <View style={{ position: 'absolute', left: '50%', bottom: -7 * k, width: 20 * k, height: 3 * k, marginLeft: -10 * k, borderRadius: 2, backgroundColor: editor.white }} />
        </View>
      </View>
      <View style={{ position: 'absolute', right: 10 * k, bottom: 24 * k, width: 44 * k, alignItems: 'center' }}>
        <View style={{ width: 42 * k, height: 42 * k, borderRadius: 999, borderWidth: 2, borderColor: editor.white, backgroundColor: editor.w25, marginBottom: 20 * k }}>
          <View style={{ position: 'absolute', left: '50%', bottom: -9 * k, width: 18 * k, height: 18 * k, marginLeft: -9 * k, borderRadius: 999, backgroundColor: editor.tiktok, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="add" size={12 * k} weight={700} color={editor.white} />
          </View>
        </View>
        {side('favorite')}
        {side('mode_comment')}
        {side('bookmark')}
        {side('reply', true)}
      </View>
      <View style={{ position: 'absolute', left: 12 * k, right: 70 * k, bottom: 26 * k }}>
        <Text style={{ fontSize: 15 * k, lineHeight: 20 * k, fontWeight: '700', color: editor.white }}>{handle}</Text>
        <Text numberOfLines={2} style={{ fontSize: 13 * k, lineHeight: 18 * k, marginTop: 4 * k, color: editor.w85 }}>{caption}</Text>
      </View>
    </View>
  );
}
