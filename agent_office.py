"""Agent office viewer: what each agent did, who triggered it, and what it returned.

  python agent_office.py            # list cases in logs/agent_office.jsonl
  python agent_office.py C-1A2B3C   # timeline + call tree for one case
  python agent_office.py --last     # the most recent case
"""
import json
import sys
from pathlib import Path

from trix import office

rows = [json.loads(line) for line in Path(office.LOG_FILE).read_text().splitlines()] if Path(office.LOG_FILE).exists() else []
office._spans.extend(rows)
cases = list(dict.fromkeys(r["case_id"] for r in rows))
if not cases:
    sys.exit("No agent activity yet. Run demo.py first.")
arg = sys.argv[1] if len(sys.argv) > 1 else None
if arg is None:
    for c in cases:
        top = next((r for r in rows if r["case_id"] == c and r["parent_id"] is None), {})
        n = sum(r["case_id"] == c for r in rows)
        print(f"{c}  {top.get('started', '')}  {json.dumps(top.get('inputs'))}  -> {json.dumps(top.get('result'))}  ({n} steps)")
    sys.exit()
case = cases[-1] if arg == "--last" else arg
print(office.timeline(case))
print()
print(office.tree(case))
