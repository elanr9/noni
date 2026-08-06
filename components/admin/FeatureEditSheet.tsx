import { useEffect, useState, type JSX } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { ProductFeatureInput } from '../../lib/admin-api';
import { borderWidth, color, radiusAdmin, ringFocus, type } from '../../theme/tokens';
import { Segmented, Sheet } from './shared';
import { Button } from '../ui/Button';

export type ClaimStatus = 'approved' | 'rejected';

export interface FeatureEditSheetProps {
  visible: boolean;
  mode: 'add' | 'edit';
  initial: ProductFeatureInput;
  initialStatus: ClaimStatus;
  busy?: boolean;
  onClose: () => void;
  onSave: (values: ProductFeatureInput, status: ClaimStatus) => void;
}

/**
 * Admin handoff §11 — Add a claim: name, body and an Approved / Rejected
 * toggle. The claim body stays two fields (what it does + the on-camera
 * line) because that is the data shape briefs trace to.
 */
export function FeatureEditSheet({
  visible,
  mode,
  initial,
  initialStatus,
  busy = false,
  onClose,
  onSave,
}: FeatureEditSheetProps): JSX.Element {
  const [name, setName] = useState(initial.name);
  const [whatItDoes, setWhatItDoes] = useState(initial.what_it_does);
  const [claim, setClaim] = useState(initial.claim);
  const [status, setStatus] = useState<ClaimStatus>(initialStatus);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(initial.name);
    setWhatItDoes(initial.what_it_does);
    setClaim(initial.claim);
    setStatus(initialStatus);
    setFocused(null);
  }, [visible, initial, initialStatus]);

  const canSave =
    name.trim().length > 0 &&
    whatItDoes.trim().length > 0 &&
    claim.trim().length > 0 &&
    !busy;

  return (
    <Sheet
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
            onSave(
              {
                name: name.trim(),
                what_it_does: whatItDoes.trim(),
                claim: claim.trim(),
              },
              status,
            )
          }
        >
          {busy ? 'Saving…' : mode === 'add' ? 'Add claim' : 'Save'}
        </Button>
      }
    >
      <Text style={styles.h2}>{mode === 'add' ? 'Add a claim' : 'Edit claim'}</Text>
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

      <Text style={styles.label}>Status</Text>
      <Segmented
        options={[{ label: 'Approved' }, { label: 'Rejected' }]}
        value={status === 'approved' ? 0 : 1}
        onChange={(index) => setStatus(index === 0 ? 'approved' : 'rejected')}
      />
      <Text style={styles.statusHint}>
        {status === 'approved'
          ? 'Briefs can trace their plug to this claim.'
          : 'Stays on the list so rescans skip it. Creators never say it.'}
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  h2: {
    fontSize: type.size.titleSm,
    fontWeight: '700',
    color: color.ink,
    letterSpacing: type.tracking.title,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate400,
    lineHeight: type.size.bodySm * type.leading.snug,
  },
  label: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  fieldRing: {
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    borderRadius: radiusAdmin.md,
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
  statusHint: {
    marginTop: 8,
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: type.size.label * type.leading.body,
  },
});
