"""Retrieval + citation evaluation on 30 crew questions with known correct sources.

- hit@1 / hit@3: a correct source is the top result / in the top 3.
- citation accuracy: the answer's citations point to a correct source (offline extractive LLM, reproducible).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trix import llm, rag  # noqa: E402

QA = [
    ("How fast do astronauts lose bone density?", {"bone", "ind:bone"}),
    ("What exercise protects my bones in space?", {"bone", "ind:bone"}),
    ("Why do I keep getting headaches on the station?", {"co2", "ind:co2"}),
    ("What is the CO2 limit in the cabin?", {"co2", "ind:co2"}),
    ("How much sleep do astronauts usually get?", {"sleep", "ind:sleep"}),
    ("I only slept 5 hours, what should I do?", {"sleep", "ind:sleep"}),
    ("What is SANS and how do I check my eyes?", {"sans", "ind:vision"}),
    ("The lines on the grid look wavy, is that bad?", {"sans", "ind:vision"}),
    ("What is the career radiation limit?", {"radiation", "ind:rad_career"}),
    ("A solar storm is coming, what do I do?", {"radiation", "ind:rad_daily", "proto:RAD-SHELTER-01"}),
    ("I have a cold sore, why does that happen in space?", {"immune", "ind:skin"}),
    ("I have a fever and a rash", {"immune", "ind:skin", "ind:temp"}),
    ("How much water should I drink per day?", {"nutrition", "ind:fluid"}),
    ("How much calcium do I need?", {"nutrition", "ind:calcium"}),
    ("Why do I need vitamin D supplements?", {"nutrition", "bone", "ind:bone"}),
    ("Why do astronauts faint after landing?", {"cardio", "ind:orthostatic"}),
    ("How do I do the stand-up test before landing?", {"proto:LAND-01", "ind:orthostatic", "cardio"}),
    ("My heart is beating irregularly", {"cardio", "ind:hr", "proto:CARD-ECG-01"}),
    ("How do I place ECG electrodes?", {"proto:CARD-ECG-01"}),
    ("How do I do CPR in weightlessness?", {"proto:CPR-MG-01"}),
    ("How do I do an ultrasound of the heart?", {"proto:US-A4C-01"}),
    ("How do I test my blood sugar?", {"proto:GLU-01", "ind:glucose"}),
    ("What should I check after a spacewalk?", {"proto:EVA-POST-01", "eva"}),
    ("My oxygen saturation is 91 percent", {"ind:spo2", "proto:O2-01"}),
    ("What medicines are onboard?", {"formulary", "iss_medical"}),
    ("Who is the crew medical officer?", {"iss_medical"}),
    ("What are the five hazards of spaceflight?", {"hazards"}),
    ("When should the flight surgeon be told?", {"escalation"}),
    ("Why can't we just wait for Earth to answer?", {"escalation", "hazards", "iss_medical"}),
    ("I feel lonely and stressed", {"behavioral", "ind:mood", "ind:hrv"}),
]


def main():
    r, model = rag.Retriever(), llm.FallbackLLM()
    h1 = h3 = cite_ok = 0
    rows = []
    for q, gold in QA:
        hits = r.search(q, k=3)
        ids = [h["doc_id"] for h in hits]
        h1 += ids[0] in gold
        h3 += any(i in gold for i in ids)
        ans = model.answer(q, hits)
        cited = {int(c) for c in __import__("re").findall(r"\[(\d)\]", ans)}
        ok = bool(cited) and all(ids[c - 1] in gold for c in cited if c <= len(ids)) if cited else False
        cite_ok += ok
        rows.append({"q": q, "top3": ids, "hit3": any(i in gold for i in ids), "citations_correct": ok})
    n = len(QA)
    summary = {"questions": n, "hit@1": round(h1 / n, 3), "hit@3": round(h3 / n, 3), "citation_accuracy": round(cite_ok / n, 3)}
    out = ROOT / "eval" / "results"
    out.mkdir(exist_ok=True)
    (out / "rag_summary.json").write_text(json.dumps(summary, indent=2))
    (out / "rag_details.json").write_text(json.dumps(rows, indent=2))
    for x in rows:
        if not x["hit3"] or not x["citations_correct"]:
            print("MISS", x)
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    main()
