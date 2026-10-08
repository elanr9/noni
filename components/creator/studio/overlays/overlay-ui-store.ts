// Transient overlay UI shared between the stage layer and the add bar: which
// text overlay has its edit sheet open. Not part of the document.
import { create } from 'zustand';

type OverlayUiState = {
  editingOverlayId: string | null;
  openEditor(overlayId: string): void;
  closeEditor(): void;
};

export const useOverlayUi = create<OverlayUiState>((set) => ({
  editingOverlayId: null,
  openEditor(overlayId) {
    set({ editingOverlayId: overlayId });
  },
  closeEditor() {
    set({ editingOverlayId: null });
  },
}));
