import { memo, type JSX } from 'react';

import type { OverlayBox } from '../../../lib/overlay-boxes';
import { StageTextBox, type AvoidBand, type BoxPlacement } from './StageTextBox';

export type TextBoxLayerProps = {
  boxes: OverlayBox[];
  stageWidth: number;
  stageHeight: number;
  selectedBoxId: string | null;
  avoidBand: AvoidBand | null;
  onSelect: (boxId: string) => void;
  onEdit: (boxId: string) => void;
  onDragStart: () => void;
  onCommit: (boxId: string, placement: BoxPlacement) => void;
};

/** Every creator text box of the clip under the playhead, each its own gesture. */
export const TextBoxLayer = memo(function TextBoxLayer(props: TextBoxLayerProps): JSX.Element {
  const {
    boxes,
    stageWidth,
    stageHeight,
    selectedBoxId,
    avoidBand,
    onSelect,
    onEdit,
    onDragStart,
    onCommit,
  } = props;
  return (
    <>
      {boxes.map((box) => (
        <StageTextBox
          key={box.id}
          box={box}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          selected={box.id === selectedBoxId}
          avoidBand={avoidBand}
          onSelect={onSelect}
          onEdit={onEdit}
          onDragStart={onDragStart}
          onCommit={onCommit}
        />
      ))}
    </>
  );
});
