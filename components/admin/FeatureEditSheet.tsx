import { useEffect, useState, type JSX } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { ProductFeatureInput } from '../../lib/admin-api';
import { borderWidth, color, radius, ringFocus, type } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { SheetShell } from '../ui/SheetShell';

export function FeatureEditSheet(props: {
  visible: boolean;
  mode: 'add' | 'edit';
  initial: ProductFeatureInput;
  busy?: boolean;
  onClose: () => void;
  onSave: (values: ProductFeatureInput) => void;
}): JSX.Element {
  const { visible, mode, initial, busy = false, onClose, onSave } = props;
  const [name, setName] = useState(initial.name);
  const [whatItDoes, setWhatItDoes] = useState(initial.what_it_does);
  const [claim, setClaim] = useState(initial.claim);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(initial.name);
    setWhatItDoes(initial.what_it_does);
    setClaim(initial.claim);
    setFocused(null);
  }, [visible, initial]);

  const canSave =
    name.trim().length > 0 &&
    whatItDoes.trim().length > 0 &&
    claim.trim().length > 0 &&
    !busy;

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      pinnedTop={100}
      footer={
        <Button
          size="md"
          variant="primary"
          block
          disabled={!canSave}
          onPress={() =>
            onSave({
              name: name.trim(),
              what_it_does: whatItDoes.trim(),
              claim: claim.trim(),
            })
          }
        >
          {busy ? 'Saving…' : mode === 'add' ? 'Add feature' : 'Save'}
        </Button>
      }
    >
      <Text style={styles.h2}>{mode === 'add' ? 'Add feature' : 'Edit feature'}</Text>
      <Text style={styles.subtitle}>
        Name it, say what it does, then write the line a creator says on camera.
      </Text>

      <Text style={styles.label}>Name</Text>
      <View style={[styles.fieldRing, focused === 'name' && ringFocus]}>
        <TextInput
          value={name}
          onChangeText={setName}
          onFocus={() => setFocused('name')}
          onBlur={() => setFocused(null)}
          placeholder="Bulk coach emails"
          placeholderTextColor={color.slate300}
          style={styles.field}
        />
      </View>

      <Text style={styles.label}>What it does</Text>
      <View style={[styles.fieldRing, focused === 'what' && ringFocus]}>
        <TextInput
          multiline
          value={whatItDoes}
          onChangeText={setWhatItDoes}
          onFocus={() => setFocused('what')}
          onBlur={() => setFocused(null)}
          placeholder="Sends a separate personalized email to every coach on the list in one action"
          placeholderTextColor={color.slate300}
          style={[styles.field, styles.multiline]}
        />
      </View>

      <Text style={styles.label}>What a creator says on camera</Text>
      <View style={[styles.fieldRing, focused === 'claim' && ringFocus]}>
        <TextInput
          multiline
          value={claim}
          onChangeText={setClaim}
          onFocus={() => setFocused('claim')}
          onBlur={() => setFocused(null)}
          placeholder="You hit send once and it goes out to fifty coaches, all different emails"
          placeholderTextColor={color.slate300}
          style={[styles.field, styles.multiline]}
        />
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  h2: {
    fontSize: type.size.titleSm,
    fontWeight: '800',
    color: color.ink,
    letterSpacing: type.tracking.title,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  fieldRing: {
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.white,
  },
  field: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: type.size.body,
    fontWeight: '600',
    color: color.ink,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
});
