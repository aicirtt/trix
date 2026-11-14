"""End-to-end demo, mission day 180 on the way to Mars. Runs fully offline.

Three things happen at once:
  1. Astronaut A's wearable sends a reading with an irregular heartbeat  -> Daily care -> hand-off -> Emergency
  2. Astronaut C does the morning check-in after a 3rd short night         -> Daily care
  3. The Operations team checks the shared pharmacy                       -> Operations
Then: the agent office shows what every agent did, and Astronaut B is guided through the ECG.
"""
from trix import llm, office, orchestrator, protocols, reminders

print(f"LLM: {llm.get_llm().name}\n")
events = [
    {"event": "reading", "who": "A", "readings": {"hr": 132, "irregular_rhythm": 1, "spo2": 96, "temp": 36.8},
     "symptoms": "my chest feels fluttery and I'm dizzy", "helper": "B", "helper_skill": "crew"},
    {"event": "checkin", "who": "C", "readings": {"hr": 69, "hrv": 36, "sys": 114, "dia": 73, "spo2": 98, "temp": 36.7,
                                                   "sleep": 4.9, "mood": 2.9, "fatigue": 19}},
    {"event": "pharmacy", "who": "B", "request": {"day": 180}},
]
outs = orchestrator.run_many(events)
for e, o in zip(events, outs):
    path = "Daily care -> Emergency (hand-off)" if o.get("handoff") else o["team"]
    print(f"{o['case_id']}  {e['event']:<9} astronaut {e['who']}  team: {path:<36} safety: {'ok' if o['safety']['allowed'] else 'blocked'}"
          f"  Earth report: {o['report']['priority']}")

a, c, ops = outs
print("\n== Agent office: Astronaut A ==\n")
print(office.timeline(a["case_id"]))
print("\nAdvice shown to the crew:", a["specialist_plan"]["advice"])
print("Sources:", "; ".join(x["title"] for x in a["specialist_plan"]["citations"][:2]))

print("\n== Astronaut C, morning check-in ==")
print("Body map:", {k: v["status"] for k, v in c["body_map"].items()})
for m in c["coach"]["messages"]:
    print("  Coach:", m)
print("  Next check-in reminder:", c["reminder"]["next_checkin"], f"(learned; p(respond)={c['reminder']['p_respond']})")
_, rr = reminders.simulate(60)
print(f"  Reminder bandit after 60 days: {rr['bandit_response_rate']:.0%} response vs {rr['fixed_0700_response_rate']:.0%} with a fixed 07:00")

print("\n== Operations: pharmacy ==")
for m in ops["ops"]["messages"]:
    print("  ", m)

print("\n== Guided ECG: Astronaut B (not a medical officer) helps Astronaut A ==")
s = protocols.Session(a["procedure"]["protocol_id"], helper_skill="crew")
for ok in [True, True, False, True, True, True, True]:
    cur = s.current()
    if not cur:
        break
    r = s.submit(ok, "" if ok else "Sticker 3 is 2 cm off target: move it toward her left side.")
    print(f"  {cur['n']}/{cur['of']} {cur['say']}  -> {'ok' if ok else r['feedback']}")
print("  Practice score:", s.score()["score"])
print("\nFull log: python agent_office.py --last   (logs/agent_office.jsonl)")
