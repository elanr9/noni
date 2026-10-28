import { useState, type ReactNode } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Card, Chip, Empty, FilterButton, Icon, IconToggle, Option, PillTabs, Row, Seg, Sheet, Skeleton, TabPane, TextButton, Thumb, Toggle, UnderlineTabs } from '../../components/v2';
import { color, num, radius, space, text } from '../../theme/v2';

/** Step 1 review screen: v2 tokens and every kit component in its states. Dev only. */

type Lane = 'posts' | 'music' | 'accounts';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: space[6] }}>
      <Text style={[text.card, { marginBottom: space[3] }]}>{title}</Text>
      {children}
    </View>
  );
}

const SWATCHES = ['bg', 'ink', 'grey4', 'grey3', 'grey2', 'blue', 'blueDeep', 'blueTint', 'green', 'greenTint', 'amber', 'amberTint', 'purple', 'purpleTint', 'pink', 'pinkTint', 'tabActive'] as const;

export default function V2KitScreen() {
  const insets = useSafeAreaInsets();
  const [lane, setLane] = useState<Lane>('posts');
  const [sheet, setSheet] = useState(false);
  const [uTab, setUTab] = useState<'a' | 'c' | 'p'>('a');
  const [range, setRange] = useState<'week' | 'last' | 'month' | 'all'>('week');
  const [view, setView] = useState<'list' | 'cal'>('list');
  const [filters, setFilters] = useState(0);
  const [on, setOn] = useState(true);
  const [note, setNote] = useState('');

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: space.screen, paddingBottom: 40 }}>
        <Text style={[text.title, { marginBottom: space[4] }]}>v2 kit</Text>

        <Section title="Colour">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SWATCHES.map((k) => (
              <View key={k} style={{ alignItems: 'center', width: 60 }}>
                <View style={{ width: 44, height: 44, borderRadius: radius.thumb, backgroundColor: color[k], borderWidth: 1, borderColor: color.grey2 }} />
                <Text style={[text.meta, { fontSize: 11 }]} numberOfLines={1}>{k}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Type">
          <Card>
            <Text style={text.title}>Review</Text>
            <Text style={text.card}>3 to review</Text>
            <Text style={text.row}>Sofia Reyes</Text>
            <Text style={text.body}>Body copy at 15 over 20.</Text>
            <Text style={text.meta}>2h ago</Text>
            <Text style={num.lg}>$1,240</Text>
            <Text style={num.sm}>12,480</Text>
          </Card>
        </Section>

        <Section title="Icons">
          <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {(['inbox', 'list_alt', 'chat_bubble', 'bar_chart', 'schedule', 'check', 'music_note', 'replay', 'edit_note', 'push_pin', 'rocket_launch', 'open_in_new', 'favorite', 'play_arrow'] as const).map((n) => (
              <Icon key={n} name={n} size={26} color={color.blue} />
            ))}
            <Icon name="add" size={30} weight={700} color={color.ink} />
            <Icon name="reply" size={26} color={color.ink} style={{ transform: [{ scaleX: -1 }] }} />
          </Card>
        </Section>

        <Section title="UnderlineTabs">
          <UnderlineTabs
            items={[{ key: 'a', label: 'Analytics' }, { key: 'c', label: 'Creators', count: 4 }, { key: 'p', label: 'Posts', count: 12 }]}
            value={uTab}
            onChange={setUTab}
          />
          <TabPane k={uTab} style={{ paddingTop: 12 }}>
            <Card><Text style={text.body}>{uTab === 'a' ? 'Analytics pane' : uTab === 'c' ? 'Creators pane' : 'Posts pane'}</Text></Card>
          </TabPane>
        </Section>

        <Section title="PillTabs">
          <PillTabs items={[{ key: 'week', label: 'Week' }, { key: 'last', label: 'Last week' }, { key: 'month', label: 'Month' }, { key: 'all', label: 'All' }]} value={range} onChange={setRange} />
        </Section>

        <Section title="Icon toggle, filter button, toggle">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconToggle options={[{ key: 'list', icon: 'format_list_bulleted', label: 'List' }, { key: 'cal', icon: 'calendar_month', label: 'Calendar' }]} value={view} onChange={setView} />
            <IconToggle options={[{ key: 'list', icon: 'movie', label: 'By posts' }, { key: 'cal', icon: 'person', label: 'By creators' }]} value={view} onChange={setView} />
            <FilterButton active={filters} onPress={() => setFilters((f) => (f + 1) % 4)} />
            <FilterButton active={filters} size={48} radiusOverride={16} onPress={() => setFilters((f) => (f + 1) % 4)} />
            <Toggle on={on} onChange={setOn} />
            <Toggle small on={on} onChange={setOn} />
          </View>
        </Section>

        <Section title="Option">
          <Option on={on} onPress={() => setOn(true)} meta="Voice only">No sound</Option>
          <Option on={!on} onPress={() => setOn(false)} meta="On Instagram and TikTok">Creator picks a sound</Option>
        </Section>

        <Section title="Seg">
          <Seg
            value={lane}
            onChange={setLane}
            options={[
              { key: 'posts', label: 'Posts', count: 5, tone: 'blue' },
              { key: 'music', label: 'Music', count: 2, tone: 'purple' },
              { key: 'accounts', label: 'Accounts', count: 1, tone: 'amber' },
            ]}
          />
        </Section>

        <Section title="Chip">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip tone="blue" icon="schedule" label="8 waiting" />
            <Chip tone="green" icon="check" label="All clear" />
            <Chip tone="amber" label="Changes requested" small />
            <Chip tone="purple" label="Slideshow" />
            <Chip tone="grey" label="Open" small />
          </View>
        </Section>

        <Section title="Button">
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button variant="secondary" label="Request changes" />
              <Button label="Approve" icon="check" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button variant="ink" label="Ink" />
              <Button variant="quiet" label="Quiet" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button variant="amber" label="Request changes" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Save changes" disabled />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Button pill label="Pill" />
              <Button pill variant="secondary" label="Secondary" />
              <TextButton label="Message" />
            </View>
          </View>
        </Section>

        <Section title="Avatar">
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Avatar name="Sofia" photo="https://i.pravatar.cc/150?img=47" size={64} online />
            <Avatar name="Marco" tone="amber" size={56} />
            <Avatar name="Ana" tone="purple" size={48} badge={3} />
            <Avatar name="Lee" photo="https://i.pravatar.cc/150?img=12" size={28} ring={false} />
            <Avatar name="Broken" photo="https://invalid.example/x.png" size={36} tone="green" />
          </Card>
        </Section>

        <Section title="Thumb">
          <Card style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
            <Thumb w={64} post={{ type: 'Numbered list', title: '5 things I wish I knew' }} />
            <Thumb w={64} fan post={{ type: 'Myths', title: 'Three myths', format: 'Slideshow' }} />
            <Thumb w={48} post={{ type: 'Storytime' }} />
            <Thumb w={26} radius={6} post={{ type: 'How to' }} />
          </Card>
        </Section>

        <Section title="Row">
          <Card>
            <Row chevron onPress={() => {}}>
              <Thumb w={40} radius={8} post={{ type: 'Explainer' }} />
              <Text style={[text.row, { flex: 1 }]} numberOfLines={1}>Why your sleep score lies</Text>
              <Chip tone="green" label="Posted" small />
            </Row>
            <Row chevron last onPress={() => {}}>
              <Thumb w={40} radius={8} post={{ type: 'Talking head' }} />
              <Text style={[text.row, { flex: 1 }]} numberOfLines={1}>Morning routine</Text>
              <Chip tone="amber" label="Waiting" small />
            </Row>
          </Card>
        </Section>

        <Section title="Card, Empty, Skeleton">
          <Card onPress={() => {}}>
            <Text style={text.row}>Pressable card</Text>
          </Card>
          <Empty>Nothing to review.</Empty>
          <Skeleton h={76} />
        </Section>

        <Section title="Sheet">
          <View style={{ flexDirection: 'row' }}>
            <Button label="Open sheet" onPress={() => setSheet(true)} />
          </View>
        </Section>
      </ScrollView>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Notes"
        footer={<Button label="Save changes" disabled={!note.trim()} onPress={() => setSheet(false)} />}
      >
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Note"
          placeholderTextColor={color.grey3}
          multiline
          style={[text.body, { height: 120, backgroundColor: color.grey1, borderRadius: radius.option, padding: 14, textAlignVertical: 'top' }]}
        />
      </Sheet>
    </View>
  );
}
