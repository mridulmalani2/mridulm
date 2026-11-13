/**
 * lib/assistant/types.ts — what the assistant says and what it can offer to do.
 *
 * The assistant is an analyst's assistant, not an author of the model. Everything here is built
 * from the model's own state by plain rules (no AI call): the next move for the step in view, the
 * sourced values on offer, and how each value was reached. An AI key, when present, only answers
 * typed questions and rewords these notes; it never supplies a figure.
 *
 * Nothing in this folder changes the model. An action is a description the interface carries out
 * when the analyst clicks it.
 */

export type AssistStep = 'source' | 'clean' | 'assumptions' | 'results';

/** Something the analyst can click. The interface performs it; nothing runs unasked. */
export type AssistAction =
  /** Take a proposal from the suggestion catalogue (the key is the catalogue key). */
  | { kind: 'accept'; key: string; label: string }
  /** Go to an input on the Assumptions sheet. */
  | { kind: 'jump'; path: string; label: string }
  /** Add a figure the filing reports to the Clean step's bridge. */
  | { kind: 'candidate'; id: string; label: string }
  /** Set aside a figure the filing reports. */
  | { kind: 'dismiss'; id: string; label: string }
  /** Choose how leases count in net debt. */
  | { kind: 'lease'; choice: 'none' | 'finance' | 'all'; label: string }
  /** Say whether an EBITDA adjustment stops or continues after the deal. */
  | { kind: 'forecast'; id: string; choice: 'gone' | 'continues'; label: string }
  /** Leave the Clean step with the adjusted figures. */
  | { kind: 'continue'; label: string }
  /** Go to a step that is already open. */
  | { kind: 'go'; step: AssistStep; label: string }
  /** Build the model. */
  | { kind: 'build'; label: string }
  /** Open a view of the Results step. */
  | { kind: 'view'; view: string; label: string }
  /** Open a panel of the shell (cases, tools). */
  | { kind: 'panel'; panel: 'cases' | 'tools' | 'history'; label: string }
  /** Export the Excel model. */
  | { kind: 'export'; label: string };

/** How a value was reached, in the parts a reader checks: the basis, the working, the source. */
export interface Rationale {
  /** The field or item the value belongs to. */
  subject: string;
  /** The value as the page shows it ("11.5x", "5 years"); absent when there is no single value. */
  value?: string;
  /** One of the catalogue's bases, in words ("Read from the source"). */
  basis: string;
  /** The working, in a sentence or two. */
  how: string;
  /** The published source or filing line; absent when the working names it already. */
  source?: string;
  /** What the input is, how it is usually set and what to watch, from the field notes. */
  notes: { heading: string; text: string }[];
}

export interface AssistItem {
  id: string;
  /** 'next' = the one move that takes the step forward; 'offer' = a sourced value ready to take;
   *  'check' = something that needs a decision or blocks the step; 'info' = worth knowing. */
  tone: 'next' | 'offer' | 'check' | 'info';
  title: string;
  body: string;
  /** The proposed value, when the item offers one. */
  value?: string;
  why?: Rationale;
  actions: AssistAction[];
}

export interface Advice {
  /** One line on where the step stands ("3 inputs to go in Debt"). */
  status: string;
  /** The field the analyst is in, when there is one and the assistant has something to say. */
  here: AssistItem | null;
  /** The single move that takes the step forward. */
  next: AssistItem | null;
  /** Further items, most useful first. */
  more: AssistItem[];
  /** What the further items are, when the step's usual heading does not describe them. */
  moreLabel?: string;
}
