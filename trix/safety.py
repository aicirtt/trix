"""Safety agent: checks every instruction or answer before a crewmember sees it.

Blocks: steps not in the approved protocol, doses or medicines not in the formulary, invasive actions not in
the library, diagnostic certainty, advice to ignore protocol/skip escalation, and uncited medical claims.
If blocked, the system falls back to the protocol text or to 'ask the crew medical officer'.
"""
import re
from dataclasses import dataclass, field

from . import protocols

FORMULARY = {"vitamin d", "vitamin d3", "ibuprofen", "loratadine", "melatonin", "promethazine", "amoxicillin"}
DRUG_WORDS = re.compile(r"\b(mg|mcg|µg|milligram|tablet|pill|capsule|dose|inject|injection|syringe|iv\b|intravenous)\b", re.I)
DOSE = re.compile(r"\b\d+(\.\d+)?\s?(mg|mcg|µg|ml|iu|units?)\b", re.I)
KNOWN_DRUGS = re.compile(r"\b(aspirin|epinephrine|adrenaline|morphine|fentanyl|ketamine|lidocaine|atropine|amiodarone|diazepam|"
                         r"oxycodone|insulin|heparin|warfarin|nitroglycerin|naloxone|prednisone|vitamin d3?|ibuprofen|loratadine|"
                         r"melatonin|promethazine|amoxicillin)\b", re.I)
INVASIVE = re.compile(r"\b(incision|cut (open|into)|suture|stitch|scalpel|chest tube|needle decompression|intubat\w*|"
                      r"tracheotom\w*|cricothyro\w*|drain the|lance the|puncture)\b", re.I)
CERTAINTY = re.compile(r"(?<!do )(?<!if )\b(you|she|he) (has|have) (a|an) \w+|\b(definitely|certainly)\b|diagnos\w+ (is|as)|this is a (heart attack|stroke)", re.I)
OVERRIDE = re.compile(r"\b(skip (the )?(\w+ )?(step|protocol|check)|ignore (the )?(protocol|checklist|safety)|no need to (tell|inform|report)|"
                      r"don'?t (tell|inform|report)|keep (it|this) (from|secret)|wait for earth before (acting|cpr|starting))\b", re.I)


@dataclass
class Verdict:
    allowed: bool
    reasons: list = field(default_factory=list)
    replacement: str | None = None


def check_text(text: str, protocol_id: str | None = None, cited: bool | None = None) -> Verdict:
    reasons = []
    drugs = {d.lower() for d in KNOWN_DRUGS.findall(text)}
    off_formulary = {d for d in drugs if d not in FORMULARY}
    if off_formulary:
        reasons.append(f"medicine not in onboard formulary: {', '.join(sorted(off_formulary))}")
    fluid = re.search(r"\b(water|fluid|drink|gel)\b", text, re.I)
    if DOSE.search(text) and not fluid and not re.search(r"\b(1,?000 iu|25 micrograms)\b", text, re.I):
        reasons.append("specific dose: only the crew medical officer or formulary may give doses")
    if INVASIVE.search(text):
        reasons.append("invasive action not in the approved procedure library")
    if CERTAINTY.search(text):
        reasons.append("diagnostic certainty: TRIX may flag and explain, not diagnose")
    if OVERRIDE.search(text):
        reasons.append("tells the crew to skip protocol, hide information or delay emergency care")
    if cited is False:
        reasons.append("medical claim without a cited source")
    if reasons:
        rep = "I can't advise that. Please ask the crew medical officer"
        if protocol_id:
            cur = protocols.library()[protocol_id]["title"]
            rep += f", and continue with the approved procedure: {cur}."
        return Verdict(False, reasons, rep + ".")
    return Verdict(True)


def check_plan(protocol_id: str, step_ids: list[str]) -> Verdict:
    lib = protocols.library()
    if protocol_id not in lib:
        return Verdict(False, [f"unknown protocol {protocol_id}"])
    valid = [s["id"] for s in lib[protocol_id]["steps"]]
    bad = [s for s in step_ids if s not in valid]
    if bad:
        return Verdict(False, [f"steps not in protocol: {bad}"])
    if step_ids != valid[: len(step_ids)]:
        return Verdict(False, ["steps out of order"])
    return Verdict(True)
