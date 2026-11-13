/**
 * The keys as this machine names them. The sheet follows Excel on both: Ctrl on Windows is
 * Command on a Mac, and Excel for Mac edits a cell with Control + U as well as F2 (on a Mac
 * laptop F2 needs the Fn key).
 */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
export const MOD = isMac ? '⌘' : 'Ctrl';
/** "⌘Z" on a Mac, "Ctrl + Z" elsewhere. */
export const chord = (...keys: string[]): string => (isMac ? `${MOD}${keys.join('')}` : [MOD, ...keys].join(' + '));
export const EDIT_KEY = isMac ? 'F2 or ⌃U' : 'F2';
/** Is this key press "edit the cell"? */
export const isEditKey = (e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean =>
  e.key === 'F2' || (isMac && e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'u');
