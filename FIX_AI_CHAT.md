## Task: Fix AI Chatbot Response Quality in Deal Engine

### Context
The Deal Engine has an AI chatbot (right panel) that connects to multiple LLM providers (Anthropic, OpenAI, Google, Groq, Mistral) via tool use / function calling. The chat has two jobs:

1. **Explain**: Answer questions about the model — what drives IRR, why leverage is high, what the risk is, etc. Like a senior PE analyst talking to you.
2. **Modify**: When the user says "make it conservative" or "change year 4 growth to 8%", it updates the actual model assumptions via dot-notation paths and triggers recalculation.

The modify part works great already — it correctly updates assumptions and recalculates. DO NOT break this.

### Problem
Every response comes out in the same rigid template format:

```
Debt paydown contributes 86.85% to the return, while revenue growth contributes 59.99%.

Primary Driver: [one line]
Risk: [one line]  
Fragility: [one line]
Levers: [one line]
```

This happens because:
1. The tool schema in `lib/engine/ai/gateway.ts` has `required` fields on the `analysis` object (`return_decomposition`, `primary_driver`, `risk_concentration`, `fragility_test`, `improvement_levers`) — forcing the AI to always fill every field even when the user just asked a simple question
2. The store in `store/dealEngine.ts` renders the response by pulling `result.analysis?.return_decomposition` as the main chat message content (line ~185: `content: result.analysis?.return_decomposition || ''`)
3. The ChatPanel component then renders the analysis fields as a fixed card layout below the message

The AI is being forced to fill a form instead of having a conversation.

### What needs to change

**1. `lib/engine/ai/gateway.ts` — Tool schema and system prompt**

Make the `analysis` fields all optional (remove `required` array, or make it empty). The AI should fill these fields ONLY when the response naturally calls for them (e.g., a critique request), not on every single message.

Add a new field to the tool schema:
```
"message": {
  "type": "string",
  "description": "Your natural language response to the user. Write like a senior PE analyst — direct, specific, referencing actual numbers from the model. No templates. No filler. Adapt your response length and style to what the user asked."
}
```
Make `message` required. Make `analysis` optional (the whole object).

Update the system prompt to say something like:
- Always put your main response in the `message` field
- Write naturally — match the depth and style to the question. A simple question gets a concise answer. A critique request gets a detailed breakdown.
- You are not filling out a form. You are talking to an investment professional.
- If the user asks to change assumptions: make the change, confirm what you did and what the impact is (reference the new IRR/MOIC), keep it to 2-3 sentences
- If the user asks "what drives returns" or "critique this": go deep, reference specific numbers, name the variables and thresholds
- Do NOT always produce primary_driver/risk_concentration/fragility_test/improvement_levers — only fill the analysis object when you're giving a proper deal critique
- Never repeat the same boilerplate. Every response must contain information the user didn't already have.

**2. `store/dealEngine.ts` — Response handling (~line 185)**

Change the assistant message content to use the new `message` field first, falling back to `return_decomposition`:
```typescript
content: result.analysis?.message || result.analysis?.return_decomposition || 'Model updated.',
```

Actually — the analysis object comes from `toolCall.analysis` which maps to the tool output. So the `message` field will be at the same level. Trace the exact path:
- `callAI` returns `{ analysis: toolCall.analysis }` 
- Store reads `result.analysis?.return_decomposition`
- Change to: `result.analysis?.message || result.analysis?.return_decomposition || 'Model updated.'`

**3. `lib/engine/ai/gateway.ts` — Fix `scenario_request: null` crash**

The tool schema defines `scenario_request` as `type: "object"` with `nullable: true`, but Groq/Mistral reject `null` values for object types. Fix: either remove `nullable` and handle missing field, or wrap it properly:
```
"scenario_request": {
  "type": ["object", "null"],
  ...
}
```
Or simpler: just remove `scenario_request` from required, and in the parser, treat missing/null as no scenario.

**4. `components/deal-engine/chat/ChatPanel.tsx` — Response rendering**

The ChatPanel likely renders the analysis fields (primary_driver, risk_concentration, etc.) as a fixed card below every message. Change this so:
- The main `message` text is always shown as the primary response
- The structured analysis card is ONLY shown if those fields are present and non-empty
- When shown, it should feel like supplementary detail, not the main response

### Files to modify
1. `lib/engine/ai/gateway.ts` — tool schema, system prompt, response parsing
2. `store/dealEngine.ts` — line ~185 where assistant message content is set
3. `components/deal-engine/chat/ChatPanel.tsx` — conditional rendering of analysis card
4. `lib/engine/ai/adapters/anthropic.ts` — include `message` in parsed output
5. `lib/engine/ai/adapters/openai.ts` — include `message` in parsed output  
6. `lib/engine/ai/adapters/google.ts` — include `message` in parsed output

### DO NOT break
- The assumption update mechanism (dot-notation paths, trigger_recalculation)
- The multi-provider support (all 5 providers must work)
- The model recalculation after AI updates
- The diff display showing what changed

### Test with these prompts after fixing
1. "What drives the IRR here?" — should get a natural 3-5 sentence response referencing actual numbers, NOT a template
2. "Change year 4 revenue growth to 8%" — should update, confirm the change, and mention IRR impact in 1-2 sentences
3. "Make this more conservative" — should adjust multiple assumptions, explain what it did
4. "Is the exit realistic?" — should reference the reality check flags naturally
5. "What happens if we add another turn of leverage?" — should modify and explain impact
