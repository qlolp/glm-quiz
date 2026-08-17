const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { databasePath } = require('../config');

// Initialize SQLite Database
const db = new Database(databasePath, { verbose: () => {} });

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
    -- Original tables
    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_text TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_answer INTEGER NOT NULL CHECK(correct_answer IN (0, 1, 2, 3)),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        moderated BOOLEAN DEFAULT 0,
        is_user_question BOOLEAN DEFAULT 1,
        category TEXT DEFAULT 'general',
        explanation TEXT,
        reference_link TEXT
    );

    CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        username TEXT,
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        answers_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS default_questions (
        id INTEGER PRIMARY KEY,
        question_text TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_answer INTEGER NOT NULL CHECK(correct_answer IN (0, 1, 2, 3)),
        category TEXT DEFAULT 'general',
        explanation TEXT,
        reference_link TEXT,
        difficulty TEXT DEFAULT 'medium'
    );

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT,
        avatar TEXT DEFAULT 'default',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_score INTEGER DEFAULT 0,
        quizzes_completed INTEGER DEFAULT 0,
        high_score INTEGER DEFAULT 0,
        learning_mode_used INTEGER DEFAULT 0,
        cases_completed INTEGER DEFAULT 0
    );

    -- Achievements
    CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        requirement_type TEXT,
        requirement_value INTEGER,
        points INTEGER DEFAULT 0
    );

    -- User achievements
    CREATE TABLE IF NOT EXISTS user_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        achievement_id TEXT,
        earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (achievement_id) REFERENCES achievements(id),
        UNIQUE(user_id, achievement_id)
    );

    -- Question statistics (for heat map)
    CREATE TABLE IF NOT EXISTS question_stats (
        question_id INTEGER PRIMARY KEY,
        times_answered INTEGER DEFAULT 0,
        times_correct INTEGER DEFAULT 0,
        times_wrong INTEGER DEFAULT 0,
        difficulty_score REAL DEFAULT 0.5,
        FOREIGN KEY (question_id) REFERENCES default_questions(id)
    );

    -- Case studies
    CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        scenario TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        difficulty TEXT DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Case steps
    CREATE TABLE IF NOT EXISTS case_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        correct_answer INTEGER NOT NULL,
        explanation TEXT,
        FOREIGN KEY (case_id) REFERENCES cases(id)
    );

    -- User case progress
    CREATE TABLE IF NOT EXISTS user_case_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        case_id TEXT,
        completed BOOLEAN DEFAULT 0,
        score INTEGER DEFAULT 0,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (case_id) REFERENCES cases(id),
        UNIQUE(user_id, case_id)
    );

    -- Adaptive quiz sessions (server-side answer tracking)
    CREATE TABLE IF NOT EXISTS adaptive_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS adaptive_session_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        question_id INTEGER NOT NULL,
        user_answer INTEGER NOT NULL,
        is_correct INTEGER NOT NULL,
        answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES adaptive_sessions(id),
        UNIQUE(session_id, question_id)
    );

    -- Question feedback
    CREATE TABLE IF NOT EXISTS question_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER,
        feedback_type TEXT,
        comment TEXT,
        user_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (question_id) REFERENCES questions(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Question user ratings (quality votes)
    CREATE TABLE IF NOT EXISTS question_ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL,
        user_id TEXT,
        rating INTEGER NOT NULL CHECK(rating IN (1, -1)),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (question_id) REFERENCES questions(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(question_id, user_id)
    );

    -- Question reports / complaints from users
    CREATE TABLE IF NOT EXISTS question_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL,
        user_id TEXT,
        reason TEXT NOT NULL,
        comment TEXT,
        status TEXT DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (question_id) REFERENCES questions(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Spaced Repetition (SM-2 Algorithm)
    CREATE TABLE IF NOT EXISTS spaced_repetition (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        question_id INTEGER NOT NULL,
        ease_factor REAL DEFAULT 2.5,
        interval INTEGER DEFAULT 1,
        repetitions INTEGER DEFAULT 0,
        next_review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_reviewed_at TIMESTAMP,
        quality INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, question_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (question_id) REFERENCES default_questions(id)
    );

    -- Competency Matrix
    CREATE TABLE IF NOT EXISTS competency_matrix (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        correct_count INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, category),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Batch import (mass registration)
    CREATE TABLE IF NOT EXISTS batch_import (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        username TEXT,
        display_name TEXT,
        role TEXT,
        organization TEXT,
        imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Certificates
    CREATE TABLE IF NOT EXISTS certificates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        percentage REAL NOT NULL,
        issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        verification_code TEXT UNIQUE NOT NULL,
        pdf_path TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_results_score ON results(score);
    CREATE INDEX IF NOT EXISTS idx_questions_moderated ON questions(moderated, created_at);
    CREATE INDEX IF NOT EXISTS idx_results_user ON results(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_achievements ON user_achievements(user_id);
    CREATE INDEX IF NOT EXISTS idx_results_created ON results(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_users_score ON users(total_score DESC);
    CREATE INDEX IF NOT EXISTS idx_case_steps_case ON case_steps(case_id);
    CREATE INDEX IF NOT EXISTS idx_question_stats_question ON question_stats(question_id);
    CREATE INDEX IF NOT EXISTS idx_default_questions_category ON default_questions(category);
    CREATE INDEX IF NOT EXISTS idx_spaced_repetition_user ON spaced_repetition(user_id);
    CREATE INDEX IF NOT EXISTS idx_spaced_repetition_review ON spaced_repetition(user_id, next_review_date);
    CREATE INDEX IF NOT EXISTS idx_competency_matrix_user ON competency_matrix(user_id);
    CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);
    CREATE INDEX IF NOT EXISTS idx_question_feedback_user ON question_feedback(user_id);
    CREATE INDEX IF NOT EXISTS idx_question_ratings_user ON question_ratings(user_id);
    CREATE INDEX IF NOT EXISTS idx_question_reports_user ON question_reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_case_progress_user ON user_case_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_results_created_user ON results(created_at DESC, user_id);
`);

// Add difficulty column if it doesn't exist (migration)
try {
    db.exec(`ALTER TABLE default_questions ADD COLUMN difficulty TEXT DEFAULT 'medium'`);
    console.log('Added difficulty column to default_questions');
} catch (e) {
    // Column already exists
}

// Add user columns if they don't exist (migration)
try {
    db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
    console.log('Added phone column to users');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE users ADD COLUMN organization TEXT`);
    console.log('Added organization column to users');
} catch (e) {
    // Column already exists
}

// Add unique index on batch_import.username to support INSERT OR IGNORE
try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_import_username ON batch_import(username)`);
} catch (e) {
    // Index may already exist or username column may differ on very old DB
}

// Add email column and unique index for email-based registration
try {
    db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
    console.log('Added email column to users');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
} catch (e) {
    // Index may already exist
}

// Add gamification tracking columns if they don't exist (migration)
try {
    db.exec(`ALTER TABLE users ADD COLUMN high_score INTEGER DEFAULT 0`);
    console.log('Added high_score column to users');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE users ADD COLUMN learning_mode_used INTEGER DEFAULT 0`);
    console.log('Added learning_mode_used column to users');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE users ADD COLUMN cases_completed INTEGER DEFAULT 0`);
    console.log('Added cases_completed column to users');
} catch (e) {
    // Column already exists
}

// Add mode column to results (BUG-09: certificates must be exam-only)
try {
    db.exec(`ALTER TABLE results ADD COLUMN mode TEXT DEFAULT NULL`);
    console.log('Added mode column to results');
} catch (e) {
    // Column already exists
}

// Dedupe case_steps and enforce uniqueness
try {
    const dupes = db.prepare(`
        SELECT case_id, step_number, COUNT(*) as cnt
        FROM case_steps
        GROUP BY case_id, step_number
        HAVING cnt > 1
    `).all();
    if (dupes.length > 0) {
        db.exec(`
            DELETE FROM case_steps
            WHERE id NOT IN (
                SELECT MIN(id) FROM case_steps GROUP BY case_id, step_number
            )
        `);
        console.log(`Deduplicated case_steps (${dupes.length} duplicate groups removed)`);
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_case_steps_case_step ON case_steps(case_id, step_number)`);
} catch (e) {
    console.error('case_steps dedup migration:', e.message);
}

try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_adaptive_session_answers_session ON adaptive_session_answers(session_id)`);
} catch (e) {
    // Index may already exist
}

// hint + wrong_explanations on default_questions
try {
    db.exec(`ALTER TABLE default_questions ADD COLUMN hint TEXT`);
    console.log('Added hint column to default_questions');
} catch (e) { /* exists */ }
try {
    db.exec(`ALTER TABLE default_questions ADD COLUMN wrong_explanations TEXT`);
    console.log('Added wrong_explanations column to default_questions');
} catch (e) { /* exists */ }

// branches for case step navigation
try {
    db.exec(`ALTER TABLE case_steps ADD COLUMN branches TEXT`);
    console.log('Added branches column to case_steps');
} catch (e) { /* exists */ }

// Action plans (post-quiz commitments)
db.exec(`
    CREATE TABLE IF NOT EXISTS action_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        text TEXT NOT NULL,
        score INTEGER,
        mode TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

// Pre/post assessment results
db.exec(`
    CREATE TABLE IF NOT EXISTS prepost_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        phase TEXT NOT NULL CHECK(phase IN ('pre', 'post')),
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        percentage REAL,
        answers_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_prepost_user_phase ON prepost_results(user_id, phase);
`);

// Moderated live Q&A (persisted for export and seminar digest)
db.exec(`
    CREATE TABLE IF NOT EXISTS qa_sessions (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS qa_questions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved')),
        votes INTEGER NOT NULL DEFAULT 0,
        highlighted INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES qa_sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_qa_questions_session ON qa_questions(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_qa_sessions_created ON qa_sessions(created_at);
`);

// Fixed 7-question set for pre/post mode (shared with client index.html)
// Spans ethics / safety / care_standards / emergency / rights
const PREPOST_QUESTION_IDS = [1, 5, 12, 15, 24, 36, 48];

// Initialize default achievements
function initAchievements() {
    const achievements = [
        { id: 'first_quiz', title: 'Первые шаги', description: 'Пройдите первую викторину', icon: '🎯', requirement_type: 'quizzes_completed', requirement_value: 1, points: 10 },
        { id: 'quiz_master', title: 'Мастер викторины', description: 'Пройдите 10 викторин', icon: '🏆', requirement_type: 'quizzes_completed', requirement_value: 10, points: 50 },
        { id: 'expert', title: 'Эксперт соцобслуживания', description: 'Наберите 400+ баллов', icon: '🌟', requirement_type: 'high_score', requirement_value: 400, points: 100 },
        { id: 'perfect_score', title: 'Идеально', description: 'Ответьте на все вопросы правильно', icon: '💯', requirement_type: 'perfect_score', requirement_value: 1, points: 75 },
        { id: 'learner', title: 'Ученик', description: 'Используйте режим обучения 5 раз', icon: '📚', requirement_type: 'learning_mode_used', requirement_value: 5, points: 25 },
        { id: 'case_solver', title: 'Решитель кейсов', description: 'Решите 5 кейсов', icon: '🔍', requirement_type: 'cases_completed', requirement_value: 5, points: 40 },
    ];

    const insert = db.prepare(`
        INSERT OR IGNORE INTO achievements (id, title, description, icon, requirement_type, requirement_value, points)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    achievements.forEach(a => {
        insert.run(a.id, a.title, a.description, a.icon, a.requirement_type, a.requirement_value, a.points);
    });
}

// Load default questions from JSON file
function loadDefaultQuestions() {
    const questionsPath = path.join(__dirname, '../../questions.json');

    if (fs.existsSync(questionsPath)) {
        const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

        const insertQuestion = db.prepare(`
            INSERT OR IGNORE INTO default_questions (id, question_text, option_a, option_b, option_c, option_d, correct_answer, category, explanation, reference_link, difficulty, hint, wrong_explanations)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const updateExtras = db.prepare(`
            UPDATE default_questions
            SET hint = ?, wrong_explanations = ?,
                explanation = COALESCE(?, explanation),
                reference_link = COALESCE(?, reference_link),
                difficulty = COALESCE(?, difficulty)
            WHERE id = ?
        `);

        const insertMany = db.transaction((questions) => {
            for (const q of questions) {
                const wrongExplanations = Array.isArray(q.wrong_explanations)
                    ? JSON.stringify(q.wrong_explanations)
                    : null;
                insertQuestion.run(
                    q.id,
                    q.question,
                    q.options[0],
                    q.options[1],
                    q.options[2],
                    q.options[3],
                    q.correct,
                    q.category || 'general',
                    q.explanation || null,
                    q.reference || null,
                    q.difficulty || 'medium',
                    q.hint || null,
                    wrongExplanations
                );
                updateExtras.run(
                    q.hint || null,
                    wrongExplanations,
                    q.explanation || null,
                    q.reference || null,
                    q.difficulty || 'medium',
                    q.id
                );
            }
        });

        insertMany(questions);
        console.log(`Loaded ${questions.length} default questions with categories and explanations`);
    }
}

// Initialize sample case studies
function initCases() {
    const cases = [
        {
            id: 'case_001',
            title: 'Отказ от услуг',
            description: 'Пожилая женщина отказывается от социального обслуживания',
            scenario: 'К вам обратилась дочь 78-летней пациентки. Женщина живёт одна, имеет ограничения по здоровью, но категорически отказывается от помощи социальных служб, говоря, что "не хочет быть обузой". Дочь обеспокоена состоянием матери.',
            category: 'ethical',
            difficulty: 'medium'
        },
        {
            id: 'case_002',
            title: 'Конфликт соседей',
            description: 'Жалоба на нарушение правил проживания в стационаре',
            scenario: 'Постоянный жилой стационар для пожилых. Один из подопечных систематически нарушает тишину ночью, включает громкую музыку. Соседи жалуются и угрожают подать заявление.',
            category: 'conflict',
            difficulty: 'easy'
        },
        {
            id: 'case_003',
            title: 'Падение в стационаре',
            description: 'Подопечный упал ночью в коридоре',
            scenario: 'Ночью дежурный персонал обнаружил 82-летнего подопечного, лежащего на полу в коридоре. Мужчина в сознании, жалуется на боль в бедре. Рядом никого из родственников нет.',
            category: 'emergency',
            difficulty: 'hard'
        },
        {
            id: 'case_004',
            title: 'Конфликт родственников',
            description: 'Родственники спорят о форме обслуживания пожилого человека',
            scenario: 'Двое взрослых детей пожилой женщины с деменцией спорят: дочь настаивает на стационаре, сын — на обслуживании на дому. Женщина растеряна, отказывается выбирать. Семья требует, чтобы соцработник «решил за всех».',
            category: 'conflict',
            difficulty: 'hard'
        },
        {
            id: 'case_005',
            title: 'ЧС и эвакуация',
            description: 'Задымление в корпусе стационара',
            scenario: 'В жилом корпусе стационара сработало пожарное оповещение: запах дыма на 2 этаже. Среди подопечных есть маломобильные. Часть персонала на обеде. Родственники в холле начинают паниковать и снимать видео.',
            category: 'emergency',
            difficulty: 'hard'
        },
        {
            id: 'case_006',
            title: 'Жалоба на качество услуг',
            description: 'Письменная жалоба на грубость и срыв графика',
            scenario: 'В организацию поступила письменная жалоба от дочери получателя услуг на дому: «сотрудник грубит, опаздывает, услуги оказываются не в полном объёме». Сотрудник отрицает претензии. Получатель услуг говорит, что «не хочет никого подводить».',
            category: 'quality',
            difficulty: 'medium'
        }
    ];

    const insertCase = db.prepare(`
        INSERT OR IGNORE INTO cases (id, title, description, scenario, category, difficulty)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    cases.forEach(c => {
        insertCase.run(c.id, c.title, c.description, c.scenario, c.category, c.difficulty);
    });

    // Add 4 steps for each case; branching cases include branches JSON
    const caseSteps = [
        // case_001 — Отказ от услуг
        { case_id: 'case_001', step_number: 1, question: 'Какое первое действие должен предпринять соцработник?', options: 'Настаивать на обслуживании|Провести беседу и выяснить причины отказа|Оформить отказ и закрыть дело|Вызвать полицию', correct_answer: 1, explanation: 'Согласно ФЗ-442, социальное обслуживание предоставляется на добровольной основе. Необходимо выяснить причины отказа и информировать о возможных услугах.' },
        { case_id: 'case_001', step_number: 2, question: 'Какой аргумент может помочь убедить пациентку?', options: 'Вы создадите проблемы для дочери|Услуги бесплатны и могут улучшить качество жизни|Это обязательно по закону|Все так делают', correct_answer: 1, explanation: 'Акцент на пользе для самой пациентки и безвозмездности услуг — эффективная стратегия.' },
        { case_id: 'case_001', step_number: 3, question: 'Что важно зафиксировать при оформлении отказа?', options: 'Только дату отказа|Причины отказа и разъяснённые последствия|Телефон дочери|ФИО врача', correct_answer: 1, explanation: 'Отказ должен быть осознанным: необходимо зафиксировать причины и разъяснённые последствия.' },
        { case_id: 'case_001', step_number: 4, question: 'Как часто следует пересматривать ситуацию с отказом?', options: 'Один раз в год|Только по просьбе родственников|Периодически, при изменении состояния|Никогда, отказ окончателен', correct_answer: 2, explanation: 'Состояние получателя может измениться, поэтому ситуацию пересматривают при изменении обстоятельств.' },

        // case_002 — Конфликт соседей
        { case_id: 'case_002', step_number: 1, question: 'Что следует сделать в первую очередь?', options: 'Переселить нарушителя в другую комнату|Провести индивидуальную беседу с нарушителем|Организовать общее собрание соседей|Проигнорировать жалобы', correct_answer: 1, explanation: 'Сначала важно выяснить причины нарушения и попытаться решить проблему индивидуально.' },
        { case_id: 'case_002', step_number: 2, question: 'Какой подход лучше при беседе с подопечным?', options: 'Обвинить в нарушении режима|Выявить потребности и причины беспокойства|Угрожать выселением|Предложить успокоительное', correct_answer: 1, explanation: 'Часто нарушение тишины связано с беспокойством, болью или дезориентацией. Важно понять причину.' },
        { case_id: 'case_002', step_number: 3, question: 'Что делать, если беседа не помогает?', options: 'Оставить всё как есть|Разработать индивидуальный план поддержки и привлечь специалистов|Сразу писать заявление в полицию|Отключить электричество в комнате', correct_answer: 1, explanation: 'Необходим комплексный подход: план поддержки, консультация психолога/врача, возможно изменение режима.' },
        { case_id: 'case_002', step_number: 4, question: 'Как информировать соседей о принятых мерах?', options: 'Не информировать|Сообщить, что меры приняты, сохраняя конфиденциальность|Раскрыть медицинский диагноз нарушителя|Переселить всех соседей', correct_answer: 1, explanation: 'Соседей уведомляют о мерах, но соблюдают медицинскую тайну и достоинство подопечного.' },

        // case_003 — Падение в стационаре
        { case_id: 'case_003', step_number: 1, question: 'Первое действие при обнаружении падения?', options: 'Поднять подопечного самостоятельно|Вызвать медицинскую сестру/врача и оценить состояние|Отвести в постель без осмотра|Позвонить родственникам и ждать их', correct_answer: 1, explanation: 'При падении пожилого человека важно сначала оценить состояние и исключить перелом, особенно шейки бедра.' },
        { case_id: 'case_003', step_number: 2, question: 'Можно ли перемещать пострадавшего до прибытия врача?', options: 'Да, если он просит|Нет, если есть подозрение на перелом или потерю сознания|Да, перенести в постель удобнее|Только если он сам встаёт', correct_answer: 1, explanation: 'При подозрении на травму перемещение может усугубить повреждение. Ждём медицинского работника.' },
        { case_id: 'case_003', step_number: 3, question: 'Что зафиксировать в журнале происшествий?', options: 'Только факт падения|Время, обстоятельства, состояние, принятые меры, уведомления|ФИО врача|Ничего, если пострадавший отказался', correct_answer: 1, explanation: 'Инцидент фиксируется подробно: время, обстоятельства, состояние, меры, уведомления.' },
        { case_id: 'case_003', step_number: 4, question: 'Кого необходимо уведомить после стабилизации пострадавшего?', options: 'Только руководителя|Руководителя, родственников, при необходимости надзорные органы|Только соседей по отделению|Никого, если пострадавший против', correct_answer: 1, explanation: 'После падения уведомляются руководство, родственники и, при необходимости, надзорные органы.' },

        // case_004 — Конфликт родственников (branching)
        { case_id: 'case_004', step_number: 1, question: 'С чего начать работу с семьёй?', options: 'Сразу выбрать стационар за семью|Выяснить позицию самой получательницы услуг и её законные интересы|Встать на сторону дочери|Отказать в консультации', correct_answer: 1, explanation: 'Центр — воля и интересы получателя услуг, а не удобство родственников.', branches: { '0': 2, '1': 2, '2': 2, '3': 2 } },
        { case_id: 'case_004', step_number: 2, question: 'Как реагировать на давление «решите за нас»?', options: 'Принять решение единолично|Разъяснить добровольность и предложить медиацию/совместное обсуждение вариантов|Игнорировать сына|Угрожать судом', correct_answer: 1, explanation: 'Соцработник информирует и фасилитирует выбор, не подменяет волю получателя.', branches: { '0': 3, '1': 3, '2': 3, '3': 3 } },
        { case_id: 'case_004', step_number: 3, question: 'Что зафиксировать по итогам встречи?', options: 'Только жалобы родственников|Позиции сторон, разъяснения, согласие/несогласие получателя|Мнение только дочери|Ничего не фиксировать', correct_answer: 1, explanation: 'Документирование защищает права получателя и прозрачность решения.', branches: { '0': 4, '1': 4, '2': 4, '3': 4 } },
        { case_id: 'case_004', step_number: 4, question: 'Если получательница не может выразить волю?', options: 'Слушать только самого громкого родственника|Опираться на законного представителя и оценку нуждаемости|Немедленно выселить|Закрыть дело', correct_answer: 1, explanation: 'При ограниченной дееспособности действуют законный представитель и процедуры оценки нуждаемости.', branches: { '0': null, '1': null, '2': null, '3': null } },

        // case_005 — ЧС/эвакуация (branching)
        { case_id: 'case_005', step_number: 1, question: 'Первое действие персонала при оповещении?', options: 'Снимать видео для отчёта|Задействовать план эвакуации и вызвать пожарных|Ждать окончания обеда|Вывести только родственников', correct_answer: 1, explanation: 'Действуют по плану эвакуации: оповещение служб и защита жизни.', branches: { '0': 2, '1': 2, '2': 2, '3': 2 } },
        { case_id: 'case_005', step_number: 2, question: 'Как эвакуировать маломобильных?', options: 'Оставить на этаже до приезда родных|Использовать назначенные маршруты/средства и помощь персонала|Спустить всех самостоятельно без учёта состояния|Эвакуировать только ходячих', correct_answer: 1, explanation: 'Маломобильных эвакуируют по плану с учётом состояния и маршрутов.', branches: { '0': 3, '1': 3, '2': 3, '3': 3 } },
        { case_id: 'case_005', step_number: 3, question: 'Что сказать родственникам в холле?', options: 'Запретить снимать и начать спор|Кратко информировать о действиях и попросить освободить пути эвакуации|Игнорировать|Обещать, что всё в порядке без фактов', correct_answer: 1, explanation: 'Краткая информация снижает панику и не мешает эвакуации.', branches: { '0': 4, '1': 4, '2': 4, '3': 4 } },
        { case_id: 'case_005', step_number: 4, question: 'После локализации ЧС что обязательно?', options: 'Удалить записи камер|Провести разбор, зафиксировать инцидент и проверить состояние подопечных|Скрыть факт от руководства|Наказать всех сотрудников', correct_answer: 1, explanation: 'После ЧС — учёт, разбор и контроль состояния получателей услуг.', branches: { '0': null, '1': null, '2': null, '3': null } },

        // case_006 — Жалоба на качество (branching)
        { case_id: 'case_006', step_number: 1, question: 'Как принять жалобу?', options: 'Отклонить, потому что сотрудник отрицает|Зарегистрировать, подтвердить получение и начать проверку|Переслать жалобу сотруднику без регистрации|Потребовать отозвать жалобу', correct_answer: 1, explanation: 'Жалобы регистрируются и рассматриваются по процедуре контроля качества.', branches: { '0': 2, '1': 2, '2': 2, '3': 2 } },
        { case_id: 'case_006', step_number: 2, question: 'Как собрать факты?', options: 'Опросить только сотрудника|Сопоставить журнал услуг, опрос получателя и родственника, при необходимости контрольный визит|Сразу уволить сотрудника|Игнорировать слова получателя', correct_answer: 1, explanation: 'Объективность: документы + стороны + при необходимости проверка на месте.', branches: { '0': 3, '1': 3, '2': 3, '3': 3 } },
        { case_id: 'case_006', step_number: 3, question: 'Если получатель «не хочет никого подводить»?', options: 'Закрыть жалобу|Объяснить право на обратную связь и гарантировать защиту от давления|Давить на отзыв жалобы|Публично обсудить жалобу в коллективе', correct_answer: 1, explanation: 'Защита от давления — часть этики и качества услуг.', branches: { '0': 4, '1': 4, '2': 4, '3': 4 } },
        { case_id: 'case_006', step_number: 4, question: 'Итог рассмотрения жалобы?', options: 'Ничего не менять|Дать письменный ответ, при подтверждении — меры и корректировка плана услуг|Оштрафовать получателя|Удалить жалобу из архива', correct_answer: 1, explanation: 'Ответ заявителю и корректирующие действия обязательны при подтверждённых нарушениях.', branches: { '0': null, '1': null, '2': null, '3': null } }
    ];

    const insertStep = db.prepare(`
        INSERT OR IGNORE INTO case_steps (case_id, step_number, question, options, correct_answer, explanation, branches)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const updateBranches = db.prepare(`
        UPDATE case_steps SET branches = ? WHERE case_id = ? AND step_number = ?
    `);

    caseSteps.forEach(s => {
        const options = s.options.split('|');
        const branchesJson = s.branches ? JSON.stringify(s.branches) : null;
        insertStep.run(s.case_id, s.step_number, s.question, JSON.stringify(options), s.correct_answer, s.explanation, branchesJson);
        if (branchesJson) {
            updateBranches.run(branchesJson, s.case_id, s.step_number);
        }
    });
}

// Initialize on startup
initAchievements();
loadDefaultQuestions();
initCases();

module.exports = { db, PREPOST_QUESTION_IDS };
