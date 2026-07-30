const PREFIX = 'glm.v2.';

export const keys = {
    session: `${PREFIX}session`,
    profile: `${PREFIX}profile`,
    preferences: `${PREFIX}preferences`,
    progress: `${PREFIX}progress`,
    history: `${PREFIX}history`,
    onboarding: `${PREFIX}onboarding`,
    migration: `${PREFIX}migration`
};

function parse(value, fallback = null) {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

export function read(key, fallback = null) {
    return parse(localStorage.getItem(key), fallback);
}

export function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

export function remove(key) {
    localStorage.removeItem(key);
}

export function migrateLegacyStorage() {
    if (localStorage.getItem(keys.migration)) return;

    const legacyUser = parse(localStorage.getItem('quiz_user'), {});
    const id = localStorage.getItem('userId') || legacyUser.id || null;
    const username = localStorage.getItem('username') || legacyUser.username || null;
    const displayName = localStorage.getItem('userDisplayName')
        || legacyUser.display_name
        || username
        || '';
    const token = localStorage.getItem('userToken');

    if (id || token) {
        write(keys.session, { userId: id, username, token });
    }
    if (displayName) {
        write(keys.profile, { displayName });
    }

    const preferences = {};
    const sound = localStorage.getItem('glm_quiz_sound');
    const speechRate = localStorage.getItem('glm_quiz_tts_rate');
    const speechPitch = localStorage.getItem('glm_quiz_tts_pitch');
    if (sound !== null) preferences.sound = sound === 'true';
    if (speechRate !== null) preferences.speechRate = Number(speechRate);
    if (speechPitch !== null) preferences.speechPitch = Number(speechPitch);
    if (Object.keys(preferences).length) write(keys.preferences, preferences);

    const progress = parse(localStorage.getItem('glm_quiz_progress'));
    const history = parse(localStorage.getItem('glm_quiz_history'));
    if (progress) write(keys.progress, { ...progress, migratedFrom: 'glm_quiz_progress' });
    if (history) write(keys.history, history);

    write(keys.migration, {
        version: 1,
        migratedAt: new Date().toISOString()
    });
}

export function getSession() {
    return read(keys.session, {});
}

export function setSession(user, token) {
    write(keys.session, {
        userId: user.id,
        username: user.username,
        displayName: user.display_name,
        token
    });
}

export function clearSession() {
    remove(keys.session);
}

export function getProfile() {
    return read(keys.profile, {});
}

export function setProfile(profile) {
    write(keys.profile, profile);
}

export function saveQuizProgress(progress) {
    write(keys.progress, {
        ...progress,
        savedAt: new Date().toISOString()
    });
}

export function clearQuizProgress() {
    remove(keys.progress);
}

export function addHistory(entry) {
    const history = read(keys.history, []);
    write(keys.history, [entry, ...history].slice(0, 30));
}

export function getPreferences() {
    return read(keys.preferences, {
        sound: true,
        tts: false,
        speechRate: 1,
        confidencePrompt: true
    });
}

export function setPreferences(preferences) {
    write(keys.preferences, { ...getPreferences(), ...preferences });
}
