#!/usr/bin/env python3
"""Retry audit for scenarios.py, projections.py, debt_schedule.py with backoff."""

import time
import requests

API_KEY = "csk-4f6km6nnfxpyy8hxymr5hyvxc24vd644wn2dc246wkyn58ed"
API_URL = "https://api.cerebras.ai/v1/chat/completions"
MODEL   = "qwen-3-235b-a22b-instruct-2507"

REMAINING_FILES = [
    ("scenarios.py",    "/home/user/mridulm/backend/engine/scenarios.py"),
    ("projections.py",  "/home/user/mridulm/backend/engine/projections.py"),
    ("debt_schedule.py","/home/user/mridulm/backend/engine/debt_schedule.py"),
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


def audit_file(filename, filepath, retries=5):
    with open(filepath) as f:
        raw = f.read()
    numbered = "\n".join(f"{i+1:4d} | {l}" for i, l in enumerate(raw.splitlines()))
    user_content = f"Audit the following Python file: **{filename}**\n\n```python\n{numbered}\n```\n\nPerform a thorough line-by-line financial logic audit."

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_content},
        ],
        "max_completion_tokens": 8192,
        "temperature": 0.2,
    }
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

    delay = 30
    for attempt in range(retries):
        t0 = time.time()
        resp = requests.post(API_URL, headers=headers, json=payload, timeout=120)
        elapsed = time.time() - t0

        if resp.status_code == 200:
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            tok = data.get("usage", {})
            print(f"  [{filename}] OK in {elapsed:.1f}s | in={tok.get('prompt_tokens')} out={tok.get('completion_tokens')}")
            return content
        elif resp.status_code == 429:
            wait = delay * (2 ** attempt)
            print(f"  [{filename}] Rate limited (attempt {attempt+1}/{retries}) — waiting {wait}s...")
            time.sleep(wait)
        else:
            return f"ERROR {resp.status_code}: {resp.text}"

    return f"ERROR: Failed after {retries} retries (persistent rate limit)"


def main():
    results = {}
    print("=" * 70)
    print("RETRY AUDIT — scenarios.py, projections.py, debt_schedule.py")
    print("=" * 70)

    for filename, filepath in REMAINING_FILES:
        lines = sum(1 for _ in open(filepath))
        print(f"\nAuditing {filename} ({lines} lines)...")
        # Pause between files to respect TPM limit
        if results:
            print("  Waiting 60s between files to respect rate limits...")
            time.sleep(60)
        results[filename] = audit_file(filename, filepath)

    # Append to existing report
    report_path = "/home/user/mridulm/audit_report.md"
    with open(report_path, "a") as f:
        f.write("\n\n# Retry Audit — Remaining Files\n\n")
        for filename, content in results.items():
            f.write(f"## {filename}\n\n{content}\n\n---\n\n")

    print(f"\nAppended to: {report_path}")
    print("\n" + "=" * 70)
    for fn, content in results.items():
        print(f"\n{'='*70}\n### {fn}\n{'='*70}\n")
        print(content)


if __name__ == "__main__":
    main()
