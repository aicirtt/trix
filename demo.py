"""End-to-end demo: Astronaut A's irregular heartbeat on the way to Mars (day 180).

Runs fully offline. If Ollama is running locally it is used for wording; otherwise the extractive fallback.
"""
import json

from trix import agents, llm, protocols

case = {"who": "A", "location": "mars", "vitals": {"hr": 132, "spo2": 96, "temp": 36.8},
        "flags": ["irregular_rhythm"], "symptoms": "My chest feels fluttery and I'm dizzy", "helper": "B", "helper_skill": "crew"}

print(f"LLM: {llm.get_llm().name}\n")
out = agents.run(case)
for t in out["trace"]:
    print(f"[{t['t']}] {t['agent']:<15} {t['msg']}")
print("\nAdvice shown to crew:\n ", out["specialist_plan"]["advice"])
print("\nSources:")
for c in out["specialist_plan"]["citations"][:3]:
    print(f"  [{c['n']}] {c['title']}  {c['url']}")

print("\nGuided procedure (operator: Astronaut B, not a medical officer):")
s = protocols.Session(out["specialist_plan"]["protocol_id"], helper_skill="crew")
camera = [True, True, False, True, True, True, True]  # step 3 fails once (2 cm off), then passes
for ok in camera:
    cur = s.current()
    if not cur:
        break
    r = s.submit(ok, "" if ok else "Sticker 3 is 2 cm off target: move it toward her left side.")
    print(f"  step {cur['n']}/{cur['of']}: {cur['say']}\n     -> {'pass' if ok else 'retry: ' + r['feedback']}")
print("\nPractice-style score:", s.score())
print("\nEarth report:", json.dumps({k: out["report"][k] for k in ("urgency", "decision", "protocol", "priority", "bytes")}))
