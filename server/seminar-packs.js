const fs = require('fs');
const path = require('path');

const SEMINAR_PACK_CATEGORIES = ['nutrition', 'ai_care'];
const PACKS_PATH = path.join(__dirname, '../seminar-packs.json');

let cached = null;

function loadSeminarPackFile() {
    if (cached) return cached;
    cached = JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));
    return cached;
}

function loadSeminarPacks() {
    return loadSeminarPackFile().packs || [];
}

function getPack(packId) {
    if (!packId) return null;
    return loadSeminarPacks().find((pack) => pack.id === String(packId)) || null;
}

function allKahootQuestions() {
    return loadSeminarPacks().flatMap((pack) =>
        (pack.kahoot || []).map((q) => ({ ...q, pack_id: pack.id }))
    );
}

function kahootRowsFromPack(pack) {
    return (pack.kahoot || []).map((q) => ({
        id: q.id,
        question: q.question,
        option_a: q.options[0],
        option_b: q.options[1],
        option_c: q.options[2],
        option_d: q.options[3],
        correct_answer: q.correct,
        category: q.category || pack.id
    }));
}

function publicPackSummary(pack) {
    return {
        id: pack.id,
        title: pack.title,
        subtitle: pack.subtitle || '',
        talk: pack.talk || '',
        kahoot_count: Array.isArray(pack.kahoot) ? pack.kahoot.length : 0,
        pulse: (pack.pulse || []).map((item) => ({
            id: item.id,
            kind: item.kind === 'scale' ? 'scale' : 'mc',
            text: item.text,
            options: item.options || undefined,
            scale_min: item.scale_min,
            scale_max: item.scale_max,
            label_min: item.label_min,
            label_max: item.label_max
        }))
    };
}

function seminarCategoryFilter(column = 'category') {
    const placeholders = SEMINAR_PACK_CATEGORIES.map(() => '?').join(',');
    return {
        sql: `${column} NOT IN (${placeholders})`,
        params: [...SEMINAR_PACK_CATEGORIES]
    };
}

module.exports = {
    SEMINAR_PACK_CATEGORIES,
    loadSeminarPacks,
    getPack,
    allKahootQuestions,
    kahootRowsFromPack,
    publicPackSummary,
    seminarCategoryFilter
};
