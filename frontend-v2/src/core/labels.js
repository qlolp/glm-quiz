export const categoryLabels = {
    ethics: 'Профессиональная этика',
    rights: 'Права получателей',
    care_standards: 'Стандарты ухода',
    safety: 'Безопасность',
    emergency: 'Экстренные ситуации',
    communication: 'Коммуникация',
    documentation: 'Документооборот',
    quality: 'Оценка качества',
    mobility: 'Мобильность',
    accessibility: 'Доступность',
    forms_of_service: 'Формы обслуживания',
    service_types: 'Виды услуг',
    mission: 'Миссия',
    spb_specific: 'Специфика СПб',
    general: 'Общие знания'
};

export const difficultyLabels = {
    easy: 'Легкий',
    medium: 'Средний',
    hard: 'Сложный'
};

export function labelCategory(key) {
    return categoryLabels[key] || key || 'Общие знания';
}
