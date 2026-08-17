function register(context) {
    with (context) {
app.get('/ai-generator.html', (req, res) => {
    res.status(404).send('AI generator removed');
});

/**
 * GET /guide/:doc
 * Serve USER_GUIDE.md or SPEAKER_GUIDE.md as HTML
 */
const CALLOUT_ICONS = {
    tip: '💡',
    warning: '⚠️',
    important: '🔔',
    info: 'ℹ️',
    success: '✅',
    danger: '🚨',
    note: '📝'
};

const CALLOUT_COLORS = {
    tip: { border: '#22c55e', bg: 'rgba(34,197,94,0.08)', icon: '#22c55e' },
    warning: { border: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: '#f59e0b' },
    important: { border: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', icon: '#8b5cf6' },
    info: { border: '#3b82f6', bg: 'rgba(59,130,246,0.08)', icon: '#3b82f6' },
    success: { border: '#10b981', bg: 'rgba(16,185,129,0.08)', icon: '#10b981' },
    danger: { border: '#ef4444', bg: 'rgba(239,68,68,0.08)', icon: '#ef4444' },
    note: { border: '#6366f1', bg: 'rgba(99,102,241,0.08)', icon: '#6366f1' }
};

function parseInline(text) {
    return escapeHtml(text)
        // Unescape markdown escape sequences for formatting characters
        .replace(/\\([`*~[\]\\])/g, '$1')
        // Inline code
        .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Strikethrough
        .replace(/~~(.*?)~~/g, '<del>$1</del>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => {
            const safeUrl = escapeHtml(u).replace(/ /g, '%20');
            const isExternal = /^https?:\/\//.test(u);
            const attrs = isExternal ? ' target="_blank" rel="noopener"' : '';
            return `<a href="${safeUrl}"${attrs}>${t}</a>`;
        });
}

function markdownToHtml(markdown) {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Empty lines
        if (!line.trim()) {
            blocks.push({ type: 'empty' });
            continue;
        }

        // Fenced container :::class ... :::
        const fenceMatch = line.match(/^:::\s*(\w+)\s*$/);
        if (fenceMatch) {
            const cls = fenceMatch[1];
            let content = [];
            i++;
            while (i < lines.length && !/^:::\s*$/.test(lines[i])) {
                content.push(lines[i]);
                i++;
            }
            blocks.push({ type: 'container', cls, content: content.join('\n') });
            continue;
        }

        // Code block
        if (line.startsWith('```')) {
            const lang = line.slice(3).trim();
            let code = [];
            i++;
            while (i < lines.length && !lines[i].startsWith('```')) {
                code.push(lines[i]);
                i++;
            }
            blocks.push({ type: 'code', lang, content: code.join('\n') });
            continue;
        }

        // Callout block: > [!TYPE] Title
        const calloutMatch = line.match(/^>\s*\[!\s*(\w+)\s*\]\s*(.*)$/);
        if (calloutMatch) {
            const rawType = calloutMatch[1].toLowerCase();
            const type = CALLOUT_COLORS[rawType] ? rawType : 'info';
            let title = calloutMatch[2].trim();
            let body = [];
            i++;
            while (i < lines.length) {
                if (lines[i].startsWith('>')) {
                    body.push(lines[i].slice(1).trim());
                    i++;
                } else if (lines[i].trim() === '' && i + 1 < lines.length && lines[i + 1].startsWith('>')) {
                    body.push('');
                    i++;
                } else {
                    break;
                }
            }
            i--;
            blocks.push({ type: 'callout', variant: type, title, body: body.join('\n') });
            continue;
        }

        // Blockquote
        if (line.startsWith('>')) {
            let body = [line.slice(1).trim()];
            i++;
            while (i < lines.length && lines[i].startsWith('>')) {
                body.push(lines[i].slice(1).trim());
                i++;
            }
            i--;
            blocks.push({ type: 'blockquote', body: body.join('\n') });
            continue;
        }

        // Horizontal rule
        if (/^(---|___|\*\*\*)$/.test(line.trim())) {
            blocks.push({ type: 'hr' });
            continue;
        }

        // Headers
        const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (hMatch) {
            const level = hMatch[1].length;
            blocks.push({ type: 'h', level, content: hMatch[2].trim() });
            continue;
        }

        // Table row
        if (line.includes('|')) {
            let rows = [line];
            i++;
            while (i < lines.length && lines[i].includes('|')) {
                rows.push(lines[i]);
                i++;
            }
            i--;
            // Filter out separator rows
            const nonSep = rows.filter(r => !/^\s*\|[-\s:|]+\|\s*$/.test(r));
            if (nonSep.length > 0) {
                blocks.push({ type: 'table', rows: nonSep });
            }
            continue;
        }

        // Ordered list
        const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (olMatch) {
            let items = [{ indent: olMatch[1].length, num: parseInt(olMatch[2]), content: olMatch[3] }];
            i++;
            while (i < lines.length) {
                const m = lines[i].match(/^(\s*)(\d+)\.\s+(.*)$/);
                if (m) {
                    items.push({ indent: m[1].length, num: parseInt(m[2]), content: m[3] });
                    i++;
                } else if (lines[i].trim() === '') {
                    break;
                } else {
                    break;
                }
            }
            i--;
            blocks.push({ type: 'ol', items });
            continue;
        }

        // Unordered list
        const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
        if (ulMatch) {
            let items = [{ indent: ulMatch[1].length, content: ulMatch[2] }];
            i++;
            while (i < lines.length) {
                const m = lines[i].match(/^(\s*)[-*+]\s+(.*)$/);
                if (m) {
                    items.push({ indent: m[1].length, content: m[2] });
                    i++;
                } else if (lines[i].trim() === '') {
                    break;
                } else {
                    break;
                }
            }
            i--;
            blocks.push({ type: 'ul', items });
            continue;
        }

        // Paragraph
        blocks.push({ type: 'p', content: line });
    }

    // Merge consecutive paragraphs
    const merged = [];
    for (const b of blocks) {
        if (b.type === 'p' && merged.length && merged[merged.length - 1].type === 'p') {
            merged[merged.length - 1].content += '\n' + b.content;
        } else {
            merged.push(b);
        }
    }

    return merged.map(b => renderBlock(b)).join('\n');
}

function renderBlock(b) {
    switch (b.type) {
        case 'empty': return '';
        case 'code':
            return `<pre class="code-block"><code>${escapeHtml(b.content)}</code></pre>`;
        case 'callout': {
            const c = CALLOUT_COLORS[b.variant] || CALLOUT_COLORS.info;
            const icon = CALLOUT_ICONS[b.variant] || CALLOUT_ICONS.info;
            const titleHtml = b.title ? `<div class="callout-title" style="color:${c.icon}">${icon} ${parseInline(b.title)}</div>` : '';
            const bodyHtml = b.body ? `<div class="callout-body">${parseInline(b.body).replace(/\n/g, '<br>')}</div>` : '';
            return `<div class="callout" style="border-left-color:${c.border};background:${c.bg}">${titleHtml}${bodyHtml}</div>`;
        }
        case 'blockquote':
            return `<blockquote>${parseInline(b.body).replace(/\n/g, '<br>')}</blockquote>`;
        case 'hr':
            return '<hr>';
        case 'h':
            return `<h${b.level}>${parseInline(b.content)}</h${b.level}>`;
        case 'table': {
            let headerRows = [];
            let bodyRows = [];
            let sepIndex = b.rows.findIndex(r => /^\s*\|[-\s:|]+\|\s*$/.test(r));
            if (sepIndex !== -1) {
                headerRows = b.rows.slice(0, sepIndex);
                bodyRows = b.rows.slice(sepIndex + 1);
            } else {
                headerRows = b.rows.slice(0, 1);
                bodyRows = b.rows.slice(1);
            }
            const renderRow = (r, tag) => {
                const cells = r.split('|').map(c => c.trim()).filter(c => c);
                return `<tr>${cells.map(c => `<${tag}>${parseInline(c)}</${tag}>`).join('')}</tr>`;
            };
            const thead = headerRows.length ? `<thead>${headerRows.map(r => renderRow(r, 'th')).join('')}</thead>` : '';
            const tbody = bodyRows.length ? `<tbody>${bodyRows.map(r => renderRow(r, 'td')).join('')}</tbody>` : '';
            return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`;
        }
        case 'container': {
            if (b.cls === 'hero') {
                return `<div class="hero">${parseInline(b.content).replace(/\n/g, '<br>')}</div>`;
            }
            if (b.cls === 'links') {
                const links = b.content.split('\n').filter(l => l.trim()).map(line => {
                    const m = line.match(/^\*?\s*\[([^\]]+)\]\(([^)]+)\)\s*[-–—]\s*(.*)$/);
                    if (m) return `<a href="${escapeHtml(m[2]).replace(/ /g, '%20')}"><strong>${parseInline(m[1])}</strong><small>${parseInline(m[3])}</small></a>`;
                    const m2 = line.match(/^\*?\s*\[([^\]]+)\]\(([^)]+)\)$/);
                    if (m2) return `<a href="${escapeHtml(m2[2]).replace(/ /g, '%20')}"><strong>${parseInline(m2[1])}</strong></a>`;
                    return `<p>${parseInline(line)}</p>`;
                }).join('');
                return `<div class="quick-links">${links}</div>`;
            }
            return `<div class="${escapeHtml(b.cls)}">${parseInline(b.content).replace(/\n/g, '<br>')}</div>`;
        }
        case 'ol':
            return `<ol class="steps">${b.items.map(it => `<li><span class="step-num">${it.num}</span><span class="step-text">${parseInline(it.content)}</span></li>`).join('')}</ol>`;
        case 'ul':
            return `<ul class="dash-list">${b.items.map(it => `<li>${parseInline(it.content)}</li>`).join('')}</ul>`;
        case 'p':
            return `<p>${parseInline(b.content).replace(/\n/g, '<br>')}</p>`;
        default:
            return '';
    }
}

function renderSpeakerGuideLogin(errorMessage = '') {
    const err = errorMessage
        ? `<p class="guide-login-error">${escapeHtml(errorMessage)}</p>`
        : '';
    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Вход — инструкция организатора</title>
    <link rel="stylesheet" href="/css/modern-theme.css">
    <link rel="stylesheet" href="/css/guide.css">
</head>
<body class="guide-page">
    <div class="guide-shell">
        <header class="guide-header">
            <a href="/" class="guide-back">← На главную</a>
        </header>
        <main class="guide-content guide-login-card">
            <h1>🎤 Инструкция организатора</h1>
            <p>Раздел только для спикеров и технических администраторов семинара.</p>
            <p style="font-size:14px;color:var(--muted);">Тот же пароль, что для <a href="/admin.html">админ-панели</a>.</p>
            ${err}
            <form id="speaker-login-form" class="guide-login-form">
                <label class="guide-login-label" for="password">Пароль администратора</label>
                <input class="form-input" type="password" id="password" name="password" autocomplete="current-password" required>
                <button type="submit" class="btn btn-primary" style="width:100%;margin-top:16px;">Войти</button>
            </form>
            <p style="margin-top:20px;font-size:14px;color:var(--muted);">Участникам: <a href="/guide/user">инструкция пользователя</a></p>
        </main>
    </div>
    <script>
        document.getElementById('speaker-login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('password').value;
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Вход…';
            try {
                const auth = await fetch('/api/auth/admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await auth.json();
                if (!auth.ok || !data.valid || !data.token) {
                    window.location.href = '/guide/speaker?error=1';
                    return;
                }
                const session = await fetch('/guide/speaker/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ token: data.token })
                });
                if (!session.ok) {
                    window.location.href = '/guide/speaker?error=1';
                    return;
                }
                localStorage.setItem('adminToken', data.token);
                window.location.href = '/guide/speaker';
            } catch (err) {
                window.location.href = '/guide/speaker?error=1';
            }
        });
        if (new URLSearchParams(location.search).get('error') === '1') {
            const box = document.createElement('p');
            box.className = 'guide-login-error';
            box.textContent = 'Неверный пароль';
            document.getElementById('speaker-login-form').before(box);
        }
        (async function autoFromAdmin() {
            const token = localStorage.getItem('adminToken');
            if (!token) return;
            try {
                const r = await fetch('/guide/speaker/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ token })
                });
                if (r.ok) window.location.replace('/guide/speaker');
            } catch (e) {}
        })();
    </script>
</body>
</html>`;
}

function serveGuide(docName, fileName, title) {
    return async (req, res) => {
        try {
            const cacheKey = `guide:v3:${fileName}`;
            let html = getCache(cacheKey);
            if (html) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(html);
            }

            const filePath = path.join(__dirname, '../..', fileName);
            const markdown = await fs.promises.readFile(filePath, 'utf8');
            const body = markdownToHtml(markdown);
            const footerExtras = docName === 'speaker'
                ? `<form method="POST" action="/guide/speaker/logout" class="guide-logout"><button type="submit" class="guide-back">Выйти из раздела организатора</button></form>`
                : '';
            html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/css/modern-theme.css">
    <link rel="stylesheet" href="/css/guide.css">
</head>
<body class="guide-page">
    <div class="guide-shell">
        <header class="guide-header">
            <a href="/" class="guide-back">← На главную</a>
        </header>
        <main class="guide-content">
            ${body}
            ${footerExtras}
        </main>
    </div>
</body>
</html>`;
            setCache(cacheKey, html);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).send('Guide not found');
            }
            console.error(`Error serving guide ${docName}:`, error);
            res.status(500).send('Failed to load guide');
        }
    };
}

app.get('/guide/user', serveGuide('user', 'USER_GUIDE.md', 'Инструкция пользователя'));

app.post('/guide/speaker/session', certRateLimitMiddleware, (req, res) => {
    const { token } = req.body || {};
    if (!verifyAdminToken(token)) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    res.setHeader('Set-Cookie', adminGuideCookie(token));
    res.json({ success: true });
});

app.post('/guide/speaker/login', certRateLimitMiddleware, (req, res) => {
    const password = req.body?.password;
    if (!verifyAdminPassword(password)) {
        res.status(401);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(renderSpeakerGuideLogin('Неверный пароль'));
    }
    const token = generateAdminToken();
    res.setHeader('Set-Cookie', adminGuideCookie(token));
    res.redirect(302, '/guide/speaker');
});

app.get('/guide/speaker', async (req, res) => {
    if (!getAdminTokenFromRequest(req)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(renderSpeakerGuideLogin());
    }
    return serveGuide('speaker', 'SPEAKER_GUIDE.md', 'Инструкция для спикера')(req, res);
});

app.post('/guide/speaker/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'glm_admin_guide=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.redirect(302, '/guide/speaker');
});

// V2 sunset: redirect all /v2 routes to the main app
app.get(['/v2', '/v2/*'], (req, res) => res.redirect(301, '/'));

app.get('/join', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/join.html'));
});
app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/host.html'));
});
app.get('/speaker', (req, res) => res.redirect(302, '/host'));

// Clean URL redirects for navigation (BUG-05/06: unify URL scheme)
app.get('/instruction', (req, res) => res.redirect(302, '/guide/user'));
app.get('/cases', (req, res) => res.redirect(302, '/cases.html'));
app.get('/pulse', (req, res) => res.redirect(302, '/pulse-player.html'));
app.get('/status', (req, res) => res.redirect(302, '/status.html'));

// 301 redirects for old ghost URLs (BUG-06: old .html URLs that returned index.html)
app.get('/pulse.html', (req, res) => res.redirect(301, '/pulse-host.html'));
app.get('/kahoot.html', (req, res) => res.redirect(301, '/realtime-host.html'));
app.get('/live-qa.html', (req, res) => res.redirect(301, '/qa-host.html'));
app.get('/digest.html', (req, res) => res.redirect(301, '/seminar-digest.html'));
app.get('/achievements.html', (req, res) => res.redirect(301, '/gamification.html'));
app.get('/certificates.html', (req, res) => res.redirect(301, '/my-certificates.html'));
app.get('/instruction.html', (req, res) => res.redirect(301, '/guide/user'));

// SPA support for non-API routes; API 404s return JSON
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '../../public/index.html'));
});


        Object.assign(context, { parseInline, markdownToHtml, renderBlock, renderSpeakerGuideLogin, serveGuide });
    }
}

module.exports = register;
