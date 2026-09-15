// Mirror of lib/overlay-text-metrics.ts. Edge functions cannot import lib/.
/**
 * Advance widths of TikTok Sans Bold (units per em = 1000, so these are
 * fractions of the font size), read from the TTF that ships in
 * @expo-google-fonts/tiktok-sans. Used to wrap on-screen text the same way in
 * the app preview and in the Creatomate render, so line breaks never differ.
 */
export const TIKTOK_SANS_BOLD_WIDTHS: Readonly<Record<string, number>> = {
  " ": 0.257,
  "!": 0.392,
  "\"": 0.52,
  "#": 0.69,
  "$": 0.618,
  "%": 0.993,
  "&": 0.769,
  "'": 0.299,
  "(": 0.42,
  ")": 0.421,
  "*": 0.517,
  "+": 0.673,
  ",": 0.331,
  "-": 0.441,
  ".": 0.331,
  "/": 0.414,
  "0": 0.675,
  "1": 0.492,
  "2": 0.641,
  "3": 0.645,
  "4": 0.692,
  "5": 0.625,
  "6": 0.649,
  "7": 0.56,
  "8": 0.681,
  "9": 0.649,
  ":": 0.331,
  ";": 0.361,
  "<": 0.673,
  "=": 0.673,
  ">": 0.673,
  "?": 0.61,
  "@": 0.988,
  "A": 0.717,
  "B": 0.688,
  "C": 0.739,
  "D": 0.74,
  "E": 0.598,
  "F": 0.565,
  "G": 0.765,
  "H": 0.77,
  "I": 0.319,
  "J": 0.581,
  "K": 0.721,
  "L": 0.568,
  "M": 0.932,
  "N": 0.77,
  "O": 0.812,
  "P": 0.672,
  "Q": 0.812,
  "R": 0.699,
  "S": 0.658,
  "T": 0.611,
  "U": 0.739,
  "V": 0.697,
  "W": 1.012,
  "X": 0.738,
  "Y": 0.692,
  "Z": 0.666,
  "[": 0.391,
  "\\": 0.414,
  "]": 0.391,
  "^": 0.61,
  "_": 0.49,
  "`": 0.363,
  "a": 0.585,
  "b": 0.642,
  "c": 0.563,
  "d": 0.642,
  "e": 0.597,
  "f": 0.412,
  "g": 0.636,
  "h": 0.616,
  "i": 0.287,
  "j": 0.296,
  "k": 0.595,
  "l": 0.287,
  "m": 0.898,
  "n": 0.616,
  "o": 0.634,
  "p": 0.642,
  "q": 0.642,
  "r": 0.408,
  "s": 0.528,
  "t": 0.404,
  "u": 0.602,
  "v": 0.578,
  "w": 0.811,
  "x": 0.597,
  "y": 0.591,
  "z": 0.544,
  "{": 0.432,
  "|": 0.309,
  "}": 0.432,
  "~": 0.673,
  "’": 0.375,
  "‘": 0.375,
  "“": 0.622,
  "”": 0.622,
  "–": 0.514,
  "—": 1.014,
  "…": 0.816,
  "€": 0.747,
  "£": 0.647,
  "•": 0.494,
  "·": 0.331,
  "¿": 0.61,
  "¡": 0.392,
  "á": 0.585,
  "é": 0.597,
  "í": 0.287,
  "ó": 0.634,
  "ú": 0.602,
  "ñ": 0.616,
  "ü": 0.602,
  "à": 0.585,
  "è": 0.597,
  "ì": 0.287,
  "ò": 0.634,
  "ù": 0.602,
  "â": 0.585,
  "ê": 0.597,
  "î": 0.287,
  "ô": 0.634,
  "û": 0.602,
  "ä": 0.585,
  "ë": 0.597,
  "ï": 0.287,
  "ö": 0.634,
  "ÿ": 0.591,
  "ç": 0.563,
  "Á": 0.717,
  "É": 0.598,
  "Í": 0.319,
  "Ó": 0.812,
  "Ú": 0.739,
  "Ñ": 0.768,
  "Ü": 0.739,
};

/** Glyphs missing from the table (emoji, other scripts) use this width. */
export const TIKTOK_SANS_FALLBACK_WIDTH = 0.62;

export function measureOverlayLine(text: string): number {
  let total = 0;
  for (const ch of text) {
    total += TIKTOK_SANS_BOLD_WIDTHS[ch] ?? TIKTOK_SANS_FALLBACK_WIDTH;
  }
  return total;
}

/**
 * Greedy word wrap in em units. Explicit newlines are hard breaks and words
 * longer than the line are split by character, exactly as the render does.
 */
export function wrapOverlayLines(text: string, maxWidthEm: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line.length === 0 ? word : `${line} ${word}`;
      if (measureOverlayLine(candidate) <= maxWidthEm) {
        line = candidate;
        continue;
      }
      if (line.length > 0) out.push(line);
      line = '';
      let chunk = '';
      for (const ch of word) {
        if (measureOverlayLine(chunk + ch) > maxWidthEm && chunk.length > 0) {
          out.push(chunk);
          chunk = '';
        }
        chunk += ch;
      }
      line = chunk;
    }
    if (line.length > 0) out.push(line);
  }
  return out;
}
