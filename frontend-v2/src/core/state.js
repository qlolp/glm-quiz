export const state = {
    goal: null,
    questions: [],
    index: 0,
    score: 0,
    answers: [],
    pendingAnswer: null,
    feedback: null,
    busy: false,
    lastError: null,
    learn: {
        mode: null,
        stats: null,
        cards: [],
        index: 0,
        feedback: null,
        awaitingQuality: false,
        reviewed: 0,
        correct: 0,
        finished: false
    },
    cases: {
        list: null,
        current: null,
        steps: [],
        stepsByNumber: {},
        stepNumber: 1,
        feedback: null,
        pendingNext: null,
        correctCount: 0,
        answered: 0,
        finished: false
    },
    profileExtras: {
        certificates: null,
        actionPlanSaved: false
    }
};

export function resetQuiz(goal) {
    Object.assign(state, {
        goal,
        questions: [],
        index: 0,
        score: 0,
        answers: [],
        pendingAnswer: null,
        feedback: null,
        busy: false,
        lastError: null
    });
}

export function resetLearn() {
    Object.assign(state.learn, {
        mode: null,
        cards: [],
        index: 0,
        feedback: null,
        awaitingQuality: false,
        reviewed: 0,
        correct: 0,
        finished: false
    });
}

export function resetCasePlay() {
    Object.assign(state.cases, {
        current: null,
        steps: [],
        stepsByNumber: {},
        stepNumber: 1,
        feedback: null,
        pendingNext: null,
        correctCount: 0,
        answered: 0,
        finished: false
    });
}
