"""Talk to TRIX in the astronaut's language.

The intent parser (routine.intent, voice.parse) understands English. Before it runs, `localize` rewrites the words that
matter (measurement names, screens, question words, symptoms) from the chosen language into English, so
"пульс 68 и кислород 98", "ouvre mes tendances" or "心拍数 72" land in the same place as the English sentence.
Numbers are kept as said. When a local LLM is available the whole sentence is translated instead, and the reply is
translated back; without one, replies stay in English and the tablet speaks them with an English voice.
"""
import re

NAMES = {"en": "English", "ru": "Russian", "ja": "Japanese", "zh": "Chinese", "fr": "French", "de": "German", "es": "Spanish",
         "it": "Italian", "hi": "Hindi", "ko": "Korean"}
# languages written without spaces between words: match substrings, not whole words
NO_SPACES = {"ja", "zh", "ko"}
WAKE = r"trix|трикс|トリックス|特里克斯|트릭스|ट्रिक्स"

# foreign phrase -> English phrase the parser knows. Longer phrases are applied first.
TERMS = {
    "ru": {"частота сердечных сокращений": "heart rate", "пульс": "heart rate", "сердцебиение": "heart rate", "давление": "blood pressure", "кислород": "oxygen", "сатурация": "oxygen",
           "температура": "temperature", "сахар": "sugar", "глюкоза": "glucose", "настроение": "mood", "сон": "sleep", "спала": "slept", "спал": "slept", "поспал": "slept",
           "выпила": "drank", "выпил": "drank", "воды": "water", "вода": "water", "чек-ин": "check-in", "проверку": "check-in", "проверка": "check-in", "утренняя проверка": "check-in",
           "тест реакции": "reaction test", "тренды": "trend", "графики": "trend", "график": "trend", "дерево агентов": "agent tree", "агенты": "agent tree", "процедуры": "procedure",
           "процедура": "procedure", "экипаж": "crew", "напарник": "buddy", "землю": "earth", "земля": "earth", "связь": "earth", "отчёт": "report", "отчет": "report", "пульт": "deck",
           "главная": "home", "тревога": "emergency", "срочно": "emergency", "помогите": "help me", "открой": "open", "открыть": "open", "покажи": "open", "показать": "open",
           "начни": "start", "начать": "start", "запусти": "start", "как": "how", "почему": "why", "что": "what", "мой": "my", "моя": "my", "моё": "my", "мое": "my", "мои": "my", "у меня": "my",
           "в порядке": "ok", "голова болит": "headache", "болит голова": "headache", "головная боль": "headache", "кружится голова": "dizzy", "головокружение": "dizzy", "тошнит": "nausea",
           "устал": "tired", "устала": "tired", "боль": "pain", "грудь": "chest", "груди": "chest", "не дышит": "not breathing", "без сознания": "unresponsive", "кровотечение": "bleeding",
           "одиноко": "lonely", "стресс": "stress", "и": "and"},
    "es": {"frecuencia cardíaca": "heart rate", "frecuencia cardiaca": "heart rate", "ritmo cardíaco": "heart rate", "pulso": "heart rate", "presión arterial": "blood pressure", "presion arterial": "blood pressure",
           "presión": "blood pressure", "presion": "blood pressure", "tensión": "blood pressure", "oxígeno": "oxygen", "oxigeno": "oxygen", "saturación": "oxygen", "temperatura": "temperature",
           "azúcar": "sugar", "azucar": "sugar", "glucosa": "glucose", "ánimo": "mood", "animo": "mood", "humor": "mood", "sueño": "sleep", "dormí": "slept", "dormi": "slept", "bebí": "drank",
           "bebi": "drank", "agua": "water", "chequeo": "check-in", "control matutino": "check-in", "prueba de reacción": "reaction test", "tendencias": "trend", "gráficas": "trend",
           "árbol de agentes": "agent tree", "agentes": "agent tree", "procedimientos": "procedure", "procedimiento": "procedure", "tripulación": "crew", "tripulacion": "crew",
           "compañero": "buddy", "tierra": "earth", "informe": "report", "panel": "deck", "inicio": "home", "emergencia": "emergency", "urgente": "emergency", "ayuda": "help me",
           "abre": "open", "abrir": "open", "muestra": "open", "mostrar": "open", "empieza": "start", "empezar": "start", "inicia": "start", "cómo": "how", "como": "how", "por qué": "why",
           "qué": "what", "que": "what", "mi": "my", "mis": "my", "estoy": "i am", "bien": "ok", "dolor de cabeza": "headache", "mareado": "dizzy", "mareada": "dizzy", "náuseas": "nausea",
           "cansado": "tired", "cansada": "tired", "dolor": "pain", "pecho": "chest", "no respira": "not breathing", "inconsciente": "unresponsive", "sangrado": "bleeding", "sangra": "bleeding",
           "solo": "lonely", "sola": "lonely", "estrés": "stress", "estres": "stress", "y": "and"},
    "fr": {"fréquence cardiaque": "heart rate", "rythme cardiaque": "heart rate", "pouls": "heart rate", "tension artérielle": "blood pressure", "tension": "blood pressure", "pression": "blood pressure",
           "oxygène": "oxygen", "saturation": "oxygen", "température": "temperature", "sucre": "sugar", "glycémie": "glucose", "glucose": "glucose", "humeur": "mood", "sommeil": "sleep",
           "dormi": "slept", "bu": "drank", "eau": "water", "bilan": "check-in", "contrôle du matin": "check-in", "test de réaction": "reaction test", "tendances": "trend", "courbes": "trend",
           "arbre des agents": "agent tree", "agents": "agent tree", "procédures": "procedure", "procédure": "procedure", "équipage": "crew", "binôme": "buddy", "terre": "earth",
           "rapport": "report", "tableau": "deck", "accueil": "home", "urgence": "emergency", "au secours": "help me", "aide-moi": "help me", "ouvre": "open", "ouvrir": "open", "montre": "open",
           "affiche": "open", "lance": "start", "commence": "start", "démarre": "start", "comment": "how", "pourquoi": "why", "quel": "what", "quelle": "what", "mon": "my", "ma": "my",
           "mes": "my", "je suis": "i am", "ça va": "ok", "mal de tête": "headache", "mal à la tête": "headache", "vertige": "dizzy", "étourdi": "dizzy", "nausée": "nausea", "fatigué": "tired",
           "fatiguée": "tired", "douleur": "pain", "poitrine": "chest", "ne respire pas": "not breathing", "inconscient": "unresponsive", "saigne": "bleeding", "saignement": "bleeding",
           "seul": "lonely", "seule": "lonely", "stressé": "stress", "et": "and"},
    "de": {"herzfrequenz": "heart rate", "puls": "heart rate", "herzschlag": "heart rate", "blutdruck": "blood pressure", "sauerstoff": "oxygen", "sättigung": "oxygen", "temperatur": "temperature",
           "zucker": "sugar", "blutzucker": "sugar", "glukose": "glucose", "stimmung": "mood", "laune": "mood", "schlaf": "sleep", "geschlafen": "slept", "getrunken": "drank", "wasser": "water",
           "check-in": "check-in", "morgencheck": "check-in", "reaktionstest": "reaction test", "trends": "trend", "verlauf": "trend", "kurven": "trend", "agentenbaum": "agent tree",
           "agenten": "agent tree", "prozeduren": "procedure", "prozedur": "procedure", "crew": "crew", "besatzung": "crew", "buddy": "buddy", "erde": "earth", "bericht": "report",
           "deck": "deck", "startseite": "home", "notfall": "emergency", "hilfe": "help me", "öffne": "open", "öffnen": "open", "zeig": "open", "zeige": "open", "starte": "start",
           "beginne": "start", "wie": "how", "warum": "why", "was": "what", "mein": "my", "meine": "my", "meinen": "my", "ich bin": "i am", "in ordnung": "ok", "kopfschmerzen": "headache",
           "schwindel": "dizzy", "schwindelig": "dizzy", "übelkeit": "nausea", "müde": "tired", "schmerz": "pain", "schmerzen": "pain", "brust": "chest", "atmet nicht": "not breathing",
           "bewusstlos": "unresponsive", "blutet": "bleeding", "blutung": "bleeding", "einsam": "lonely", "gestresst": "stress", "und": "and"},
    "it": {"frequenza cardiaca": "heart rate", "battito": "heart rate", "polso": "heart rate", "pressione": "blood pressure", "ossigeno": "oxygen", "saturazione": "oxygen", "temperatura": "temperature",
           "zucchero": "sugar", "glicemia": "glucose", "umore": "mood", "sonno": "sleep", "dormito": "slept", "bevuto": "drank", "acqua": "water", "check-in": "check-in",
           "controllo del mattino": "check-in", "test di reazione": "reaction test", "tendenze": "trend", "grafici": "trend", "albero degli agenti": "agent tree", "agenti": "agent tree",
           "procedure": "procedure", "procedura": "procedure", "equipaggio": "crew", "compagno": "buddy", "terra": "earth", "rapporto": "report", "plancia": "deck", "home": "home",
           "emergenza": "emergency", "aiuto": "help me", "apri": "open", "aprire": "open", "mostra": "open", "mostrami": "open", "avvia": "start", "inizia": "start", "come": "how",
           "perché": "why", "cosa": "what", "mio": "my", "mia": "my", "miei": "my", "sto": "i am", "bene": "ok", "mal di testa": "headache", "capogiro": "dizzy", "vertigini": "dizzy",
           "nausea": "nausea", "stanco": "tired", "stanca": "tired", "dolore": "pain", "petto": "chest", "non respira": "not breathing", "incosciente": "unresponsive", "sanguina": "bleeding",
           "sanguinamento": "bleeding", "solo": "lonely", "sola": "lonely", "stressato": "stress", "e": "and"},
    "hi": {"हृदय गति": "heart rate", "नाड़ी": "heart rate", "धड़कन": "heart rate", "रक्तचाप": "blood pressure", "ब्लड प्रेशर": "blood pressure", "ऑक्सीजन": "oxygen", "तापमान": "temperature",
           "बुखार": "temperature", "शुगर": "sugar", "शर्करा": "sugar", "ग्लूकोज": "glucose", "मनोदशा": "mood", "मूड": "mood", "नींद": "sleep", "सोया": "slept", "सोई": "slept", "पानी": "water",
           "पिया": "drank", "चेक-इन": "check-in", "चेक इन": "check-in", "सुबह की जाँच": "check-in", "प्रतिक्रिया परीक्षण": "reaction test", "रुझान": "trend", "ग्राफ": "trend",
           "एजेंट ट्री": "agent tree", "एजेंट": "agent tree", "प्रक्रियाएँ": "procedure", "प्रक्रिया": "procedure", "क्रू": "crew", "साथी": "buddy", "पृथ्वी": "earth", "रिपोर्ट": "report",
           "डेक": "deck", "होम": "home", "आपातकाल": "emergency", "मदद": "help me", "बचाओ": "help me", "खोलो": "open", "खोलें": "open", "दिखाओ": "open", "दिखाएँ": "open", "शुरू करो": "start",
           "शुरू करें": "start", "कैसा": "how", "कैसी": "how", "कैसे": "how", "क्यों": "why", "क्या": "what", "मेरा": "my", "मेरी": "my", "मेरे": "my", "मैं": "i am", "ठीक": "ok",
           "सिरदर्द": "headache", "सिर दर्द": "headache", "चक्कर": "dizzy", "मतली": "nausea", "थका": "tired", "थकान": "tired", "दर्द": "pain", "सीने": "chest", "छाती": "chest",
           "साँस नहीं": "not breathing", "बेहोश": "unresponsive", "खून": "bleeding", "अकेला": "lonely", "तनाव": "stress", "और": "and"},
    "ja": {"心拍数": "heart rate", "脈拍": "heart rate", "心拍": "heart rate", "血圧": "blood pressure", "酸素": "oxygen", "体温": "temperature", "血糖値": "sugar", "血糖": "sugar",
           "気分": "mood", "睡眠": "sleep", "寝た": "slept", "眠った": "slept", "飲んだ": "drank", "水": "water", "チェックイン": "check-in", "朝のチェック": "check-in", "反応テスト": "reaction test",
           "トレンド": "trend", "グラフ": "trend", "エージェントツリー": "agent tree", "エージェント": "agent tree", "手順": "procedure", "クルー": "crew", "バディ": "buddy", "地球": "earth",
           "報告": "report", "デッキ": "deck", "ホーム": "home", "緊急": "emergency", "助けて": "help me", "開いて": "open", "開く": "open", "見せて": "open", "表示": "open", "始めて": "start",
           "開始": "start", "どう": "how", "なぜ": "why", "何": "what", "私の": "my", "僕の": "my", "大丈夫": "ok", "頭痛": "headache", "めまい": "dizzy", "吐き気": "nausea", "疲れ": "tired",
           "痛み": "pain", "痛い": "pain", "胸": "chest", "息をしていない": "not breathing", "意識がない": "unresponsive", "出血": "bleeding", "寂しい": "lonely", "ストレス": "stress",
           "と": "and", "の": " ", "は": " ", "が": " ", "を": " ", "です": " ", "ます": " "},
    "zh": {"心率": "heart rate", "脉搏": "heart rate", "心跳": "heart rate", "血压": "blood pressure", "血氧": "oxygen", "氧气": "oxygen", "体温": "temperature", "温度": "temperature",
           "血糖": "sugar", "情绪": "mood", "心情": "mood", "睡眠": "sleep", "睡了": "slept", "喝了": "drank", "水": "water", "打卡": "check-in", "晨检": "check-in", "反应测试": "reaction test",
           "趋势": "trend", "图表": "trend", "智能体树": "agent tree", "智能体": "agent tree", "流程": "procedure", "程序": "procedure", "乘组": "crew", "伙伴": "buddy", "地球": "earth",
           "报告": "report", "总览": "deck", "主页": "home", "紧急": "emergency", "救命": "help me", "打开": "open", "显示": "open", "查看": "open", "开始": "start", "怎么样": "how",
           "怎么": "how", "如何": "how", "为什么": "why", "什么": "what", "我的": "my", "我": "my", "还好": "ok", "头痛": "headache", "头疼": "headache", "头晕": "dizzy", "恶心": "nausea",
           "累": "tired", "疼": "pain", "痛": "pain", "胸": "chest", "没有呼吸": "not breathing", "昏迷": "unresponsive", "出血": "bleeding", "孤独": "lonely", "压力": "stress", "和": "and",
           "吗": " ", "呢": " ", "了": " "},
    "ko": {"심박수": "heart rate", "맥박": "heart rate", "심박": "heart rate", "혈압": "blood pressure", "산소": "oxygen", "체온": "temperature", "혈당": "sugar", "기분": "mood", "수면": "sleep",
           "잤어": "slept", "잤다": "slept", "마셨": "drank", "물": "water", "체크인": "check-in", "아침 점검": "check-in", "반응 검사": "reaction test", "추세": "trend", "그래프": "trend",
           "에이전트 트리": "agent tree", "에이전트": "agent tree", "절차": "procedure", "승무원": "crew", "동료": "buddy", "지구": "earth", "보고": "report", "데크": "deck", "홈": "home",
           "응급": "emergency", "긴급": "emergency", "도와줘": "help me", "살려": "help me", "열어": "open", "보여": "open", "시작": "start", "어때": "how", "어떻": "how", "왜": "why",
           "뭐": "what", "무엇": "what", "내": "my", "나의": "my", "제": "my", "괜찮": "ok", "두통": "headache", "머리가 아": "headache", "어지러": "dizzy", "메스꺼": "nausea", "피곤": "tired",
           "통증": "pain", "아파": "pain", "가슴": "chest", "숨을 쉬지": "not breathing", "의식이 없": "unresponsive", "출혈": "bleeding", "피가": "bleeding", "외로": "lonely",
           "스트레스": "stress", "그리고": "and", "은": " ", "는": " ", "이": " ", "가": " ", "을": " ", "를": " "},
}
OVER = {"ru": ["на", "над"], "es": ["sobre", "con"], "fr": ["sur"], "de": ["zu"], "it": ["su"], "hi": ["बटा", "पर"], "ja": ["の"], "zh": ["比"], "ko": ["에"]}
_COMPILED: dict = {}


def _rules(lang: str) -> list:
    if lang not in _COMPILED:
        terms = sorted(TERMS.get(lang, {}).items(), key=lambda kv: -len(kv[0]))
        spaced = lang not in NO_SPACES
        _COMPILED[lang] = [(re.compile((r"(?<!\w)" + re.escape(k) + r"(?!\w)") if spaced else re.escape(k), re.I), v) for k, v in terms]
    return _COMPILED[lang]


def localize(text: str, lang: str) -> str:
    """Rewrite the words the parser needs into English; everything else (numbers, names) stays as said."""
    if lang in ("en", None) or lang not in TERMS:
        return text
    t = text.replace("，", ",").replace("。", ".").replace("、", ",").replace("？", "?").replace("।", ".")
    if lang in OVER:                                      # "120 на 80", "120 sobre 80", "120の80" -> "120 over 80"
        t = re.sub(rf"(\d+)\s*(?:{'|'.join(map(re.escape, OVER[lang]))})\s*(\d+)", r"\1 over \2", t)
    for rx, en in _rules(lang):
        t = rx.sub(f" {en} ", t)
    return re.sub(r"\s+", " ", t).strip()


def strip_wake(text: str) -> str | None:
    """'Hey TRIX, log heart rate 70' -> 'log heart rate 70'; None when the wake word is missing."""
    m = re.search(rf"\b(?:hey |ok |okay |эй |hé |he |ey |oye )?(?:{WAKE})\b[\s,.!?、，。]*", text, re.I)
    if not m:
        m = re.search(rf"(?:{WAKE})[\s,.!?、，。]*", text, re.I)   # CJK: no word boundaries
        if not m:
            return None
    return text[m.end():].strip() or ""
