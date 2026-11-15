// Interface language per astronaut (English, Russian, Japanese, Chinese). English strings are the keys.
// Static labels on every screen are translated in place after each render (translateDom); long NASA explanations,
// agent advice and anything the onboard record generates stay in English. Translations were written by the team,
// not yet checked by native speakers.
export const LANGS = { en: 'English', ru: 'Русский', ja: '日本語', zh: '中文' };
export const SPEECH = { en: 'en-US', ru: 'ru-RU', ja: 'ja-JP', zh: 'zh-CN' };
let lang = 'en';
export const setLang = (l) => { lang = LANGS[l] ? l : 'en'; document.documentElement.lang = lang; };
export const getLang = () => lang;
const IDX = { ru: 0, ja: 1, zh: 2 };
const D = {
  // navigation and top bar
  'Mission deck': ['Пульт миссии', 'ミッションデッキ', '任务总览'], 'Check-in': ['Проверка', 'チェックイン', '健康打卡'], Trends: ['Тренды', 'トレンド', '趋势'],
  Procedures: ['Процедуры', '手順', '处置流程'], Crew: ['Экипаж', 'クルー', '乘组'], 'Earth link': ['Связь с Землёй', '地球リンク', '地面链路'],
  'Agent tree': ['Дерево агентов', 'エージェントツリー', '智能体树'], 'Medical emergency': ['Медицинская тревога', '医療緊急事態', '医疗紧急情况'],
  'Talk to TRIX': ['Говорить с TRIX', 'TRIXに話す', '与TRIX对话'], Language: ['Язык', '言語', '语言'], 'I am': ['Я', '自分', '我是'],
  'Crew health system': ['Система здоровья экипажа', 'クルー健康システム', '乘组健康系统'], Close: ['Закрыть', '閉じる', '关闭'], Send: ['Отправить', '送信', '发送'],
  Message: ['Сообщение', 'メッセージ', '消息'], 'Type or press the mic': ['Напишите или нажмите микрофон', '入力するかマイクを押す', '输入或按下麦克风'],
  'Say or type anything:': ['Скажите или напишите что угодно:', '何でも話すか入力してください：', '说或输入任何内容：'], 'See what the agents did': ['Что сделали агенты', 'エージェントの動きを見る', '查看智能体的处理'],
  'Something went wrong': ['Что-то пошло не так', '問題が発生しました', '出了点问题'], 'Back to Today': ['Назад к «Сегодня»', '今日に戻る', '返回今日'],
  'TRIX server not reachable': ['Сервер TRIX недоступен', 'TRIXサーバーに接続できません', '无法连接TRIX服务器'], 'Crew alert:': ['Тревога экипажа:', 'クルー警報：', '乘组警报：'], Open: ['Открыть', '開く', '打开'],
  Sense: ['Измерить', '測る', '感知'], Understand: ['Понять', '理解する', '理解'], Act: ['Действовать', '行動する', '行动'], Report: ['Доложить', '報告する', '报告'],
  // measurements
  'Blood pressure': ['Артериальное давление', '血圧', '血压'], 'Heart rate': ['Пульс', '心拍数', '心率'], 'Blood sugar': ['Сахар крови', '血糖値', '血糖'],
  'Body temperature': ['Температура тела', '体温', '体温'], Temperature: ['Температура', '体温', '体温'], Sleep: ['Сон', '睡眠', '睡眠'], Mood: ['Настроение', '気分', '情绪'],
  'Sleep last night': ['Сон прошлой ночью', '昨夜の睡眠', '昨晚睡眠'], 'Blood oxygen': ['Кислород в крови', '血中酸素', '血氧'], 'Face scan': ['Скан лица', '顔スキャン', '面部扫描'],
  'Voice check': ['Проверка голоса', '音声チェック', '语音检查'], 'Reaction test': ['Тест реакции', '反応テスト', '反应测试'], 'Exercise done today': ['Упражнения сегодня', '今日の運動', '今日锻炼'],
  'Food and water': ['Еда и вода', '食事と水分', '饮食与饮水'], 'Buddy check': ['Проверка напарника', 'バディチェック', '伙伴互查'], 'Vision grid': ['Тест зрения', '視力グリッド', '视力网格'],
  'Body mass': ['Масса тела', '体重', '体重'], 'Back pain': ['Боль в спине', '腰痛', '背痛'], 'Heart-rate variability': ['Вариабельность пульса', '心拍変動', '心率变异性'],
  'Blood pressure (top)': ['Давление (верхнее)', '血圧（上）', '血压（高压）'], 'Blood pressure (bottom)': ['Давление (нижнее)', '血圧（下）', '血压（低压）'],
  'Morning check': ['Утренняя проверка', '朝のチェック', '晨间检查'], 'Evening check': ['Вечерняя проверка', '夜のチェック', '晚间检查'], 'This week': ['На этой неделе', '今週', '本周'],
  // mission deck
  'Routine prompt': ['Плановое напоминание', '定時プロンプト', '例行提醒'], 'due now': ['пора сейчас', '今すぐ', '现在到期'], Start: ['Начать', '開始', '开始'],
  'Snooze 15 min': ['Отложить на 15 мин', '15分後に再通知', '15分钟后提醒'], 'Measure now': ['Измерить сейчас', '今すぐ測定', '立即测量'], 'See trends': ['Смотреть тренды', 'トレンドを見る', '查看趋势'],
  'Open check-in': ['Открыть проверку', 'チェックインを開く', '打开健康打卡'], 'Re-check': ['Повторная проверка', '再チェック', '复查'], 'All clear': ['Всё в порядке', '問題なし', '一切正常'],
  'Your next best step': ['Ваш следующий шаг', '次の最善の一歩', '你的下一步'], 'Nothing due right now.': ['Сейчас ничего не требуется.', '今は予定がありません。', '目前没有待办事项。'],
  'All 6 measured and GO. Nothing to do right now.': ['Все 6 измерены, статус GO. Сейчас ничего делать не нужно.', '6項目すべて測定済みでGO。今は何もする必要はありません。', '6项全部完成且为GO。目前无需操作。'],
  'From the Coach agent, checked by Safety.': ['От агента-наставника, проверено агентом безопасности.', 'コーチエージェントより、安全エージェントが確認済み。', '来自教练智能体，经安全智能体核查。'],
  'Review your watch items': ['Просмотрите пункты под наблюдением', '注意項目を確認してください', '查看需关注的项目'],
  '1 · Sense': ['1 · Измерить', '1 · 測る', '1 · 感知'], '2 · Understand': ['2 · Понять', '2 · 理解する', '2 · 理解'], '4 · Report · Earth link': ['4 · Доложить · связь с Землёй', '4 · 報告する · 地球リンク', '4 · 报告 · 地面链路'],
  'Capture · any way you like': ['Ввод · любым способом', '入力 · 好きな方法で', '采集 · 任意方式'], 'Sync devices': ['Синхронизировать приборы', '機器を同期', '同步设备'],
  '(simulated)': ['(имитация)', '（シミュレーション）', '（模拟）'], Speak: ['Говорить', '話す', '语音'], 'Face · voice': ['Лицо · голос', '顔 · 声', '面部 · 语音'],
  'Scan pouch': ['Скан упаковки', 'パウチをスキャン', '扫描食品袋'], Reaction: ['Реакция', '反応', '反应'], 'Today · your day is the menu': ['Сегодня · ваш день и есть меню', '今日 · 一日の予定がメニュー', '今日 · 日程即菜单'],
  'waiting for a reading': ['ожидание показания', '測定値を待っています', '等待读数'], 'nothing due': ['ничего не требуется', '予定なし', '无待办'], '1 prompt due now': ['1 напоминание сейчас', '1件の予定が今', '现有1项提醒'],
  'No decisions yet today. Take a reading and watch the agents work.': ['Сегодня решений ещё нет. Сделайте измерение и посмотрите, как работают агенты.', '今日はまだ判断がありません。測定して、エージェントの動きを見てください。', '今天还没有决策。先测量一次，看看智能体如何工作。'],
  'OPEN FULL AGENT TREE →': ['ОТКРЫТЬ ДЕРЕВО АГЕНТОВ →', 'エージェントツリーを開く →', '打开完整智能体树 →'], 'OPEN →': ['ОТКРЫТЬ →', '開く →', '打开 →'],
  'Post-sleep': ['После сна', '起床後', '睡醒后'], 'Payload ops': ['Работа с нагрузкой', 'ペイロード作業', '载荷操作'], Maintenance: ['Обслуживание', 'メンテナンス', '维护'],
  'Exercise · resistance': ['Тренировка · силовая', '運動 · 筋トレ', '锻炼 · 阻力'], 'Exercise · bike': ['Тренировка · велотренажёр', '運動 · バイク', '锻炼 · 自行车'],
  'Lunch · scan pouch': ['Обед · скан упаковки', '昼食 · パウチをスキャン', '午餐 · 扫描食品袋'], Vision: ['Зрение', '視力', '视力'], 'Crew time · buddy check': ['Время экипажа · проверка напарника', 'クルータイム · バディチェック', '乘组时间 · 伙伴互查'],
  'Pre-sleep': ['Перед сном', '就寝前', '睡前'],
  // guided measurement
  '1 · How to measure': ['1 · Как измерять', '1 · 測り方', '1 · 如何测量'], '2 · What the number means': ['2 · Что значит число', '2 · 数値の意味', '2 · 数值的含义'],
  '3 · Why it matters in space': ['3 · Почему это важно в космосе', '3 · 宇宙で重要な理由', '3 · 为何在太空中重要'], Reading: ['Показание', '測定値', '读数'],
  'Done · save': ['Готово · сохранить', '完了 · 保存', '完成 · 保存'], 'Read it to me': ['Прочитать вслух', '読み上げる', '读给我听'], 'Day ring': ['Кольцо дня', 'デイリング', '每日圆环'],
  Readiness: ['Готовность', '準備度', '就绪度'], Streak: ['Серия', '連続記録', '连续天数'], 'Crew goal': ['Цель экипажа', 'クルー目標', '乘组目标'], Deck: ['Пульт', 'デッキ', '总览'],
  'What TRIX noticed · just for you': ['Что заметил TRIX · лично для вас', 'TRIXの気づき · あなた専用', 'TRIX的发现 · 专属于你'], 'Who checked it': ['Кто проверил', 'チェックした担当', '由谁检查'],
  Next: ['Далее', '次へ', '下一步'], 'Back to my deck': ['Назад к пульту', 'デッキに戻る', '返回总览'], 'This session is complete.': ['Эта сессия завершена.', 'このセッションは完了です。', '本次检查已完成。'],
  'Top number': ['Верхнее число', '上の数値', '高压'], 'Bottom number': ['Нижнее число', '下の数値', '低压'], 'Tap here to start': ['Нажмите, чтобы начать', 'タップして開始', '点击开始'],
  'Simulated device for the demo': ['Имитация прибора для демо', 'デモ用のシミュレーション機器', '演示用模拟设备'], 'Open it now.': ['Откройте сейчас.', '今すぐ開いてください。', '立即打开。'],
  'TRIX passed this to the Emergency team.': ['TRIX передал это команде экстренной помощи.', 'TRIXはこれを緊急チームに引き継ぎました。', 'TRIX已将此交给应急团队。'],
  'Green is GO, amber is WATCH, red is NO-GO. TRIX also compares the reading with your own usual range.': ['Зелёный — GO, жёлтый — WATCH, красный — NO-GO. TRIX также сравнивает показание с вашим обычным диапазоном.', '緑はGO、黄はWATCH、赤はNO-GO。TRIXはあなたの普段の範囲とも比較します。', '绿色为GO，琥珀色为WATCH，红色为NO-GO。TRIX还会与你平时的范围比较。'],
  'This one fills the ring.': ['Это заполняет кольцо.', 'これでリングが埋まります。', '这一项会填满圆环。'], 'Extra check: counts toward your routine.': ['Дополнительная проверка: идёт в зачёт.', '追加チェック：ルーティンに加算されます。', '额外检查：计入你的例行记录。'],
  // how-to steps
  'Check your sleep watch, or think back to when you fell asleep and woke.': ['Посмотрите на часы сна или вспомните, когда уснули и проснулись.', '睡眠ウォッチを確認するか、寝た時刻と起きた時刻を思い出します。', '查看睡眠手表，或回想入睡和醒来的时间。'],
  'Enter the hours you actually slept, not time in the sleep station.': ['Введите часы реального сна, а не время в спальном месте.', '寝室にいた時間ではなく、実際に眠った時間を入力します。', '输入实际睡眠小时数，而不是在睡眠舱内的时间。'],
  'TRIX compares it with your own usual sleep.': ['TRIX сравнит это с вашим обычным сном.', 'TRIXがあなたの普段の睡眠と比較します。', 'TRIX会将其与你平时的睡眠比较。'],
  'Sit still and strapped in for 1 minute.': ['Посидите неподвижно, пристегнувшись, 1 минуту.', '体を固定して1分間じっとします。', '固定好身体，静坐1分钟。'],
  'Read your wearable, or count your pulse for 30 seconds and double it.': ['Считайте показание с браслета или посчитайте пульс 30 секунд и удвойте.', 'ウェアラブルを読むか、30秒間脈を数えて2倍にします。', '读取穿戴设备，或数30秒脉搏再乘以2。'],
  'Enter the number, or let the Bluetooth strap send it.': ['Введите число или дайте Bluetooth-датчику передать его.', '数値を入力するか、Bluetoothストラップから送信します。', '输入数值，或由蓝牙心率带发送。'],
  'Rest for 5 minutes with your arm at heart level.': ['Отдохните 5 минут, рука на уровне сердца.', '腕を心臓の高さにして5分間休みます。', '手臂与心脏同高，休息5分钟。'],
  'Wrap the cuff on bare skin above the elbow and press start. Stay still and quiet.': ['Наденьте манжету на голую кожу выше локтя и нажмите «старт». Не двигайтесь и не говорите.', '肘の上の素肌にカフを巻き、スタートを押します。動かず静かに。', '将袖带绑在肘上方裸露的皮肤上并按开始。保持静止、不要说话。'],
  'Enter the top and bottom numbers.': ['Введите верхнее и нижнее числа.', '上と下の数値を入力します。', '输入高压和低压数值。'],
  'Wait 15 minutes after exercise, food or a hot drink.': ['Подождите 15 минут после упражнений, еды или горячего питья.', '運動・食事・温かい飲み物の後は15分待ちます。', '运动、进食或喝热饮后等待15分钟。'],
  'Hold the thermometer in place until it beeps.': ['Держите термометр на месте до сигнала.', 'ピッと鳴るまで体温計を当てます。', '保持体温计不动直到发出提示音。'],
  'Enter the number.': ['Введите число.', '数値を入力します。', '输入数值。'],
  'Wash and dry your hands.': ['Вымойте и высушите руки.', '手を洗って乾かします。', '洗手并擦干。'],
  'Prick the side of a fingertip and touch the strip to the drop.': ['Проколите боковую часть кончика пальца и коснитесь полоской капли.', '指先の側面を刺し、試験紙を血液に当てます。', '刺破指尖侧面，用试纸接触血滴。'],
  'Wait for the meter and enter the number.': ['Дождитесь результата и введите число.', '測定器の表示を待って数値を入力します。', '等待仪器读数并输入数值。'],
  'Warm your hand and keep it still.': ['Согрейте руку и держите её неподвижно.', '手を温めて動かさないようにします。', '把手暖热并保持不动。'],
  'Clip the sensor on a fingertip without nail polish and wait 20 seconds.': ['Наденьте датчик на палец без лака и подождите 20 секунд.', 'マニキュアのない指先にセンサーを付け、20秒待ちます。', '把传感器夹在没有指甲油的指尖上，等待20秒。'],
  'Enter the steady number.': ['Введите устойчивое значение.', '安定した数値を入力します。', '输入稳定后的数值。'],
  'Hold the tablet steady with both hands.': ['Держите планшет двумя руками.', '両手でタブレットをしっかり持ちます。', '双手拿稳平板。'],
  'Wait for the box to turn bright, then tap it as fast as you can.': ['Дождитесь, когда поле вспыхнет, и нажмите как можно быстрее.', 'ボックスが明るくなったら、できるだけ速くタップします。', '等方框变亮后，尽快点击。'],
  'Do not guess: tapping early counts as a false start. 8 rounds.': ['Не угадывайте: раннее нажатие считается фальстартом. 8 раундов.', '予測しないでください。早押しはフライングです。8回行います。', '不要猜测：提前点击算抢跑。共8轮。'],
  'Take one slow breath.': ['Сделайте один медленный вдох.', 'ゆっくり一呼吸します。', '缓慢呼吸一次。'],
  'Pick the number that fits how you feel right now.': ['Выберите число, которое соответствует вашему состоянию сейчас.', '今の気分に合う数字を選びます。', '选择符合你此刻感受的数字。'],
  'There is no right answer. Details stay private unless you choose to share.': ['Правильного ответа нет. Подробности остаются личными, если вы не решите поделиться.', '正解はありません。共有を選ばない限り詳細は非公開です。', '没有标准答案。除非你选择分享，否则详情保持私密。'],
  "Add up today's exercise blocks (resistance, bike, treadmill).": ['Сложите сегодняшние тренировки (силовая, велотренажёр, дорожка).', '今日の運動（筋トレ・バイク・トレッドミル）を合計します。', '把今天的锻炼时段（阻力、自行车、跑步机）加起来。'],
  'Enter the total minutes.': ['Введите общее число минут.', '合計分数を入力します。', '输入总分钟数。'],
  'TRIX links it to your bone and muscle trend.': ['TRIX свяжет это с динамикой ваших костей и мышц.', 'TRIXが骨と筋肉のトレンドに結び付けます。', 'TRIX会将其与你的骨骼和肌肉趋势关联。'],
  'Use the body mass device at the same time of day each week.': ['Используйте прибор измерения массы в одно и то же время каждую неделю.', '毎週同じ時間帯に体重測定装置を使います。', '每周在同一时间使用体重测量装置。'],
  'Stay still until it gives a steady number.': ['Не двигайтесь, пока значение не станет устойчивым.', '数値が安定するまで動かないでください。', '保持不动直到读数稳定。'],
  'Enter the number in kilograms.': ['Введите значение в килограммах.', 'キログラムで入力します。', '以千克为单位输入。'],
  'Notice your back for a moment while you stretch gently.': ['Слегка потянитесь и прислушайтесь к спине.', '軽く伸びをしながら背中の状態を確かめます。', '轻轻伸展，留意一下背部的感觉。'],
  '0 is no pain, 10 is the worst you can imagine.': ['0 — боли нет, 10 — самая сильная, какую можно представить.', '0は痛みなし、10は想像できる最悪の痛みです。', '0表示无痛，10表示能想象的最剧烈疼痛。'],
  'Pick the number for right now.': ['Выберите число для текущего момента.', '今の状態の数字を選びます。', '选择此刻对应的数字。'],
  // check-in
  Vitals: ['Показатели', 'バイタル', '生命体征'], 'Face & voice': ['Лицо и голос', '顔と声', '面部与语音'], 'Eyes & skin': ['Глаза и кожа', '目と肌', '眼睛与皮肤'], 'Symptoms & food': ['Симптомы и еда', '症状と食事', '症状与饮食'],
  'Face and voice check': ['Проверка лица и голоса', '顔と声のチェック', '面部与语音检查'], 'Face result': ['Результат по лицу', '顔の結果', '面部结果'], Blinks: ['Моргания', 'まばたき', '眨眼'],
  'Long blinks': ['Долгие моргания', '長いまばたき', '长时间闭眼'], 'Eyes closed': ['Глаза закрыты', '閉眼', '闭眼'], Pace: ['Темп', '速さ', '语速'], Pauses: ['Паузы', '間', '停顿'], Pitch: ['Высота голоса', '声の高さ', '音调'],
  'Read this aloud in your normal voice:': ['Прочитайте вслух обычным голосом:', '普段の声で読み上げてください：', '用平常的声音朗读以下内容：'],
  'How you speak (pace, pauses, pitch) is compared with your own normal. Audio is not kept.': ['Ваша речь (темп, паузы, высота) сравнивается с вашей нормой. Аудио не сохраняется.', '話し方（速さ・間・高さ）をあなたの普段と比較します。音声は保存しません。', '你的语速、停顿和音调会与你平时的情况比较。音频不会保留。'],
  'Hold the tablet at arm\'s length, look at the screen and relax.': ['Держите планшет на вытянутой руке, смотрите на экран и расслабьтесь.', 'タブレットを腕の長さに持ち、画面を見てリラックスします。', '把平板举到一臂距离，看着屏幕放松。'],
  'Amsler grid with a centre dot': ['Сетка Амслера с точкой в центре', '中心点付きアムスラーグリッド', '带中心点的阿姆斯勒方格'], Straight: ['Ровные', 'まっすぐ', '笔直'],
  'Wavy, blurry or missing': ['Волнистые, размытые или пропадают', '波打つ・ぼやける・欠ける', '弯曲、模糊或缺失'], 'Both eyes normal.': ['Оба глаза в норме.', '両目とも正常です。', '双眼正常。'],
  'Skin photo': ['Фото кожи', '皮膚の写真', '皮肤照片'], 'Take photo': ['Снять фото', '撮影', '拍照'], 'Rash, cold sore or a cut? Photograph it with the flash on.': ['Сыпь, герпес или порез? Сфотографируйте со вспышкой.', '発疹・口唇ヘルペス・切り傷は、フラッシュをつけて撮影します。', '皮疹、唇疱疹或伤口？开闪光灯拍照。'],
  'Photos stay onboard and are shared only with the crew medical officer.': ['Фото остаются на борту и доступны только медицинскому офицеру экипажа.', '写真は船内に保管され、クルー医療担当者のみと共有されます。', '照片仅保存在舱内，只与乘组医疗官共享。'],
  'How do you feel?': ['Как вы себя чувствуете?', '体調はどうですか？', '你感觉如何？'], 'How is your mood?': ['Какое у вас настроение?', '気分はどうですか？', '你的情绪如何？'],
  'For example: mild headache since waking up': ['Например: лёгкая головная боль с утра', '例：起きてから軽い頭痛', '例如：醒来后轻微头痛'], 'Food & water': ['Еда и вода', '食事と水分', '饮食与饮水'],
  'Today so far': ['Сегодня пока', '今日のこれまで', '今日至今'], 'Or pick from the menu': ['Или выберите из меню', 'またはメニューから選ぶ', '或从菜单中选择'], 'Choose food…': ['Выберите еду…', '食事を選ぶ…', '选择食物…'],
  'Show the pouch\'s QR label to the camera': ['Покажите QR-код упаковки камере', 'パウチのQRラベルをカメラに見せます', '把食品袋的二维码对准摄像头'], 'Print pouch labels': ['Печать этикеток', 'パウチラベルを印刷', '打印食品袋标签'],
  'What TRIX found': ['Что нашёл TRIX', 'TRIXの所見', 'TRIX的发现'], 'What to do': ['Что делать', 'すべきこと', '该做什么'], Result: ['Результат', '結果', '结果'], 'Mission logged': ['Записано в миссии', 'ミッションに記録', '已记录'],
  'Ready?': ['Готовы?', '準備はいいですか？', '准备好了吗？'], 'see what the agents did': ['что сделали агенты', 'エージェントの動きを見る', '查看智能体的处理'],
  // emergency and help
  Emergency: ['Тревога', '緊急', '紧急情况'], 'Who needs help?': ['Кому нужна помощь?', '誰に助けが必要ですか？', '谁需要帮助？'], 'What is happening?': ['Что происходит?', '何が起きていますか？', '发生了什么？'],
  'Not responding': ['Не реагирует', '反応がない', '无反应'], 'Chest pain': ['Боль в груди', '胸の痛み', '胸痛'], 'Heart racing or uneven': ['Сердце частит или сбивается', '動悸・不整脈', '心跳过快或不齐'],
  'Can\'t breathe well': ['Трудно дышать', '息が苦しい', '呼吸困难'], 'Cut or burn': ['Порез или ожог', '切り傷・やけど', '割伤或烧伤'], 'After a spacewalk': ['После выхода в космос', '船外活動のあと', '太空行走后'],
  'Solar storm': ['Солнечная буря', '太陽嵐', '太阳风暴'], 'Very low or stressed': ['Подавленность или стресс', '気分の落ち込み・ストレス', '情绪低落或压力大'], 'Or say / type it': ['Или скажите / напишите', 'または話す / 入力する', '或说出 / 输入'],
  'Heart rate (if known)': ['Пульс (если известен)', '心拍数（わかれば）', '心率（如已知）'], 'Oxygen %': ['Кислород %', '酸素 %', '血氧 %'], 'Get help now': ['Получить помощь сейчас', '今すぐ助けを呼ぶ', '立即求助'],
  Location: ['Местоположение', '位置', '位置'], 'Reply time': ['Время ответа', '応答時間', '回复时间'], 'Do this now': ['Сделайте это сейчас', '今これをしてください', '立即执行'],
  'Why TRIX is worried': ['Почему TRIX обеспокоен', 'TRIXが心配している理由', 'TRIX担心的原因'], 'Virtual medical team': ['Виртуальная медкоманда', 'バーチャル医療チーム', '虚拟医疗团队'], 'Logged for Earth': ['Записано для Земли', '地球向けに記録', '已记录并报送地球'],
  'See every agent decision': ['Все решения агентов', 'すべてのエージェントの判断を見る', '查看每个智能体的决策'], Patient: ['Пациент', '患者', '患者'],
  'Tell TRIX who needs help and what is happening. The Emergency team answers in seconds, on board.': ['Скажите TRIX, кому нужна помощь и что происходит. Команда экстренной помощи ответит за секунды, на борту.', '誰に助けが必要で、何が起きているかをTRIXに伝えてください。緊急チームが数秒で船内で応答します。', '告诉TRIX谁需要帮助以及发生了什么。应急团队几秒内在舱内响应。'],
  // procedures / care
  Care: ['Уход', 'ケア', '医疗护理'], 'Step-by-step procedures, practice, medicines and landing readiness': ['Пошаговые процедуры, тренировка, лекарства и готовность к посадке', '手順、練習、薬、着陸準備', '分步流程、练习、药品与着陆准备'],
  Practice: ['Тренировка', '練習', '练习'], 'Ask TRIX': ['Спросить TRIX', 'TRIXに聞く', '询问TRIX'], Ask: ['Спросить', '質問する', '提问'], Question: ['Вопрос', '質問', '问题'],
  'Landing readiness': ['Готовность к посадке', '着陸準備', '着陆准备'], Medicines: ['Лекарства', '薬', '药品'], 'Ultrasound check': ['УЗИ-проверка', '超音波チェック', '超声检查'],
  'Start landing-day stand test': ['Начать тест стояния перед посадкой', '着陸日の起立テストを開始', '开始着陆日站立测试'], 'Simulated stock. Doses only from the crew medical officer.': ['Имитация запасов. Дозы — только от медицинского офицера экипажа.', '在庫はシミュレーションです。用量はクルー医療担当者のみが決めます。', '模拟库存。剂量仅由乘组医疗官决定。'],
  'Answers come only from NASA and onboard sources, with citations. No doses, no diagnoses.': ['Ответы только из источников NASA и бортовых документов, со ссылками. Без доз и диагнозов.', '回答はNASAと船内の資料のみに基づき、出典付きです。用量や診断はしません。', '答案仅来自NASA和舱内资料并附引用。不给剂量，不下诊断。'],
  'Steps come only from approved protocols. TRIX checks each step (camera or device) before moving on. Use Practice to train with a score.': ['Шаги берутся только из утверждённых протоколов. TRIX проверяет каждый шаг (камера или прибор) перед переходом дальше. Режим тренировки даёт оценку.', '手順は承認済みプロトコルのみ。TRIXは各ステップ（カメラまたは機器）を確認してから進みます。練習モードでは点数が出ます。', '步骤仅来自已批准的规程。TRIX在进入下一步前核查每一步（摄像头或设备）。练习模式可计分。'],
  Repeat: ['Повторить', 'もう一度', '重复'], 'I need help': ['Мне нужна помощь', '助けが必要', '我需要帮助'], 'Done · next step': ['Готово · следующий шаг', '完了 · 次のステップ', '完成 · 下一步'],
  'Read steps aloud': ['Читать шаги вслух', '手順を読み上げる', '朗读步骤'], 'TRIX is saying': ['TRIX говорит', 'TRIXの指示', 'TRIX正在说'], 'Do the step, then confirm.': ['Выполните шаг и подтвердите.', 'ステップを行い、確認してください。', '执行该步骤，然后确认。'],
  'Hook your feet in the foot loops so your hands stay steady.': ['Зацепите ноги за петли, чтобы руки были устойчивы.', '手が安定するように足をフットループに掛けてください。', '把脚钩在脚环里，让双手保持稳定。'],
  'Device check': ['Проверка прибора', '機器チェック', '设备检查'], 'Back to Care': ['Назад к уходу', 'ケアに戻る', '返回医疗护理'], Health: ['Здоровье', '健康', '健康'],
  // trends
  Indicators: ['Показатели', '指標', '指标'], Trend: ['Тренд', 'トレンド', '趋势'], 'What happens in space': ['Что происходит в космосе', '宇宙で起きること', '在太空中会发生什么'],
  'Why we measure it': ['Зачем мы это измеряем', '測る理由', '为何测量'], 'What it means': ['Что это значит', 'その意味', '含义'], 'What you can do': ['Что вы можете сделать', 'できること', '你可以做什么'],
  '30-day overview': ['Обзор за 30 дней', '30日間の概要', '30天概览'], 'Sleep, mood, alertness and strain': ['Сон, настроение, бодрость и нагрузка', '睡眠・気分・覚醒度・負荷', '睡眠、情绪、警觉度与负荷'],
  'Cabin air and headaches': ['Воздух в кабине и головные боли', '船内空気と頭痛', '舱内空气与头痛'], 'Above the watch level': ['Выше уровня наблюдения', '注意レベルより上', '高于关注阈值'], 'Below the watch level': ['Ниже уровня наблюдения', '注意レベルより下', '低于关注阈值'],
  'Do the reaction test': ['Пройти тест реакции', '反応テストをする', '做反应测试'],
  // crew
  'Team goal': ['Цель команды', 'チーム目標', '团队目标'], 'Crew cohesion': ['Сплочённость экипажа', 'クルーの結束', '乘组凝聚力'], 'Crew mood': ['Настроение экипажа', 'クルーの気分', '乘组情绪'],
  'vs last week': ['к прошлой неделе', '先週比', '与上周相比'], 'Buddy concerns': ['Опасения напарников', 'バディの懸念', '伙伴的担忧'], 'Note (optional)': ['Заметка (необязательно)', 'メモ（任意）', '备注（可选）'],
  'They\'re OK': ['С ними всё в порядке', '大丈夫です', '他们没事'], 'I\'m worried about them': ['Я за них беспокоюсь', '心配です', '我为他们担心'], 'Not yet': ['Ещё нет', 'まだ', '尚未'],
  'Streaks, team goal, buddy check and your privacy': ['Серии, цель команды, проверка напарника и приватность', '連続記録、チーム目標、バディチェック、プライバシー', '连续记录、团队目标、伙伴互查与你的隐私'],
  'Pairs rotate every day. “I\'m worried” sends a private note to the crew medical officer.': ['Пары меняются каждый день. «Я беспокоюсь» отправляет личную заметку медицинскому офицеру экипажа.', 'ペアは毎日入れ替わります。「心配です」はクルー医療担当者に非公開のメモを送ります。', '搭档每天轮换。“我担心”会私下通知乘组医疗官。'],
  'Share daily vitals summary with Earth': ['Передавать на Землю сводку показателей', '毎日のバイタル要約を地球と共有', '与地球共享每日生命体征摘要'], 'Share mood details': ['Передавать детали настроения', '気分の詳細を共有', '共享情绪详情'],
  'Keep voice recordings': ['Хранить голосовые записи', '音声の録音を保存', '保留语音录音'], 'Keep face-check video': ['Хранить видео проверки лица', '顔チェックの動画を保存', '保留面部检查视频'],
  'Crew can see my status colours': ['Экипаж видит мои цвета статуса', 'クルーが私の状態色を見られる', '乘组可见我的状态颜色'],
  // earth link
  'Report queue': ['Очередь отчётов', '報告キュー', '报告队列'], 'Reports travel from the ship to Earth': ['Отчёты идут с корабля на Землю', '報告は船から地球へ送られます', '报告从飞船发送到地球'], Ship: ['Корабль', '船', '飞船'],
  'Earth · flight surgeons': ['Земля · врачи полёта', '地球 · フライトサージャン', '地球 · 飞行外科医生'], 'Nothing queued.': ['Очередь пуста.', 'キューは空です。', '队列为空。'], 'Mission location': ['Место миссии', 'ミッションの位置', '任务位置'],
  'One-way delay': ['Задержка в одну сторону', '片道遅延', '单程延迟'], 'Space weather': ['Космическая погода', '宇宙天気', '空间天气'], 'On-board AI': ['Бортовой ИИ', '船内AI', '舱载AI'],
  'No internet needed': ['Интернет не нужен', 'インターネット不要', '无需互联网'], 'Medical devices': ['Медицинские приборы', '医療機器', '医疗设备'], 'Alert the crew': ['Оповестить экипаж', 'クルーに警報', '警示乘组'],
  'No flares in the last 7 days.': ['Вспышек за последние 7 дней не было.', '過去7日間にフレアはありません。', '过去7天无耀斑。'], Priority: ['Приоритет', '優先度', '优先级'], Size: ['Размер', 'サイズ', '大小'], Status: ['Статус', '状態', '状态'], Who: ['Кто', '誰', '谁'],
  'What reaches Earth, when, and what runs on board without it': ['Что доходит до Земли, когда, и что работает на борту без неё', '何がいつ地球に届き、何が地球なしで船内で動くか', '什么会传到地球、何时传到，以及没有地球时舱内能运行什么'],
  'Summaries only. Your privacy choices apply (Crew → My privacy).': ['Только сводки. Действуют ваши настройки приватности (Экипаж → Моя приватность).', '要約のみ。プライバシー設定が適用されます（クルー → プライバシー）。', '仅摘要。你的隐私设置生效（乘组 → 我的隐私）。'],
  // agent tree
  'Agent office': ['Офис агентов', 'エージェントオフィス', '智能体办公室'], 'Who gave what work to whom': ['Кто кому что поручил', '誰が誰にどの作業を渡したか', '谁把什么工作交给了谁'], Case: ['Случай', 'ケース', '案例'], Team: ['Команда', 'チーム', '团队'],
  'Given by': ['Поручил', '依頼元', '委派人'], Given: ['Поручено', '依頼内容', '任务'], 'Tools it used': ['Использованные инструменты', '使ったツール', '使用的工具'], Returned: ['Вернул', '返却', '返回'], 'Passed to': ['Передано', '引き継ぎ先', '传递给'], Took: ['Заняло', '所要時間', '耗时'],
  Replay: ['Воспроизвести', 'リプレイ', '回放'], 'Replay this case': ['Воспроизвести этот случай', 'このケースをリプレイ', '回放此案例'], 'No tools: it only routes work.': ['Без инструментов: только распределяет работу.', 'ツールなし：作業を振り分けるだけです。', '无工具：仅分派工作。'],
  'No cases yet. Take a reading or raise an alert, then come back.': ['Случаев пока нет. Сделайте измерение или поднимите тревогу и вернитесь.', 'まだケースはありません。測定するか警報を出してから戻ってください。', '还没有案例。先测量或发出警报，然后再回来。'],
  // shared chips and small words
  Done: ['Готово', '完了', '完成'], Recorded: ['Записано', '録音済み', '已录制'], Concern: ['Опасение', '懸念', '担忧'], Steady: ['Стабильно', '安定', '稳定'], Watch: ['Наблюдение', '注意', '关注'],
  'No data yet.': ['Данных пока нет.', 'まだデータがありません。', '尚无数据。'],
  // check-in buttons, mood scale, hologram labels
  'Morning check-in': ['Утренняя проверка', '朝のチェックイン', '晨间打卡'], 'Evening check-in': ['Вечерняя проверка', '夜のチェックイン', '晚间打卡'],
  'Say your readings': ['Скажите показания', '測定値を話す', '说出你的读数'], 'Start speaking': ['Начать говорить', '話し始める', '开始说话'], 'Say it': ['Сказать', '話す', '说出来'],
  'Nothing heard yet.': ['Пока ничего не услышано.', 'まだ何も聞こえていません。', '尚未听到内容。'], Devices: ['Приборы', '機器', '设备'],
  'Connect Bluetooth heart-rate strap': ['Подключить Bluetooth-датчик пульса', 'Bluetooth心拍ストラップを接続', '连接蓝牙心率带'], 'Import device file (CSV)': ['Импорт файла прибора (CSV)', '機器ファイルを読み込む（CSV）', '导入设备文件（CSV）'],
  'Works with any standard Bluetooth heart-rate strap or watch.': ['Работает с любым стандартным Bluetooth-датчиком или часами.', '標準のBluetooth心拍ストラップやウォッチで使えます。', '适用于任何标准蓝牙心率带或手表。'],
  'Send check-in': ['Отправить проверку', 'チェックインを送信', '提交打卡'], 'Start face check': ['Начать проверку лица', '顔チェックを開始', '开始面部检查'], 'Scan a pouch': ['Сканировать упаковку', 'パウチをスキャン', '扫描食品袋'],
  'Photo of a pouch': ['Фото упаковки', 'パウチの写真', '食品袋照片'], Camera: ['Камера', 'カメラ', '摄像头'], Upload: ['Загрузить', 'アップロード', '上传'], Record: ['Записать', '録音', '录音'],
  Back: ['Назад', '戻る', '返回'], 'Back to Health': ['Назад к здоровью', '健康に戻る', '返回健康'],
  'Very low': ['Очень плохо', 'とても低い', '很低'], Low: ['Плохо', '低い', '较低'], Good: ['Хорошо', '良い', '良好'], Great: ['Отлично', 'とても良い', '很好'],
  VISION: ['ЗРЕНИЕ', '視力', '视力'], RADIATION: ['РАДИАЦИЯ', '放射線', '辐射'], 'LUNGS · CABIN AIR': ['ЛЁГКИЕ · ВОЗДУХ КАБИНЫ', '肺 · 船内空気', '肺 · 舱内空气'], HEART: ['СЕРДЦЕ', '心臓', '心脏'],
  'FOOD · WATER · BLOOD SUGAR': ['ЕДА · ВОДА · САХАР', '食事 · 水分 · 血糖', '饮食 · 水分 · 血糖'], 'IMMUNE · SKIN': ['ИММУНИТЕТ · КОЖА', '免疫 · 皮膚', '免疫 · 皮肤'], 'BONES · MUSCLE': ['КОСТИ · МЫШЦЫ', '骨 · 筋肉', '骨骼 · 肌肉'],
  'BRAIN · SLEEP · MOOD': ['МОЗГ · СОН · НАСТРОЕНИЕ', '脳 · 睡眠 · 気分', '大脑 · 睡眠 · 情绪'], 'SLEEP · MOOD · ALERTNESS': ['СОН · НАСТРОЕНИЕ · БОДРОСТЬ', '睡眠 · 気分 · 覚醒度', '睡眠 · 情绪 · 警觉度'],
  'NO DATA': ['НЕТ ДАННЫХ', 'データなし', '无数据'], 'DAILY CARE': ['ЕЖЕДНЕВНЫЙ УХОД', '日常ケア', '日常护理'], EMERGENCY: ['ТРЕВОГА', '緊急', '紧急'], OPERATIONS: ['ОПЕРАЦИИ', '運用', '运行'],
};
export function t(s) { if (lang === 'en') return s; const e = D[s]; return (e && e[IDX[lang]]) || s; }

// Translate the static text already in the page: every text node and placeholder / aria-label / title that matches a key.
// Each node remembers its English, so switching language again (or back to English) re-translates persistent elements.
const ATTRS = ['placeholder', 'aria-label', 'title'];
const EN = new WeakMap();
const pick = (en) => (lang === 'en' ? en : D[en]?.[IDX[lang]]);
export function translateDom(root) {
  if (!root || root.nodeType !== 1) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const n of nodes) {
    const cur = n.nodeValue.trim(), en = EN.get(n) ?? cur;
    if (!en || (!EN.has(n) && lang === 'en')) continue;
    const tr = pick(en);
    if (!tr || tr === cur) continue;
    EN.set(n, en);
    n.nodeValue = n.nodeValue.replace(cur, tr);
  }
  for (const el of [root, ...root.querySelectorAll('[placeholder],[aria-label],[title]')]) {
    for (const a of ATTRS) {
      const cur = el.getAttribute?.(a);
      if (!cur) continue;
      const mem = EN.get(el) || {}, en = mem[a] ?? cur.trim();
      if (!(a in mem) && lang === 'en') continue;
      const tr = pick(en);
      if (!tr || tr === cur) continue;
      EN.set(el, { ...mem, [a]: en });
      el.setAttribute(a, tr);
    }
  }
}
