import { StyleSheet, Text, View } from 'react-native';

import type { ProductFeature } from '../../../lib/admin-api';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

export type ClaimState = 'approved' | 'pending' | 'rejected';

export interface ClaimCardProps {
  row: ProductFeature;
  state: ClaimState;
  busy?: boolean;
  onEdit?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}

function sourceMeta(row: ProductFeature): string {
  const bits = [row.source];
  if (row.source_ref) bits.push(row.source_ref);
  return bits.join(' · ');
}

/**
 * Admin handoff §11 — one claim. Approved cards carry the green check and an
 * edit control; rejected cards go quiet with a red x and the do-not-claim
 * line.
 */
export function ClaimCard({
  row,
  state,
  busy = false,
  onEdit,
  onApprove,
  onReject,
}: ClaimCardProps) {
  const rejected = state === 'rejected';

  return (
    <View
      style={[
        styles.card,
        rejected ? styles.cardRejected : shadow.shadowCard,
      ]}
    >
      <View style={styles.nameRow}>
        {state === 'approved' && (
          <Icon name="circle-check-big" size={17} color={color.green} />
        )}
        {rejected && <Icon name="x" size={17} color={color.danger} />}
        <Text style={[styles.name, rejected && styles.nameRejected]} numberOfLines={1}>
          {row.name}
        </Text>
      </View>

      {rejected ? (
        <Text style={styles.doNotClaim}>Do not claim this on camera.</Text>
      ) : (
        <Text style={styles.what}>{row.what_it_does}</Text>
      )}
      <Text style={[styles.claim, rejected && styles.claimRejected]}>
        {`“${row.claim}”`}
      </Text>
      {!rejected && <Text style={styles.meta}>{sourceMeta(row)}</Text>}

      {!rejected && (
        <View style={styles.actions}>
          {state === 'pending' && onApprove !== undefined && (
            <Button size="sm" variant="approve" icon="check" disabled={busy} onPress={onApprove}>
              Approve
            </Button>
          )}
          {onEdit !== undefined && (
            <Button size="sm" variant="outline" disabled={busy} onPress={onEdit}>
              Edit
            </Button>
          )}
          {onReject !== undefined && (
            <Button size="sm" variant="ghost" disabled={busy} onPress={onReject}>
              Reject
            </Button>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    padding: 16,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 6,
  },
  cardRejected: {
    backgroundColor: color.fillQuiet,
    borderColor: color.fillQuiet,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: type.size.body,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  nameRejected: {
    color: color.slate500,
  },
  doNotClaim: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.danger,
  },
  what: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: type.size.bodySm * type.leading.snug,
  },
  claim: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
    lineHeight: type.size.bodySm * type.leading.snug,
    fontStyle: 'italic',
  },
  claimRejected: {
    color: color.slate400,
  },
  meta: {
    marginTop: 2,
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
});
