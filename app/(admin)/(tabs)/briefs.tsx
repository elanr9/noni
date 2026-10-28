import { Text } from 'react-native';

import { Card, Screen } from '../../../components/v2';
import { text } from '../../../theme/v2';

/** Briefs tab root. Stage B replaces this placeholder with the library list. */
export default function BriefsScreen() {
  return (
    <Screen title="Briefs" scroll tabRoot>
      <Card>
        <Text style={text.body}>The library lands in stage B.</Text>
      </Card>
    </Screen>
  );
}
