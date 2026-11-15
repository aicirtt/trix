"""Hybrid retrieval with citations, fully offline.

Corpus = hand-written NASA-sourced notes (kb/docs/*.md) + one auto-generated note per indicator
(kb/indicators.json) + one note per protocol (protocols/*.yaml).
Ranking = mean of normalised BM25 (keyword) and TF-IDF cosine scores, with stop-words removed.
An optional dense embedder (e.g. Ollama 'nomic-embed-text') can be plugged in as a third ranker.
"""
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from rank_bm25 import BM25Okapi
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer

from . import kb, protocols

DOCS = Path(__file__).parent / "kb" / "docs"
TOK = re.compile(r"[a-z0-9]+")


def tok(s: str) -> list[str]:
    return [w for w in TOK.findall(s.lower()) if w not in ENGLISH_STOP_WORDS]


@dataclass
class Chunk:
    doc_id: str
    title: str
    url: str
    text: str


def _parse_md(p: Path) -> list[Chunk]:
    raw = p.read_text()
    meta, body = {}, raw
    if raw.startswith("---"):
        head, body = raw.split("---", 2)[1:]
        meta = dict(line.split(": ", 1) for line in head.strip().splitlines())
    paras = [x.strip() for x in body.strip().split("\n\n") if x.strip()]
    return [Chunk(meta.get("id", p.stem), meta.get("title", p.stem), meta.get("url", ""), t) for t in paras]


@lru_cache
def corpus() -> list[Chunk]:
    chunks = []
    for p in sorted(DOCS.glob("*.md")):
        chunks += _parse_md(p)
    src = kb.sources()
    for i in kb.indicators().values():
        s0 = src[i["sources"][0]]
        text = (f"In space: {i['space_effect']} What to do: {'; '.join(i['actions'])}. Why measure {i['name'].lower()}: {i['why_measure']} "
                f"Measured with {', '.join(i['devices'])}, {i['frequency']}. Hazard: {i['hazard']}. NASA risk: {i['risk']}.")
        chunks.append(Chunk(f"ind:{i['id']}", f"TRIX indicator: {i['name']} (from {s0['title']})", s0["url"], text))
    for p in protocols.library().values():
        steps = " ".join(f"Step {n + 1}: {s['say']}" for n, s in enumerate(p["steps"]))
        chunks.append(Chunk(f"proto:{p['id']}", f"Protocol {p['id']}: {p['title']}", f"trix/protocols/{p['id']}.yaml",
                            f"{p['title']}. Use when: {', '.join(p['use_when'])}. Equipment: {', '.join(p['equipment'])}. {steps}"))
    return chunks


# Everyday words crew members use -> the terms the NASA sources use. Retrieval is word-based, so this bridges the gap.
LAY = [
    (r"thin(ner)? (legs|arms)|skinny legs|bird legs|muscles? (shrink|smaller|weak)", "muscle bone loss exercise resistance"),
    (r"stuffy|stale air|air (feels|is|seems)|hard to breathe in here", "carbon dioxide CO2 cabin air headache"),
    (r"head (hurts|aches|is pounding)|migraine", "headache"),
    (r"(los(e|ing)|lost|drop(ping)?) weight|getting lighter|weigh less", "body mass nutrition food intake"),
    (r"stickers?|pads|heart tracing|leads", "ECG electrodes placement"),
    (r"collapsed|no pulse|not breathing|stopped breathing|won't wake|unconscious", "unresponsive CPR compressions defibrillator"),
    (r"itch|patch|spots|blister|bumps", "rash skin"),
    (r"virus(es)? (come|came|coming) back|old viruses|dormant", "viral reactivation herpes immune"),
    (r"oximeter|sats|o2 (level|reading)", "oxygen saturation SpO2"),
    (r"pain ?killer|for pain|medical kit|first.aid kit|pills|tablets", "medicines formulary onboard"),
    (r"doctors? on (the )?(ground|earth)|mission control|ground team|sent (down|to earth)", "flight surgeon escalation"),
    (r"looks? after medical|in charge of medical|our medic|crew doctor", "crew medical officer"),
    (r"dizzy|light.?headed|faint", "orthostatic dizzy standing"),
    (r"throw(ing)? up|vomit|queasy|sick to my stomach", "nausea space motion sickness"),
    (r"can't (fall )?(a)?sleep|awake at night|insomnia|toss(ing)? and turn", "sleep loss circadian"),
    (r"blurr?y|can't focus|eyesight", "vision SANS eyes"),
    (r"feeling (low|down|sad|blue)|avoiding (the )?(others|crew)|homesick", "mood isolation behavioral"),
    (r"racing|pounding|thumping|skipping", "heart rate irregular rhythm"),
    (r"sugar test|finger.?prick", "blood glucose meter"),
    (r"eva\b|space ?walk", "spacewalk decompression"),
]


def expand(query: str) -> str:
    low = query.lower()
    extra = [terms for pat, terms in LAY if re.search(pat, low)]
    return query + " " + " ".join(extra) if extra else query


class Retriever:
    def __init__(self, embedder=None):
        self.chunks = corpus()
        texts = [c.title + " " + c.text for c in self.chunks]
        self.bm25 = BM25Okapi([tok(t) for t in texts])
        self.tfidf = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english").fit(texts)
        self.M = self.tfidf.transform(texts)
        self.embedder = embedder
        self.E = np.array([embedder(t) for t in texts]) if embedder else None

    def search(self, query: str, k: int = 4) -> list[dict]:
        """Hybrid score = mean of min-max-normalised BM25, TF-IDF cosine (and dense, if available)."""
        query = expand(query)
        def norm(x):
            x = np.asarray(x, dtype=float)
            rng_ = x.max() - x.min()
            return (x - x.min()) / rng_ if rng_ > 0 else np.zeros_like(x)
        raw = self.bm25.get_scores(tok(query))
        parts = [norm(raw),
                 norm((self.M @ self.tfidf.transform([query]).T).toarray().ravel())]
        if self.E is not None:
            parts.append(norm(self.E @ np.array(self.embedder(query))))
        score = np.mean(parts, axis=0)
        out, seen = [], set()
        for idx in np.argsort(-score):
            c = self.chunks[idx]
            if c.doc_id in seen:
                continue
            seen.add(c.doc_id)
            out.append({"doc_id": c.doc_id, "title": c.title, "url": c.url, "text": c.text, "score": round(float(score[idx]), 4),
                        "raw": round(float(raw[idx]), 3)})
            if len(out) >= k:
                break
        return out
