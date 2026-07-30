import { ensureGuestSession, getUserCertificates, saveActionPlan } from '../core/api.js';
import { getProfile, getPreferences, getSession, keys, read, setPreferences, setProfile } from '../core/storage.js';
import { state } from '../core/state.js';
import { icon } from '../ui/icons.js';
import { callout, escapeHtml, pageHead, sectionHead } from '../ui/shell.js';

export async function loadProfileExtras() {
    const session = getSession();
    if (!session.userId || !session.token) {
        state.profileExtras.certificates = [];
        return;
    }
    try {
        const data = await getUserCertificates(session.userId);
        state.profileExtras.certificates = data.certificates || data || [];
    } catch {
        state.profileExtras.certificates = [];
    }
}

function statsBlock(history) {
    if (!history.length) return '';
    const avg = Math.round(history.reduce((sum, item) => sum + (item.percentage || 0), 0) / history.length);
    const best = Math.max(...history.map((item) => item.percentage || 0));
    return `
        <div class="stat-grid">
            <div class="stat">
                <span class="stat-value">${history.length}</span>
                <span class="stat-label">проверок</span>
            </div>
            <div class="stat">
                <span class="stat-value">${avg}%</span>
                <span class="stat-label">в среднем</span>
            </div>
            <div class="stat">
                <span class="stat-value">${best}%</span>
                <span class="stat-label">лучший</span>
            </div>
        </div>
    `;
}

function historyBlock(history) {
    if (!history.length) return '';
    return `
        <div class="section">
            ${sectionHead('Последние результаты')}
            <div class="record-list">
                ${history.slice(0, 5).map((item) => `
                    <div class="record">
                        <span class="record-score">${item.score}/${item.total}</span>
                        <span class="badge ${item.percentage >= 70 ? 'ok' : ''}">${item.percentage}%</span>
                        <span class="meta">${new Date(item.completedAt).toLocaleDateString('ru-RU')}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

export function profileView() {
    const profile = getProfile();
    const prefs = getPreferences();
    const history = read(keys.history, []);
    const session = getSession();
    const certificates = state.profileExtras.certificates || [];

    return `
        <section>
            ${pageHead(
                'Профиль',
                profile.displayName || 'Участник',
                history.length
                    ? 'Ваш прогресс в новом интерфейсе и настройки прохождения.'
                    : 'Пройдите первую проверку — регистрация не обязательна.'
            )}

            ${statsBlock(history)}
            ${historyBlock(history)}

            <div class="section">
                ${sectionHead('Настройки прохождения')}
                <form class="stack" data-form="profile-settings">
                    <div class="field">
                        <label for="profile-name">Как к вам обращаться</label>
                        <input id="profile-name" name="displayName" maxlength="60"
                               autocomplete="name" value="${escapeHtml(profile.displayName || '')}">
                    </div>
                    <label class="check-row">
                        <input type="checkbox" name="tts" ${prefs.tts ? 'checked' : ''}>
                        <span>Озвучивать вопросы, если браузер поддерживает синтез речи</span>
                    </label>
                    <label class="check-row">
                        <input type="checkbox" name="confidencePrompt" ${prefs.confidencePrompt !== false ? 'checked' : ''}>
                        <span>Спрашивать уверенность перед проверкой ответа</span>
                    </label>
                    <label class="check-row">
                        <input type="checkbox" name="sound" ${prefs.sound !== false ? 'checked' : ''}>
                        <span>Звуковые подсказки о правильности ответа</span>
                    </label>
                    <button class="button" type="submit">${icon('settings')}Сохранить настройки</button>
                </form>
            </div>

            <div class="section">
                ${sectionHead('План действия', 'Коротко зафиксируйте, что примените на работе после обучения.')}
                <form class="stack" data-form="action-plan">
                    <div class="field">
                        <label for="action-plan-text">Мой следующий шаг</label>
                        <textarea id="action-plan-text" name="text" rows="3" maxlength="2000"
                                  placeholder="Например: проверить порядок передачи смены"></textarea>
                    </div>
                    <button class="button secondary" type="submit">${icon('note')}Сохранить план</button>
                    ${state.profileExtras.actionPlanSaved
                        ? callout('План сохранён.', { tone: 'ok', iconName: 'check' })
                        : ''}
                </form>
            </div>

            <div class="section">
                ${sectionHead('Сертификаты и аккаунт')}
                <div class="link-list">
                    <a href="/my-certificates.html">
                        ${icon('certificate')}<span>Мои сертификаты${certificates.length ? ` (${certificates.length})` : ''}</span>
                        <span class="link-arrow">${icon('external')}</span>
                    </a>
                    <a href="/register.html">
                        ${icon('key')}<span>Регистрация для сертификата</span>
                        <span class="link-arrow">${icon('external')}</span>
                    </a>
                    <a href="/status.html">
                        ${icon('activity')}<span>Статус сервиса</span>
                        <span class="link-arrow">${icon('external')}</span>
                    </a>
                    <a href="/guide/user">
                        ${icon('note')}<span>Инструкция участника</span>
                        <span class="link-arrow">${icon('external')}</span>
                    </a>
                    <a href="/v2/host" data-route="/host">
                        ${icon('presentation')}<span>Кабинет спикера</span>
                        <span class="link-arrow">${icon('arrowRight')}</span>
                    </a>
                </div>
                <p class="meta" style="margin-top: var(--sp-4)">
                    Сессия: ${session.userId ? 'активна' : 'ещё не создана'}.
                </p>
            </div>
        </section>
    `;
}

export function saveProfileSettings(formData) {
    const displayName = String(formData.get('displayName') || '').trim();
    setProfile({ ...getProfile(), displayName });
    setPreferences({
        tts: formData.get('tts') === 'on',
        confidencePrompt: formData.get('confidencePrompt') === 'on',
        sound: formData.get('sound') === 'on'
    });
    if (displayName) {
        ensureGuestSession(displayName).catch(() => {});
    }
}

export async function submitActionPlan(text) {
    const profile = getProfile();
    await ensureGuestSession(profile.displayName || '');
    await saveActionPlan(text);
    state.profileExtras.actionPlanSaved = true;
}
