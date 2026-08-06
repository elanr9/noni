import { StyleSheet, Text, View } from 'react-native';

import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';

export type FeedVerdict = 'ok' | 'wrong';

export interface FeedTestCardProps {
  verdict: FeedVerdict | null;
  onVerdict: (verdict: FeedVerdict) => void;
}

/** Admin handoff §5 — the feed test, the check that decides everything else. */
export function FeedTestCard({ verdict, onVerdict }: FeedTestCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>The feed test</Text>
      <Text style={styles.body}>
        For You has to be college soccer and recruiting. A cold or off-topic feed
        throttles every post this creator will ever make.
      </Text>
      <View style={styles.row}>
        <Button
          variant={verdict === 'ok' ? 'approve' : 'outline'}
          size="sm"
          icon={verdict === 'ok' ? 'check' : undefined}
          style={styles.button}
          onPress={() => onVerdict('ok')}
        >
          Feed checks out
        </Button>
        <Button
          variant={verdict === 'wrong' ? 'danger' : 'outline'}
          size="sm"
          icon={verdict === 'wrong' ? 'x' : undefined}
          style={styles.button}
          onPress={() => onVerdict('wrong')}
        >
          Wrong content
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    padding: 14,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  title: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
    color: color.ink,
  },
  body: {
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.45,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  button: {
    flex: 1,
  },
});
