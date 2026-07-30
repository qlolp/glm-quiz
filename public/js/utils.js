// Shared frontend utilities
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function classifyLoadError(apiError, fallbackError, httpStatus) {
    if (!navigator.onLine) {
        return 'Нет подключения к интернету. Проверьте Wi‑Fi и попробуйте снова.';
    }
    if (httpStatus === 429) {
        return 'Слишком много запросов. Подождите минуту и нажмите «Попробовать снова».';
    }
    if (httpStatus === 503) {
        return 'Сервер временно недоступен. Подождите несколько секунд и попробуйте снова.';
    }
    const msg = [apiError?.message, fallbackError?.message].filter(Boolean).join(' ');
    if (/Failed to fetch|NetworkError|ERR_SSL|SSL_PROTOCOL/i.test(msg)) {
        return 'Не удалось связаться с сервером. Обновите страницу (Ctrl+Shift+R / Cmd+Shift+R).';
    }
    if (httpStatus && httpStatus >= 500) {
        return 'Ошибка сервера. Попробуйте через минуту или обратитесь к организатору.';
    }
    return 'Не удалось загрузить вопросы. Обновите страницу или попробуйте позже.';
}
