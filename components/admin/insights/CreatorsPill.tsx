import { StyleSheet, Text, View } from "react-native";

import { color, shadow, type } from "../../../theme/tokens";
import type { ApprovedCreator } from "../../../lib/admin-api";
import { Icon } from "../../ui/Icon";
import { PressableScale } from "../../ui/PressableScale";
import { CreatorAvatar } from "../shared";

export interface CreatorsPillProps {
  creators: ApprovedCreator[];
  onPress: () => void;
}

const AVATAR = 26;
const RING = 2;

/** Analytics handoff Part 1.2 A: avatar stack, "{n} creators", chevron. Sits under the header. */
export function CreatorsPill({ creators, onPress }: CreatorsPillProps) {
  const shown = creators.slice(0, 3);
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${creators.length} creators`}
        onPress={onPress}
        style={[styles.pill, shadow.shadowCard]}
      >
        {shown.length > 0 && (
          <View style={styles.stack}>
            {shown.map((c, i) => (
              <View
                key={c.id}
                style={[styles.ring, i > 0 && styles.ringOverlap]}
              >
                <CreatorAvatar name={c.name} size={AVATAR} />
              </View>
            ))}
          </View>
        )}
        <Text style={styles.label}>{`${creators.length} creators`}</Text>
        <Icon name="chevron-right" size={14} color={color.slate400} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginTop: -4,
    marginBottom: 12,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 999,
    backgroundColor: color.white,
  },
  stack: {
    flexDirection: "row",
    alignItems: "center",
  },
  ring: {
    width: AVATAR + RING * 2,
    height: AVATAR + RING * 2,
    borderRadius: 999,
    backgroundColor: color.white,
    alignItems: "center",
    justifyContent: "center",
  },
  ringOverlap: {
    marginLeft: -8,
  },
  label: {
    fontSize: type.size.chip,
    fontWeight: "700",
    color: color.ink,
  },
});
