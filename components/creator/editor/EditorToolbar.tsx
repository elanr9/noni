import type { JSX } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { color, type } from '../../../theme/tokens';

export type ToolId =
  | 'split'
  | 'replace'
  | 'delete'
  | 'speed'
  | 'crop'
  | 'mute'
  | 'volume'
  | 'text-color'
  | 'add-text'
  | 'edit-text';

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
  /** The clip under the playhead carries text boxes the creator can recolor. */
  canStyleText: boolean;
  /** The clip under the playhead can take a new text box. */
  canAddText?: boolean;
  /** A text box is selected on the stage: show the text tools instead. */
  boxSelected?: boolean;
  /** The inset media is selected: nothing can be done to it but move and resize. */
  insetSelected?: boolean;
  onTool: (tool: ToolId) => void;
}): JSX.Element {
  const {
    canSplit,
    hasSelection,
    canDelete,
    selectedMuted,
    canStyleText,
    canAddText = false,
    boxSelected = false,
    insetSelected = false,
    onTool,
  } = props;
  const insetTools: Tool[] = [{ id: 'delete', label: 'Delete', icon: 'trash-2', enabled: false }];
  const textTools: Tool[] = [
    { id: 'edit-text', label: 'Edit', icon: 'pencil', enabled: true },
    { id: 'text-color', label: 'Text color', icon: 'palette', enabled: true },
    { id: 'add-text', label: 'Add text', icon: 'plus', enabled: canAddText },
    { id: 'delete', label: 'Delete', icon: 'trash-2', enabled: canDelete },
  ];
  const clipTools: Tool[] = [
    ...(canAddText
      ? [{ id: 'add-text' as const, label: 'Text', icon: 'plus' as const, enabled: true }]
      : []),
    ...(canStyleText
      ? [{ id: 'text-color' as const, label: 'Text color', icon: 'palette' as const, enabled: true }]
      : []),
    { id: 'split', label: 'Split', icon: 'scissors', enabled: canSplit },
    { id: 'replace', label: 'Replace', icon: 'repeat', enabled: hasSelection },
    { id: 'delete', label: 'Delete', icon: 'trash-2', enabled: canDelete },
    { id: 'speed', label: 'Speed', icon: 'gauge', enabled: hasSelection },
    { id: 'crop', label: 'Crop', icon: 'crop', enabled: hasSelection },
    {
      id: 'mute',
      label: selectedMuted ? 'Unmute' : 'Mute',
      icon: 'volume-x',
      enabled: hasSelection,
      active: selectedMuted,
    },
    { id: 'volume', label: 'Volume', icon: 'volume-2', enabled: true },
  ];
  const tools = insetSelected ? insetTools : boxSelected ? textTools : clipTools;
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
