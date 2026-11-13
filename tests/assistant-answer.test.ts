/**
 * The chat window shows an answer as paragraphs, short headings and lists. The text the model
 * returns is read as plain text: nothing in it is treated as markup beyond these few shapes.
 */
import { describe, expect, it } from 'vitest';
import { answerBlocks } from '../components/deal-engine/shell/AssistantDock';

describe('answerBlocks', () => {
  it('reads paragraphs, a heading, bullets and a numbered list in order', () => {
    const blocks = answerBlocks('## Drivers\nThe return comes mainly\nfrom debt paydown.\n\n- EBITDA growth\n* Paydown\n\n1. First\n2) Second\nA closing line.');
    expect(blocks).toEqual([
      { kind: 'h', text: 'Drivers' },
      { kind: 'p', text: 'The return comes mainly from debt paydown.' },
      { kind: 'ul', items: ['EBITDA growth', 'Paydown'] },
      { kind: 'ol', items: ['First', 'Second'] },
      { kind: 'p', text: 'A closing line.' },
    ]);
  });

  it('a negative figure at the start of a line is text, not a bullet; blank input gives nothing', () => {
    expect(answerBlocks('-5.2% is the downside IRR.')).toEqual([{ kind: 'p', text: '-5.2% is the downside IRR.' }]);
    expect(answerBlocks('  \n\n ')).toEqual([]);
  });

  it('angle brackets stay as written: an answer can never inject markup', () => {
    expect(answerBlocks('<img src=x onerror=alert(1)>')).toEqual([{ kind: 'p', text: '<img src=x onerror=alert(1)>' }]);
  });
});
