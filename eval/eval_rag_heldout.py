"""Held-out check: 30 new crew questions written after the system was finished, never used to tune it.
Same scoring as eval_rag.py. The gold sources were fixed before the first run and not changed afterwards."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trix import llm, rag  # noqa: E402

QA = [
    ("My legs look thinner than before launch, is that normal?", {"bone", "ind:bone", "ind:exercise", "hazards"}),
    ("How long should I exercise each day up here?", {"ind:exercise", "bone", "ind:bone"}),
    ("The air feels stuffy and my head hurts", {"co2", "ind:co2"}),
    ("Is 3.4 mmHg of carbon dioxide okay?", {"co2", "ind:co2"}),
    ("I can't fall asleep at night on the station", {"sleep", "ind:sleep"}),
    ("Why am I so slow on the reaction test this morning?", {"ind:reaction", "sleep", "ind:sleep", "ind:fatigue"}),
    ("My vision is getting blurry when I read", {"sans", "ind:vision"}),
    ("What happens to the eyes in long spaceflight?", {"sans", "ind:vision"}),
    ("How much radiation is too much over a career?", {"radiation", "ind:rad_career"}),
    ("Where do we go during a solar particle event?", {"radiation", "ind:rad_daily", "proto:RAD-SHELTER-01"}),
    ("Why do old viruses come back during missions?", {"immune", "ind:skin"}),
    ("There is a red itchy patch on my arm", {"immune", "ind:skin"}),
    ("Am I drinking enough fluid?", {"nutrition", "ind:fluid"}),
    ("I keep losing weight, should I worry?", {"ind:mass", "nutrition"}),
    ("Do I need to take vitamin D every day?", {"nutrition", "bone", "ind:bone", "formulary"}),
    ("I feel dizzy when I stand after we land", {"cardio", "ind:orthostatic", "proto:LAND-01"}),
    ("My pulse is racing while I'm resting", {"cardio", "ind:hr", "proto:CARD-ECG-01"}),
    ("Where do the chest stickers go for a heart tracing?", {"proto:CARD-ECG-01"}),
    ("My crewmate has collapsed and has no pulse", {"proto:CPR-MG-01"}),
    ("How should I hold the probe to see the four chambers?", {"proto:US-A4C-01"}),
    ("How do I do a finger-prick sugar test?", {"proto:GLU-01", "ind:glucose"}),
    ("My joints ache after the EVA", {"proto:EVA-POST-01", "eva"}),
    ("The oximeter shows 89", {"ind:spo2", "proto:O2-01"}),
    ("Is there anything for pain in the medical kit?", {"formulary", "iss_medical"}),
    ("Who looks after medical problems on the crew?", {"iss_medical"}),
    ("What makes space dangerous for the human body?", {"hazards"}),
    ("When does a problem get sent to doctors on the ground?", {"escalation"}),
    ("My back hurts since we reached orbit", {"ind:back_pain"}),
    ("I've been feeling low and avoiding the others", {"behavioral", "ind:mood"}),
    ("What blood pressure is too high?", {"ind:bp", "cardio"}),
]


def main():
    r, model = rag.Retriever(), llm.FallbackLLM()
    h1 = h3 = cite_ok = answered = 0
    rows = []
    for q, gold in QA:
        hits = r.search(q, k=3)
        ids = [h["doc_id"] for h in hits]
        ans = model.answer(q, hits)
        cited = {int(c) for c in re.findall(r"\[(\d)\]", ans)}
        ok = bool(cited) and all(ids[c - 1] in gold for c in cited if c <= len(ids))
        h1 += ids[0] in gold
        h3 += any(i in gold for i in ids)
        cite_ok += ok
        answered += bool(cited)
        rows.append({"q": q, "top3": ids, "hit1": ids[0] in gold, "hit3": any(i in gold for i in ids), "answered": bool(cited), "citations_correct": ok})
    n = len(QA)
    summary = {"questions": n, "hit@1": round(h1 / n, 3), "hit@3": round(h3 / n, 3), "citation_accuracy": round(cite_ok / n, 3),
               "declined_to_answer": n - answered}
    out = ROOT / "eval" / "results"
    (out / "rag_heldout_summary.json").write_text(json.dumps(summary, indent=2))
    (out / "rag_heldout_details.json").write_text(json.dumps(rows, indent=2))
    for x in rows:
        if not x["hit1"] or not x["citations_correct"]:
            print("MISS", x)
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    main()
