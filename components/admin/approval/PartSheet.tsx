import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { borderWidth, color, radius, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon, type IconName } from '../../ui/Icon';
import { NoteBlock, Sheet } from '../shared';
import { MediaGradient, type AccountPart, type PartKey } from './PartCard';

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

function ScreenshotFrame({ label, uri }: { label: string; uri: string | null }) {
  return (
    <View style={[shot.frame, shadow.shadowMedia]}>
      {uri !== null ? (
        <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <MediaGradient />
          <Icon name="images" size={20} color={color.blue300} />
        </>
      )}
      <Text style={shot.badge}>{label}</Text>
    </View>
  );
}

const shot = StyleSheet.create({
  frame: {
    width: 132,
    aspectRatio: 9 / 16,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  badge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.inkA55,
    fontSize: type.size.micro,
    fontWeight: type.weight.bold,
    color: color.white,
    overflow: 'hidden',
  },
});

function HandleRow({
  icon,
  label,
  handle,
}: {
  icon: IconName;
  label: string;
  handle: string | null;
}) {
  return (
    <View style={handles.row}>
      <Icon name={icon} size={17} color={color.slate400} />
      <Text style={handles.label}>{label}</Text>
      <Text numberOfLines={1} style={handles.value}>
        {handle !== null && handle.length > 0 ? `@${handle}` : 'Not set'}
      </Text>
    </View>
  );
}

const handles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: radiusAdmin.md,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    backgroundColor: color.white,
  },
  label: {
    width: 66,
    fontSize: type.size.chip,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
  value: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
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
  const clipUri = shown.key === 'ig' ? urls.instagramRecording : urls.tiktokRecording;

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
      {shown.kind === 'clip' && <ClipPreview uri={clipUri} />}

      {shown.kind === 'shots' && (
        <View style={styles.shotsRow}>
          <ScreenshotFrame label="TikTok" uri={urls.tiktokScreenshot} />
          <ScreenshotFrame label="Instagram" uri={urls.instagramScreenshot} />
        </View>
      )}

      {shown.kind === 'feed' && (
        <View style={styles.feedBlock}>
          <Text style={styles.feedText}>
            For You has to be college soccer and recruiting. A cold or off-topic feed
            throttles every post this creator will ever make.
          </Text>
        </View>
      )}

      {shown.kind === 'handles' && (
        <View style={styles.handlesCol}>
          <HandleRow icon="music-2" label="TikTok" handle={accountHandles.tiktok} />
          <HandleRow icon="at-sign" label="Instagram" handle={accountHandles.instagram} />
          <Text style={styles.handlesNote}>
            Captured on approval. Upload-Post needs both before anything can go out.
          </Text>
        </View>
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
  shotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  feedBlock: {
    padding: 14,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.offWhite,
  },
  feedText: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.5,
    color: color.ink,
  },
  handlesCol: {
    gap: 10,
  },
  handlesNote: {
    marginTop: 2,
    marginHorizontal: 2,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.45,
    color: color.slate400,
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
