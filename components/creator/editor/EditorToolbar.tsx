import type { JSX } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { color, type } from '../../../theme/tokens';

export type ToolId = 'split' | 'replace' | 'delete' | 'speed' | 'crop' | 'volume';

type Tool = {
  id: ToolId;
  label: string;
  icon: IconName;
  enabled: boolean;
  active?: boolean;
};

export function EditorToolbar(props: {
  canSplit: boolean;
  hasSelection: boolean;
  canDelete: boolean;
  selectedMuted: boolean;
  onTool: (tool: ToolId) => void;
}): JSX.Element {
  const { canSplit, hasSelection, canDelete, selectedMuted, onTool } = props;
  const tools: Tool[] = [
    { id: 'split', label: 'Split', icon: 'scissors', enabled: canSplit },
    { id: 'replace', label: 'Replace', icon: 'repeat', enabled: hasSelection },
    { id: 'delete', label: 'Delete', icon: 'trash-2', enabled: canDelete },
    { id: 'speed', label: 'Speed', icon: 'gauge', enabled: hasSelection },
    { id: 'crop', label: 'Crop', icon: 'crop', enabled: hasSelection },
    {
      id: 'volume',
      label: selectedMuted ? 'Unmute' : 'Mute',
      icon: selectedMuted ? 'volume-x' : 'volume-2',
      enabled: hasSelection,
      active: selectedMuted,
    },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {tools.map((tool) => (
        <PressableScale
          key={tool.id}
          accessibilityRole="button"
          accessibilityLabel={tool.label}
          accessibilityState={{ disabled: !tool.enabled }}
          disabled={!tool.enabled}
          onPress={() => onTool(tool.id)}
          style={[styles.tile, !tool.enabled && styles.tileOff]}
        >
          <View style={styles.iconWrap}>
            <Icon
              name={tool.icon}
              size={22}
              color={tool.active ? color.accent : color.white}
            />
          </View>
          <Text style={styles.label}>{tool.label}</Text>
        </PressableScale>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    gap: 8,
  },
  tile: {
    width: 74,
    height: 76,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileOff: {
    opacity: 0.38,
  },
  iconWrap: {
    height: 26,
    justifyContent: 'center',
  },
  label: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: '600',
  },
});
