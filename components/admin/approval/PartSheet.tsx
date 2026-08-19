import { useEffect, useRef, useState } from 'react';
import { Image, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { borderWidth, color, radius, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { NoteBlock, Sheet } from '../shared';
import {
  MediaGradient,
  PLATFORM_ICON,
  type AccountPart,
  type PartKey,
  type PartPlatform,
} from './PartCard';

/**
 * Both hosts are universal links, so an installed Instagram or TikTok app
 * takes over and lands the reviewer on the real profile. Without the app it
 * opens the web profile, which is the same check either way.
 */
function profileUrl(platform: PartPlatform, handle: string): string {
  const clean = handle.replace(/^@/, '');
  return platform === 'instagram'
    ? `https://www.instagram.com/${clean}`
    : `https://www.tiktok.com/@${clean}`;
}

export interface PartSheetUrls {
  instagramRecording: string | null;
  tiktokRecording: string | null;
  instagramScreenshot: string | null;
  tiktokScreenshot: string | null;
}

function ClipPreview({ uri }: { uri: string | null }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });

  return (
    <View style={[clip.frame, shadow.shadowMedia]}>
      {uri !== null ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls
        />
      ) : (
        <>
          <MediaGradient />
          <View style={[clip.disc, shadow.shadowCard]}>
            <Icon name="play" size={16} color={color.ink} />
          </View>
        </>
      )}
    </View>
  );
}

const clip = StyleSheet.create({
  frame: {
    width: 200,
    maxWidth: '100%',
    aspectRatio: 9 / 16,
    alignSelf: 'center',
    borderRadius: radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  disc: {
    width: 40,
    height: 40,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA90,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * The account widget: the profile screenshot the creator sent, the handle, and
 * one tap into the live profile so the reviewer checks the real thing rather
 * than trusting a screenshot.
 */
function AccountWidget({
  platform,
  label,
  handle,
  uri,
}: {
  platform: PartPlatform;
  label: string;
  handle: string | null;
  uri: string | null;
}) {
  const linkable = handle !== null && handle.length > 0;
  return (
    <View style={account.wrap}>
      <View style={[account.frame, shadow.shadowMedia]}>
        {uri !== null ? (
          <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <>
            <MediaGradient />
            <Icon name="images" size={20} color={color.blue300} />
          </>
        )}
      </View>
      <View style={account.side}>
        <View style={account.handleRow}>
          <Icon name={PLATFORM_ICON[platform]} size={16} color={color.slate400} />
          <Text style={account.platform}>{label}</Text>
        </View>
        <Text numberOfLines={1} style={account.handle}>
          {linkable ? `@${handle.replace(/^@/, '')}` : 'Not set'}
        </Text>
        <Button
          variant="outline"
          size="sm"
          iconRight="arrow-right"
          disabled={!linkable}
          onPress={() => {
            if (linkable) void Linking.openURL(profileUrl(platform, handle));
          }}
        >
          {`Open ${label}`}
        </Button>
      </View>
    </View>
  );
}

const account = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 14,
  },
  frame: {
    width: 118,
    aspectRatio: 9 / 16,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  side: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  platform: {
    fontSize: type.size.chip,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
  handle: {
    alignSelf: 'stretch',
    fontSize: type.size.cardLg,
    fontWeight: type.weight.bold,
    letterSpacing: -0.3,
    color: color.ink,
  },
});

export interface PartSheetProps {
  /** Null when closed; the last part stays rendered through the exit animation. */
  part: AccountPart | null;
  onClose: () => void;
  /** First name, used in the note placeholder. */
  creatorShort: string;
  urls: PartSheetUrls;
  accountHandles: { tiktok: string | null; instagram: string | null };
  notes: Partial<Record<PartKey, string>>;
  onSaveNote: (key: PartKey, text: string) => void;
  onRemoveNote: (key: PartKey) => void;
}

/**
 * Inspect one part of an account submission. Footer: Back / Request changes;
 * requesting flips into a note editor with Cancel / Save note.
 */
export function PartSheet({
  part,
  onClose,
  creatorShort,
  urls,
  accountHandles,
  notes,
  onSaveNote,
  onRemoveNote,
}: PartSheetProps) {
  const [noteMode, setNoteMode] = useState(false);
  const [draft, setDraft] = useState('');

  const lastRef = useRef<AccountPart | null>(null);
  if (part !== null) lastRef.current = part;
  const shown = part ?? lastRef.current;

  useEffect(() => {
    setNoteMode(false);
    setDraft('');
  }, [part]);

  if (shown === null) return null;

  const note = notes[shown.key];
  const instagram = shown.platform === 'instagram';
  const clipUri = instagram ? urls.instagramRecording : urls.tiktokRecording;
  const shotUri = instagram ? urls.instagramScreenshot : urls.tiktokScreenshot;
  const handle = instagram ? accountHandles.instagram : accountHandles.tiktok;

  const footer = noteMode ? (
    <View style={styles.footerRow}>
      <Button
        variant="ghost"
        size="lg"
        onPress={() => {
          setNoteMode(false);
          setDraft('');
        }}
        style={styles.footerLeft}
      >
        Cancel
      </Button>
      <Button
        variant="primary"
        size="lg"
        block
        disabled={draft.trim().length === 0}
        onPress={() => {
          onSaveNote(shown.key, draft.trim());
          onClose();
        }}
        style={styles.footerRight}
      >
        Save note
      </Button>
    </View>
  ) : (
    <View style={styles.footerRow}>
      <Button variant="ghost" size="lg" onPress={onClose} style={styles.footerLeft}>
        Back
      </Button>
      <Button
        variant="primary"
        size="lg"
        icon="pencil"
        block
        onPress={() => {
          setDraft(note ?? '');
          setNoteMode(true);
        }}
        style={styles.footerRight}
      >
        Request changes
      </Button>
    </View>
  );

  return (
    <Sheet
      visible={part !== null}
      onClose={onClose}
      title={shown.label}
      subtitle={shown.meta}
      footer={footer}
    >
      {shown.kind === 'clip' ? (
        <ClipPreview uri={clipUri} />
      ) : (
        <AccountWidget
          platform={shown.platform}
          label={instagram ? 'Instagram' : 'TikTok'}
          handle={handle}
          uri={shotUri}
        />
      )}

      {note !== undefined && !noteMode && (
        <NoteBlock style={styles.noteBlock} onRemove={() => onRemoveNote(shown.key)}>
          {note}
        </NoteBlock>
      )}

      {noteMode && (
        <View style={styles.editorWrap}>
          <TextInput
            autoFocus
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder={`What should ${creatorShort} change here`}
            placeholderTextColor={color.slate400}
            style={styles.editor}
          />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  footerLeft: {
    flexBasis: '28%',
    flexGrow: 0,
  },
  footerRight: {
    flex: 1,
  },
  noteBlock: {
    marginTop: 12,
  },
  editorWrap: {
    marginTop: 12,
    padding: 11,
    borderRadius: radius.sm,
    backgroundColor: color.blue50,
  },
  editor: {
    minHeight: 84,
    padding: 11,
    borderRadius: radius.sm,
    borderWidth: borderWidth.field,
    borderColor: color.blue300,
    backgroundColor: color.white,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.45,
    color: color.ink,
    textAlignVertical: 'top',
  },
});
