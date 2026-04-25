#!/usr/bin/env python3
"""
LBO/Deal Engine Financial Logic Audit via Cerebras API.
Feeds each engine file to Cerebras with a CFA-level prompt and collects findings.
"""

import os
import json
import time
import requests

API_KEY = "csk-4f6km6nnfxpyy8hxymr5hyvxc24vd644wn2dc246wkyn58ed"
API_URL = "https://api.cerebras.ai/v1/chat/completions"
MODEL   = "qwen-3-235b-a22b-instruct-2507"  # Cerebras 235B — best available

ENGINE_FILES = [
    ("reality_check.py",  "/home/user/mridulm/backend/engine/reality_check.py"),
    ("returns.py",        "/home/user/mridulm/backend/engine/returns.py"),
    ("scenarios.py",      "/home/user/mridulm/backend/engine/scenarios.py"),
    ("projections.py",    "/home/user/mridulm/backend/engine/projections.py"),
    ("debt_schedule.py",  "/home/user/mridulm/backend/engine/debt_schedule.py"),
]

SYSTEM_PROMPT = """You are a senior CFA charterholder and LBO modelling expert with 15+ years of private equity experience.
You are reviewing Python code that implements a Leveraged Buyout (LBO) deal engine.

Your job is a LINE-BY-LINE financial logic audit. For every issue you find, you MUST cite:
  • The exact line number(s)
  • The variable or expression involved
  • Why it is wrong from a finance/accounting perspective
  • What the correct formula or logic should be

Focus specifically on:
1. Incorrect financial formulas (e.g., wrong EBITDA bridge, incorrect leverage ratios, flipped signs)
2. DSCR / interest coverage / covenant math errors
3. IRR / money-multiple calculation errors (Newton-Raphson convergence, sign conventions, period timing)
4. Debt schedule amortisation, PIK accrual, cash sweep priority errors
5. Missing edge cases (division by zero on zero EBITDA, negative equity, illiquid exit)
6. Wrong period indexing (off-by-one in year 0 vs year 1 cash flows)
7. Sensitivity / scenario table construction errors (wrong axis, wrong base case reference)
8. Return attribution / value bridge decomposition errors
9. Sign errors in free cash flow, capex, working capital
10. Tax shield mis-application or circular dependency issues

Be exhaustive. If a line is correct, skip it. Only report genuine errors or strong suspicions.
Format each finding as:

FINDING [N]:
  File: <filename>
  Line(s): <line numbers>
  Code: <exact code snippet>
  Issue: <financial explanation of what is wrong>
  Fix: <corrected code or formula>

After all findings, output a SUMMARY section listing the most critical issues first."""

def audit_file(filename: str, filepath: str) -> str:
    with open(filepath, "r") as f:
        raw = f.read()

    # Add line numbers so the model can reference them precisely
    numbered_lines = "\n".join(
        f"{i+1:4d} | {line}" for i, line in enumerate(raw.splitlines())
    )

    user_content = f"""Audit the following Python file from an LBO deal engine: **{filename}**

```python
{numbered_lines}
```

Perform a thorough line-by-line financial logic audit as instructed. Be exhaustive."""

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_content},
        ],
        "max_completion_tokens": 8192,
        "temperature": 0.2,   # low temp for precise technical review
    }

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type":  "application/json",
    }

    t0 = time.time()
    resp = requests.post(API_URL, headers=headers, json=payload, timeout=120)
    elapsed = time.time() - t0

    if resp.status_code != 200:
        return f"ERROR {resp.status_code}: {resp.text}"

    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    tokens  = data.get("usage", {})
    print(f"  [{filename}] done in {elapsed:.1f}s | tokens: in={tokens.get('prompt_tokens','?')} out={tokens.get('completion_tokens','?')}")
    return content


def main():
    all_findings = {}

    print("=" * 70)
    print("LBO DEAL ENGINE — CEREBRAS FINANCIAL LOGIC AUDIT")
    print("=" * 70)

    for filename, filepath in ENGINE_FILES:
        print(f"\nAuditing {filename} ({sum(1 for _ in open(filepath))} lines)...")
        result = audit_file(filename, filepath)
        all_findings[filename] = result

    # Write results to a report file
    report_path = "/home/user/mridulm/audit_report.md"
    with open(report_path, "w") as f:
        f.write("# LBO Deal Engine — Cerebras Financial Logic Audit Report\n\n")
        f.write(f"Model: {MODEL}  |  Date: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}\n\n")
        f.write("---\n\n")
        for filename, content in all_findings.items():
            f.write(f"## {filename}\n\n")
            f.write(content)
            f.write("\n\n---\n\n")

    print(f"\n\nFull report written to: {report_path}")
    print("\n" + "=" * 70)
    print("CONSOLIDATED OUTPUT")
    print("=" * 70)
    for filename, content in all_findings.items():
        print(f"\n{'='*70}\n### {filename}\n{'='*70}\n")
        print(content)


if __name__ == "__main__":
    main()
