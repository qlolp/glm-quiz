(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))n(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(r){if(r.ep)return;r.ep=!0;const i=s(r);fetch(r.href,i)}})();const x="glm.v2.",d={session:`${x}session`,profile:`${x}profile`,preferences:`${x}preferences`,progress:`${x}progress`,history:`${x}history`,onboarding:`${x}onboarding`,migration:`${x}migration`};function L(e,t=null){if(!e)return t;try{return JSON.parse(e)}catch{return t}}function v(e,t=null){return L(localStorage.getItem(e),t)}function m(e,t){localStorage.setItem(e,JSON.stringify(t))}function K(e){localStorage.removeItem(e)}function ce(){if(localStorage.getItem(d.migration))return;const e=L(localStorage.getItem("quiz_user"),{}),t=localStorage.getItem("userId")||e.id||null,s=localStorage.getItem("username")||e.username||null,n=localStorage.getItem("userDisplayName")||e.display_name||s||"",r=localStorage.getItem("userToken");(t||r)&&m(d.session,{userId:t,username:s,token:r}),n&&m(d.profile,{displayName:n});const i={},l=localStorage.getItem("glm_quiz_sound"),p=localStorage.getItem("glm_quiz_tts_rate"),y=localStorage.getItem("glm_quiz_tts_pitch");l!==null&&(i.sound=l==="true"),p!==null&&(i.speechRate=Number(p)),y!==null&&(i.speechPitch=Number(y)),Object.keys(i).length&&m(d.preferences,i);const P=L(localStorage.getItem("glm_quiz_progress")),S=L(localStorage.getItem("glm_quiz_history"));P&&m(d.progress,{...P,migratedFrom:"glm_quiz_progress"}),S&&m(d.history,S),m(d.migration,{version:1,migratedAt:new Date().toISOString()})}function C(){return v(d.session,{})}function le(e,t){m(d.session,{userId:e.id,username:e.username,displayName:e.display_name,token:t})}function ue(){K(d.session)}function b(){return v(d.profile,{})}function z(e){m(d.profile,e)}function de(e){m(d.progress,{...e,savedAt:new Date().toISOString()})}function pe(){K(d.progress)}function fe(e){const t=v(d.history,[]);m(d.history,[e,...t].slice(0,30))}function T(){return v(d.preferences,{sound:!0,tts:!1,speechRate:1,confidencePrompt:!0})}function he(e){m(d.preferences,{...T(),...e})}class R extends Error{constructor(t,s=0,n="request_failed"){super(t),this.name="ApiError",this.status=s,this.code=n}}async function f(e,t={}){const{auth:s=!1,retryAuth:n=!1,...r}=t,i=new Headers(r.headers||{}),l=C().token;s&&l&&i.set("Authorization",`Bearer ${l}`),r.body&&!i.has("Content-Type")&&i.set("Content-Type","application/json");let p;try{p=await fetch(e,{...r,headers:i,cache:r.cache||"no-store"})}catch{throw new R(navigator.onLine?"Сервер временно недоступен.":"Нет подключения к интернету.",0,navigator.onLine?"network":"offline")}if(s&&(p.status===401||p.status===403)&&(ue(),window.dispatchEvent(new CustomEvent("glm:auth-expired")),n))return await k(),f(e,{...t,retryAuth:!1});const y=await p.json().catch(()=>({}));if(!p.ok)throw new R(y.error||`Ошибка запроса (${p.status})`,p.status,p.status===401||p.status===403?"auth_expired":"api");return y}async function k(e=""){var r,i;const t=C();if(t.token&&t.userId)return t;const s=((i=(r=globalThis.crypto)==null?void 0:r.randomUUID)==null?void 0:i.call(r))||`${Date.now()}_${Math.random().toString(36).slice(2,9)}`,n=await f("/api/users",{method:"POST",body:JSON.stringify({username:`guest_${s}`,display_name:e.trim()||"Участник"})});return le(n.user,n.token),C()}function G(){return f("/api/questions")}function X(e,t){return f("/api/quiz/check-answer",{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({questionId:e,answer:t})})}function me(e,t){return f("/api/quiz/complete",{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({score:e,total_questions:t.length,answers:t.map(({questionId:s,answer:n})=>({questionId:s,answer:n}))})})}function be(){return f("/api/cases")}function ye(e){return f(`/api/cases/${encodeURIComponent(e)}`)}function ge(e,t,s){return f(`/api/cases/${encodeURIComponent(e)}/check-step`,{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({step_number:t,answer:s})})}function we(e,t,s=!0){return f(`/api/cases/${encodeURIComponent(e)}/progress`,{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({score:t,completed:s})})}function $e(e=20){return f(`/api/spaced-repetition/due?limit=${e}`,{auth:!0,retryAuth:!0})}function ve(){return f("/api/spaced-repetition/stats",{auth:!0,retryAuth:!0})}function ke(e,t){return f("/api/spaced-repetition/review",{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({question_id:e,quality:t})})}function Se(e,t=null,s="v2"){return f("/api/action-plans",{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({text:e,score:t,mode:s})})}function xe(e){return f(`/api/certificates/user/${encodeURIComponent(e)}`,{auth:!0,retryAuth:!0})}const E="/v2";function I(){const e=window.location.pathname;return e===E||e===`${E}/`?"/":e.startsWith(`${E}/`)?e.slice(E.length):"/"}function g(e,{replace:t=!1,silent:s=!1}={}){const n=e==="/"?`${E}/`:`${E}${e}`;history[t?"replaceState":"pushState"]({},"",n),s||window.dispatchEvent(new CustomEvent("glm:navigate"))}function qe(e){document.addEventListener("click",t=>{const s=t.target.closest("a[data-route]");!s||t.defaultPrevented||t.button!==0||t.metaKey||t.ctrlKey||t.shiftKey||t.altKey||(t.preventDefault(),g(s.dataset.route))}),window.addEventListener("popstate",e),window.addEventListener("glm:navigate",e)}const a={goal:null,questions:[],index:0,score:0,answers:[],pendingAnswer:null,feedback:null,busy:!1,lastError:null,learn:{mode:null,stats:null,cards:[],index:0,feedback:null,awaitingQuality:!1,reviewed:0,correct:0,finished:!1},cases:{list:null,current:null,steps:[],stepsByNumber:{},stepNumber:1,feedback:null,pendingNext:null,correctCount:0,answered:0,finished:!1},profileExtras:{certificates:null,actionPlanSaved:!1}};function Y(e){Object.assign(a,{goal:e,questions:[],index:0,score:0,answers:[],pendingAnswer:null,feedback:null,busy:!1,lastError:null})}function Ne(){Object.assign(a.learn,{mode:null,cards:[],index:0,feedback:null,awaitingQuality:!1,reviewed:0,correct:0,finished:!1})}function Z(){Object.assign(a.cases,{current:null,steps:[],stepsByNumber:{},stepNumber:1,feedback:null,pendingNext:null,correctCount:0,answered:0,finished:!1})}const Ae={ethics:"Профессиональная этика",rights:"Права получателей",care_standards:"Стандарты ухода",safety:"Безопасность",emergency:"Экстренные ситуации",communication:"Коммуникация",documentation:"Документооборот",quality:"Оценка качества",general:"Общие знания"},Ee={easy:"Легкий",medium:"Средний",hard:"Сложный"};function Q(e){return Ae[e]||e||"Общие знания"}const Ie=[["/","Домой"],["/learn","Учиться"],["/cases","Кейсы"],["/profile","Профиль"]];function o(e=""){return String(e).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function Pe(e){return e.startsWith("/quiz")||e.startsWith("/result")||e.startsWith("/start")||e==="/join"?"/":e.startsWith("/learn")?"/learn":e.startsWith("/cases")||e.startsWith("/case")?"/cases":e==="/me"||e.startsWith("/profile")?"/profile":e.startsWith("/host")?"":e}function j(e,t="/"){const s=Pe(t),n=Ie.map(([r,i])=>`
        <a href="/v2${r==="/"?"/":r}" data-route="${r}"
           ${s===r?'aria-current="page"':""}>${i}</a>
    `).join("");return`
        <div class="app-shell">
            <header class="topbar">
                <a class="brand" href="/v2/" data-route="/">GLM Quiz</a>
                <a class="host-link" href="/v2/host" data-route="/host">Спикерам</a>
            </header>
            <main id="main" class="page" tabindex="-1">${e}</main>
            <nav class="bottom-nav" aria-label="Основная навигация">${n}</nav>
        </div>
    `}function ee(e="Загружаем…"){return`
        <section aria-busy="true" aria-label="${o(e)}">
            <p class="eyebrow">${o(e)}</p>
            <div class="stack">
                <div class="skeleton"></div>
                <div class="skeleton"></div>
            </div>
        </section>
    `}function te(e,t="Повторить",{home:s=!1}={}){const n=s?`<a class="button" href="/v2/" data-route="/">${o(t)}</a>`:`<button class="button" type="button" data-action="retry">${o(t)}</button>`;return`
        <section class="state-card" role="alert">
            <p class="eyebrow">Не удалось продолжить</p>
            <h1>Что-то пошло не так</h1>
            <p>${o(e)}</p>
            ${n}
        </section>
    `}function Ce(e,t,s="/",n="На главную"){return`
        <section class="state-card">
            <p class="eyebrow">Пока пусто</p>
            <h1>${o(e)}</h1>
            <p>${o(t)}</p>
            <a class="button" href="/v2${s}" data-route="${s}">${o(n)}</a>
        </section>
    `}function w(e){const t=document.querySelector("#announcer");t&&(t.textContent=e)}const Te=["А","Б","В","Г"];async function Le(){const e=await be();a.cases.list=e.cases||[]}function ae(){const e=a.cases.list;return e===null?ee("Загружаем кейсы"):e.length?`
        <section>
            <p class="eyebrow">Кейсы</p>
            <h1>Разберите рабочую ситуацию</h1>
            <p class="lede">Ответы проверяются на сервере. В части кейсов путь зависит от выбора.</p>
            <div class="stack">
                ${e.map(t=>`
                    <button class="card" type="button" data-action="open-case" data-case-id="${o(t.id)}">
                        <span class="card-title">${o(t.title)}</span>
                        <span>${o(t.description||"")}</span>
                        <span class="card-meta">
                            ${o(Ee[t.difficulty]||t.difficulty||"")}
                            · ${Number(t.steps_count||0)} шагов
                        </span>
                    </button>
                `).join("")}
            </div>
        </section>
    `:Ce("Кейсов пока нет","Загляните позже или откройте текущую версию.","/","На главную")}async function _e(e){var i;Z();const t=b();await k(t.displayName||"");const s=await ye(e),n=s.steps||[],r={};n.forEach(l=>{r[l.step_number]=l}),a.cases.current=s.case,a.cases.steps=n,a.cases.stepsByNumber=r,a.cases.stepNumber=((i=n[0])==null?void 0:i.step_number)||1}function Oe(){const e=a.cases,t=e.current;if(!t)return ae();if(e.finished){const r=Math.max(e.answered,e.steps.length),i=Math.round(e.correctCount/r*100),l=i===100?"Идеальный разбор ситуации.":i>=50?"Хороший результат — можно пройти ещё раз.":"Есть над чем поработать. Пройдите кейс снова.";return`
            <section>
                <p class="eyebrow">Кейс завершён</p>
                <h1>${o(t.title)}</h1>
                <p class="score" aria-label="${e.correctCount} из ${r}">${e.correctCount}/${r}</p>
                <p class="lede">${o(l)}</p>
                <div class="button-row">
                    <button class="button" type="button" data-action="back-cases">К списку</button>
                    <button class="button secondary" type="button" data-action="open-case" data-case-id="${o(t.id)}">Пройти снова</button>
                </div>
            </section>
        `}const s=e.stepsByNumber[e.stepNumber];if(!s)return`
            <section class="state-card">
                <h1>Шаг не найден</h1>
                <button class="button" type="button" data-action="back-cases">К списку</button>
            </section>
        `;const n=(s.options||[]).map((r,i)=>`
        <button class="answer ${e.feedback?Re(e.feedback,i):""}"
                type="button" data-action="case-answer" data-answer="${i}"
                ${e.feedback||a.busy?"disabled":""}>
            <span class="answer-mark" aria-hidden="true">${Te[i]}</span>
            <span>${o(r)}</span>
        </button>
    `).join("");return`
        <section>
            <p class="eyebrow">Шаг ${e.stepNumber} · ${e.steps.length} в кейсе</p>
            <h1>${o(t.title)}</h1>
            ${t.scenario?`<p class="lede">${o(t.scenario)}</p>`:""}
            <article class="question-card">
                <h2>${o(s.question)}</h2>
                <div class="answers">${n}</div>
            </article>
            ${e.feedback?`
                <section class="feedback ${e.feedback.correct?"ok":"error"}" role="status">
                    <h2>${e.feedback.correct?"✓ Верно":"✕ Неверно"}</h2>
                    <p>${o(e.feedback.explanation||"")}</p>
                    <button class="button" type="button" data-action="case-next">
                        ${e.feedback.finished?"Завершить кейс":"Следующий шаг"}
                    </button>
                </section>
            `:""}
            <p class="muted"><button class="text-button" type="button" data-action="back-cases">← К списку кейсов</button></p>
        </section>
    `}function Re(e,t){return t===e.correctIndex?"is-correct":t===e.selected&&!e.correct?"is-wrong":""}async function ze(e){if(!(a.busy||a.cases.feedback)){a.busy=!0;try{const t=await ge(a.cases.current.id,a.cases.stepNumber,e);a.cases.answered+=1,t.correct&&(a.cases.correctCount+=1),a.cases.feedback={...t,selected:e},a.cases.pendingNext=t.finished?null:t.next_step,w(t.correct?"Верно":"Неверно")}finally{a.busy=!1}}}async function Qe(){const e=a.cases;if(e.feedback){if(e.feedback.finished||e.pendingNext===null){e.finished=!0,e.feedback=null;try{await we(e.current.id,e.correctCount,!0)}catch{}return}e.stepNumber=e.pendingNext,e.pendingNext=null,e.feedback=null}}function je(){Z()}const F={quick:{title:"Проверить себя",meta:"7 вопросов · около 3 минут",description:"Короткий срез знаний с результатом сразу."},training:{title:"Потренироваться",meta:"10 вопросов · с пояснениями",description:"Спокойный режим для обучения на ошибках."}};function B(){return`
        <section>
            <p class="eyebrow">Версия 2 · ранний доступ</p>
            <h1>Что хотите сделать?</h1>
            <p class="lede">Выберите одну цель. Дополнительные настройки можно открыть позже.</p>
            ${!v(d.onboarding,{}).goal?'<p class="tip">Подсказка 1 из 3: для быстрого старта выберите первый вариант.</p>':""}
            <div class="choice-grid">
                <button class="card" type="button" data-goal="quick">
                    <span class="card-title">Проверить себя</span>
                    <span>Короткий срез знаний с результатом сразу.</span>
                    <span class="card-meta">7 вопросов · около 3 минут</span>
                </button>
                <button class="card" type="button" data-goal="training">
                    <span class="card-title">Потренироваться</span>
                    <span>Пояснение появляется сразу после ответа.</span>
                    <span class="card-meta">10 вопросов · без таймера</span>
                </button>
                <button class="card" type="button" data-goal="seminar">
                    <span class="card-title">Войти в семинар</span>
                    <span>Подключиться к общей игре по коду ведущего.</span>
                    <span class="card-meta">Понадобятся код и имя</span>
                </button>
            </div>
            <p class="muted">Нужна помощь? <a href="/guide/user">Открыть инструкцию участника</a>.</p>
        </section>
    `}function Ve(e){const t=F[e]||F.quick,s=b();return`
        <section>
            <p class="eyebrow">${o(t.meta)}</p>
            <h1>${o(t.title)}</h1>
            <p class="lede">${o(t.description)}</p>
            <form class="stack" data-form="identity">
                <div class="field">
                    <label for="display-name">Как к вам обращаться? <span class="muted">(необязательно)</span></label>
                    <input id="display-name" name="displayName" maxlength="60"
                           autocomplete="name" value="${o(s.displayName||"")}">
                </div>
                <div class="button-row">
                    <button class="button" type="submit">Начать</button>
                    <button class="button secondary" type="button" data-action="skip-name">Продолжить без имени</button>
                </div>
            </form>
            <details>
                <summary>Дополнительные настройки</summary>
                <p class="muted">Категории выбираются автоматически. Озвучка и другие параметры появятся в следующих фазах.</p>
            </details>
        </section>
    `}function Me(){const e=b();return`
        <section>
            <p class="eyebrow">Живой семинар</p>
            <h1>Введите код ведущего</h1>
            <p class="lede">Код показывается на экране в зале.</p>
            <form class="stack" data-form="seminar">
                <div class="field">
                    <label for="seminar-code">Код игры</label>
                    <input id="seminar-code" name="code" required maxlength="12"
                           autocapitalize="characters" autocomplete="one-time-code">
                </div>
                <div class="field">
                    <label for="seminar-name">Ваше имя</label>
                    <input id="seminar-name" name="name" required maxlength="20"
                           autocomplete="name" value="${o(e.displayName||"")}">
                </div>
                <button class="button" type="submit">Перейти в зал</button>
            </form>
        </section>
    `}function Ue(e){const t=v(d.onboarding,{});return m(d.onboarding,{...t,goal:!0}),e==="seminar"?"/join":`/start/${e}`}function De(e){const t=e.trim();return t&&z({...b(),displayName:t}),t}const Fe=[{title:"Kahoot",href:"/realtime-host.html",meta:"Живая викторина с PIN",body:"Создайте комнату на хосте. Участники входят по коду через `/v2` → «Войти в семинар» или `/realtime-player.html`.",participant:"/realtime-player.html"},{title:"Пульс зала",href:"/pulse-host.html",meta:"Анонимный опрос без очков",body:"MC или шкала Likert. Участники — `/pulse-player.html`.",participant:"/pulse-player.html"},{title:"Live Q&A",href:"/qa-host.html",meta:"Вопросы с премодерацией",body:"Модерация и upvote на хосте. Участники — `/qa-player.html`.",participant:"/qa-player.html"},{title:"Дайджест дня",href:"/seminar-digest.html",meta:"Нужен вход администратора",body:"Сводка квизов, слабых тем, pre/post и Q&A за выбранные даты."},{title:"Heatmap сцены",href:"/stage-heatmap.html",meta:"Категории и слабые места",body:"Визуализация для обсуждения на проекторе."},{title:"Админка",href:"/admin.html",meta:"Пароль администратора",body:"Вопросы, аналитика, «плохие вопросы», пакетная регистрация."},{title:"QR-слайд",href:"/qr.html",meta:"На проектор или в чат",body:"Участники сканируют QR и попадают на главную викторины."},{title:"Статус",href:"/status.html",meta:"Диагностика на площадке",body:"Здоровье API, сброс кэша, версия сборки."},{title:"Гайд спикера",href:"/guide/speaker",meta:"Чеклист семинара",body:"Полная инструкция: коды, Kahoot, пульс, Q&A, сценарии."}];function q(e){try{return new URL(e,window.location.origin).href}catch{return e}}function Be(){const e=q("/v2/join"),t=q("/"),s=q("/v2/");return`
        <section>
            <p class="eyebrow">Кабинет спикера</p>
            <h1>Инструменты ведущего</h1>
            <p class="lede">
                Зрелые страницы хоста открываются как есть. Здесь — единая точка входа и ссылки для участников.
                На главной V2 эти инструменты скрыты.
            </p>

            <div class="tip">
                <strong>Как запустить зал:</strong>
                откройте нужный хост → покажите PIN или QR → участники заходят по ссылке ниже.
            </div>

            <h2 class="section-title">Ссылки участникам</h2>
            <div class="stack copy-stack">
                ${A("V2 (превью)",s)}
                ${A("Вход в семинар (V2)",e)}
                ${A("Классическая главная",t)}
                ${A("Kahoot-игрок",q("/realtime-player.html"))}
                ${A("Пульс-игрок",q("/pulse-player.html"))}
                ${A("Q&A-участник",q("/qa-player.html"))}
            </div>

            <h2 class="section-title">Хост-инструменты</h2>
            <div class="stack">
                ${Fe.map(n=>`
                    <article class="card static-card">
                        <span class="card-title">${o(n.title)}</span>
                        <span class="card-meta">${o(n.meta)}</span>
                        <p>${o(n.body)}</p>
                        <div class="button-row">
                            <a class="button" href="${o(n.href)}">Открыть</a>
                            ${n.participant?`<button class="button secondary" type="button" data-action="copy-link"
                                           data-copy="${o(q(n.participant))}">Скопировать ссылку игрока</button>`:""}
                        </div>
                    </article>
                `).join("")}
            </div>

            <p class="muted">
                Нужна помощь на площадке? <a href="/guide/speaker">Гайд спикера</a>
                · <a href="/status.html">Статус</a>
                · <a href="/v2/" data-route="/">К V2 участника</a>
            </p>
        </section>
    `}function A(e,t){return`
        <div class="copy-row">
            <div>
                <strong>${o(e)}</strong>
                <code class="copy-value">${o(t)}</code>
            </div>
            <button class="button secondary" type="button" data-action="copy-link"
                    data-copy="${o(t)}">Копировать</button>
        </div>
    `}async function We(e){var s;if((s=navigator.clipboard)!=null&&s.writeText){await navigator.clipboard.writeText(e);return}const t=document.createElement("textarea");t.value=e,t.setAttribute("readonly",""),t.style.position="fixed",t.style.left="-9999px",document.body.appendChild(t),t.select(),document.execCommand("copy"),t.remove()}const He=["А","Б","В","Г"],Je=[{value:0,label:"Снова",hint:"Не вспомнил"},{value:3,label:"Трудно",hint:"С трудом"},{value:4,label:"Хорошо",hint:"Уверенно"},{value:5,label:"Легко",hint:"Сразу"}];async function Ke(){const e=b();await k(e.displayName||"");try{a.learn.stats=await ve()}catch{a.learn.stats={total_cards:0,due_today:0,mature_cards:0}}}function Ge(){const e=a.learn.stats||{},t=Number(e.due_today||0),s=Number(e.total_cards||0);return`
        <section>
            <p class="eyebrow">Учиться</p>
            <h1>Закрепляйте знания</h1>
            <p class="lede">Интервальные повторения и практика по темам — без перегруза главной страницы.</p>

            <div class="choice-grid learn-grid">
                <button class="card" type="button" data-action="start-review">
                    <span class="card-title">Повторение на сегодня</span>
                    <span>Карточки по алгоритму SM-2. Новые вопросы добавляются автоматически.</span>
                    <span class="card-meta">${t} к повтору · ${s} в колоде</span>
                </button>
                <a class="card" href="/v2/start/training" data-route="/start/training">
                    <span class="card-title">Свободная тренировка</span>
                    <span>10 случайных вопросов с пояснениями.</span>
                    <span class="card-meta">Около 5 минут</span>
                </a>
            </div>

            <h2 class="section-title">Практика по теме</h2>
            <p class="muted">По 7 вопросов из выбранной категории.</p>
            <div class="chip-grid" role="list">
                ${Object.entries({ethics:"Этика",rights:"Права",care_standards:"Уход",safety:"Безопасность",emergency:"Экстренное",communication:"Коммуникация",documentation:"Документы",quality:"Качество"}).map(([n,r])=>`
                    <button class="chip" type="button" data-action="start-category" data-category="${n}" role="listitem">
                        ${o(r)}
                    </button>
                `).join("")}
            </div>
        </section>
    `}async function Xe(){Ne(),a.learn.mode="review";const e=b();await k(e.displayName||"");const t=await $e(20),s=[...t.due||[],...t.new||[]];if(!s.length)throw new Error("Пока нет карточек. Пройдите тренировку — вопросы попадут в колоду.");a.learn.cards=s,a.learn.index=0,a.learn.finished=!1}function Ye(){const e=a.learn;if(e.finished)return`
            <section>
                <p class="eyebrow">Повторение</p>
                <h1>Сессия завершена</h1>
                <p class="score" aria-label="${e.correct} из ${e.reviewed}">${e.correct}/${e.reviewed}</p>
                <p class="lede">Карточки сохранены в расписании повторений.</p>
                <div class="button-row">
                    <a class="button" href="/v2/learn" data-route="/learn">К обучению</a>
                    <button class="button secondary" type="button" data-action="start-review">Ещё раз</button>
                </div>
            </section>
        `;const t=e.cards[e.index];if(!t)return"";const s=Math.round((e.index+1)/e.cards.length*100),n=(t.options||[]).map((r,i)=>`
        <button class="answer ${e.feedback?Ze(e.feedback,i):""}"
                type="button" data-action="review-answer" data-answer="${i}"
                ${e.feedback||a.busy?"disabled":""}>
            <span class="answer-mark" aria-hidden="true">${He[i]}</span>
            <span>${o(r)}</span>
        </button>
    `).join("");return`
        <section>
            <div class="progress-wrap">
                <span>Карточка ${e.index+1} из ${e.cards.length}</span>
                <progress class="progress" max="100" value="${s}">${s}%</progress>
            </div>
            <article class="question-card">
                <p class="eyebrow">${o(Q(t.category))}</p>
                <h1>${o(t.question)}</h1>
                <div class="answers">${n}</div>
            </article>
            ${e.feedback?`
                <section class="feedback ${e.feedback.correct?"ok":"error"}" role="status">
                    <h2>${e.feedback.correct?"✓ Верно":"✕ Неверно"}</h2>
                    <p>${o(e.feedback.explanation||"Пояснение появится после оценки.")}</p>
                    ${e.awaitingQuality?`
                        <p class="muted">Насколько легко было ответить?</p>
                        <div class="button-row quality-row">
                            ${Je.map(r=>`
                                <button class="button secondary" type="button"
                                        data-action="review-quality" data-quality="${r.value}"
                                        title="${o(r.hint)}">${o(r.label)}</button>
                            `).join("")}
                        </div>
                    `:""}
                </section>
            `:""}
        </section>
    `}function Ze(e,t){return t===e.correctIndex?"is-correct":t===e.selected&&!e.correct?"is-wrong":""}async function et(e){if(!(a.busy||a.learn.feedback)){a.busy=!0;try{const t=a.learn.cards[a.learn.index],s=await X(t.id,e);a.learn.feedback={...s,selected:e},a.learn.awaitingQuality=!0,s.correct&&(a.learn.correct+=1),w(s.correct?"Верно":"Неверно")}finally{a.busy=!1}}}async function tt(e){if(!(a.busy||!a.learn.awaitingQuality)){a.busy=!0;try{const t=a.learn.cards[a.learn.index];await ke(t.id,Number(e)),a.learn.reviewed+=1,a.learn.awaitingQuality=!1,a.learn.feedback=null,a.learn.index+1<a.learn.cards.length?a.learn.index+=1:a.learn.finished=!0}finally{a.busy=!1}}}async function at(e){Y("category"),a.goal="category";const t=b(),[s]=await Promise.all([G(),k(t.displayName||"")]),n=(s.questions||[]).filter(i=>i.category===e&&Number.isFinite(i.id)&&i.question&&Array.isArray(i.options)&&i.options.length===4);if(!n.length)throw new Error(`В теме «${Q(e)}» пока нет вопросов.`);const r=[...n].sort(()=>Math.random()-.5);a.questions=r.slice(0,Math.min(7,r.length)),a.index=0,a.score=0,a.answers=[],a.feedback=null}async function st(){const e=C();if(!e.userId||!e.token){a.profileExtras.certificates=[];return}try{const t=await xe(e.userId);a.profileExtras.certificates=t.certificates||t||[]}catch{a.profileExtras.certificates=[]}}function nt(){const e=b(),t=T(),s=v(d.history,[]),n=C(),r=a.profileExtras.certificates||[],i=s.length?Math.round(s.reduce((l,p)=>l+(p.percentage||0),0)/s.length):null;return`
        <section>
            <p class="eyebrow">Профиль</p>
            <h1>${o(e.displayName||"Участник")}</h1>
            <p class="lede">
                ${s.length?`Завершено проверок в V2: ${s.length}${i!==null?` · средний результат ${i}%`:""}.`:"Пройдите первую проверку — регистрация не обязательна."}
            </p>

            ${s.length?`
                <div class="stack">
                    ${s.slice(0,5).map(l=>`
                        <article class="card static-card">
                            <strong>${l.score}/${l.total} · ${l.percentage}%</strong>
                            <span class="card-meta">${new Date(l.completedAt).toLocaleDateString("ru-RU")} · ${o(l.goal||"quiz")}</span>
                        </article>
                    `).join("")}
                </div>
            `:""}

            <h2 class="section-title">Настройки</h2>
            <form class="stack" data-form="profile-settings">
                <div class="field">
                    <label for="profile-name">Как к вам обращаться</label>
                    <input id="profile-name" name="displayName" maxlength="60"
                           autocomplete="name" value="${o(e.displayName||"")}">
                </div>
                <label class="check-row">
                    <input type="checkbox" name="tts" ${t.tts?"checked":""}>
                    Озвучивать вопросы (TTS), если браузер поддерживает
                </label>
                <label class="check-row">
                    <input type="checkbox" name="confidencePrompt" ${t.confidencePrompt!==!1?"checked":""}>
                    Спрашивать уверенность перед проверкой ответа (в полной версии)
                </label>
                <label class="check-row">
                    <input type="checkbox" name="sound" ${t.sound!==!1?"checked":""}>
                    Звуковые подсказки
                </label>
                <button class="button" type="submit">Сохранить настройки</button>
            </form>

            <h2 class="section-title">План действия</h2>
            <p class="muted">Коротко зафиксируйте, что примените на работе после обучения.</p>
            <form class="stack" data-form="action-plan">
                <div class="field">
                    <label for="action-plan-text">Мой следующий шаг</label>
                    <textarea id="action-plan-text" name="text" rows="3" maxlength="2000"
                              placeholder="Например: проверить порядок передачи смены"></textarea>
                </div>
                <button class="button secondary" type="submit">Сохранить план</button>
                ${a.profileExtras.actionPlanSaved?'<p class="tip" role="status">План сохранён.</p>':""}
            </form>

            <h2 class="section-title">Сертификаты и аккаунт</h2>
            <div class="link-list">
                <a href="/my-certificates.html">Мои сертификаты${r.length?` (${r.length})`:""}</a>
                <a href="/register.html">Регистрация для сертификата</a>
                <a href="/status.html">Статус сервиса</a>
                <a href="/guide/user">Инструкция участника</a>
                <a href="/v2/host" data-route="/host">Кабинет спикера (V2)</a>
            </div>
            <p class="muted">Сессия: ${n.userId?"гость/пользователь активен":"ещё не создана"}.</p>
        </section>
    `}function rt(e){const t=String(e.get("displayName")||"").trim();z({...b(),displayName:t}),he({tts:e.get("tts")==="on",confidencePrompt:e.get("confidencePrompt")==="on",sound:e.get("sound")==="on"}),t&&k(t).catch(()=>{})}async function it(e){const t=b();await k(t.displayName||""),await Se(e),a.profileExtras.actionPlanSaved=!0}const se=["А","Б","В","Г"],W={quick:7,training:10};let H=null;function ot(e){const t=[...e];for(let s=t.length-1;s>0;s-=1){const n=Math.floor(Math.random()*(s+1));[t[s],t[n]]=[t[n],t[s]]}return t}async function ct(){a.busy=!0,a.lastError=null;try{const e=b(),[t]=await Promise.all([G(),k(e.displayName||"")]),s=(t.questions||[]).filter(n=>Number.isFinite(n.id)&&n.question&&Array.isArray(n.options)&&n.options.length===4);if(!s.length)throw new Error("В банке пока нет доступных вопросов.");a.questions=ot(s).slice(0,W[a.goal]||W.quick),a.index=0,a.score=0,a.answers=[],a.pendingAnswer=null,a.feedback=null,V()}catch(e){throw a.lastError=e,e}finally{a.busy=!1}}function V(){de({goal:a.goal,questions:a.questions,index:a.index,score:a.score,answers:a.answers})}function lt(){const e=a.questions[a.index];if(!e)return"";const t=Math.round((a.index+1)/a.questions.length*100),s=e.options.map((n,r)=>`
        <button class="answer ${a.pendingAnswer===r?"is-selected":""}" type="button" data-answer="${r}"
                ${a.feedback||a.busy||a.pendingAnswer!==null?"disabled":""}>
            <span class="answer-mark" aria-hidden="true">${se[r]}</span>
            <span>${o(n)}</span>
        </button>
    `).join("");return`
        <section>
            <div class="progress-wrap">
                <span>Вопрос ${a.index+1} из ${a.questions.length}</span>
                <progress class="progress" max="100" value="${t}">${t}%</progress>
            </div>
            ${a.index===0?'<p class="tip">Подсказка 2 из 3: ответ проверяется сервером сразу.</p>':""}
            <article class="question-card">
                <p class="eyebrow">${o(e.category||"Общие знания")}</p>
                <h1>${o(e.question)}</h1>
                <div class="answers" aria-label="Варианты ответа">${s}</div>
            </article>
            ${a.pendingAnswer!==null&&!a.feedback?ut():""}
            ${a.feedback?dt():""}
        </section>
    `}function ut(){return`
        <section class="feedback confidence-prompt" role="group" aria-labelledby="confidence-title" tabindex="-1">
            <h2 id="confidence-title">Насколько вы уверены?</h2>
            <p>Ответ пока не отправлен. Выберите уровень уверенности.</p>
            <div class="confidence-actions">
                <button class="button secondary" type="button" data-action="confirm-answer" data-confidence="low">Не уверен</button>
                <button class="button secondary" type="button" data-action="confirm-answer" data-confidence="medium">Скорее уверен</button>
                <button class="button" type="button" data-action="confirm-answer" data-confidence="high">Уверен</button>
            </div>
        </section>
    `}function dt(){const e=a.feedback,t=e.correct?e.explanation:e.wrong_explanation||e.explanation,s=e.correct?"Верно":"Неверно";return`
        <section class="feedback ${e.correct?"ok":"error"}" role="status">
            <h2>${e.correct?"✓":"✕"} ${s}</h2>
            <p>${o(t||"Пояснение к этому вопросу пока не добавлено.")}</p>
            <button class="button" type="button" data-action="next-question">
                ${a.index+1===a.questions.length?"Показать результат":"Далее"}
            </button>
        </section>
    `}function pt(e){return a.busy||a.feedback||a.pendingAnswer!==null?!1:T().confidencePrompt!==!1?(a.pendingAnswer=e,!0):!1}async function ne(e,t=null){if(!(a.busy||a.feedback)){a.busy=!0;try{const s=a.questions[a.index],n=await X(s.id,e);a.feedback=n,a.answers.push({questionId:s.id,question:s.question,category:s.category,answer:e,confidence:t,correct:n.correct}),n.correct&&(a.score+=1),a.pendingAnswer=null,V(),w(n.correct?"Верно":"Неверно"),mt(n.correct)}finally{a.busy=!1}}}async function ft(e){a.pendingAnswer!==null&&await ne(a.pendingAnswer,e)}function ht({force:e=!1}={}){const t=T(),s=a.questions[a.index];if(!(!t.tts||!s||!globalThis.speechSynthesis||!globalThis.SpeechSynthesisUtterance)&&!(!e&&H===s.id)){H=s.id;try{globalThis.speechSynthesis.cancel();const n=s.options.map((i,l)=>`${se[l]}. ${i}`).join(". "),r=new globalThis.SpeechSynthesisUtterance(`${s.question}. ${n}`);r.lang="ru-RU",r.rate=Number.isFinite(t.speechRate)?t.speechRate:1,Number.isFinite(t.speechPitch)&&(r.pitch=t.speechPitch),globalThis.speechSynthesis.speak(r)}catch{}}}function mt(e){if(T().sound!==!1)try{const t=globalThis.AudioContext||globalThis.webkitAudioContext;if(!t)return;const s=new t,n=s.createOscillator(),r=s.createGain();n.type="sine",n.frequency.value=e?660:220,r.gain.setValueAtTime(.05,s.currentTime),r.gain.exponentialRampToValueAtTime(1e-4,s.currentTime+.14),n.connect(r),r.connect(s.destination),n.start(),n.stop(s.currentTime+.14),n.addEventListener("ended",()=>s.close().catch(()=>{}),{once:!0})}catch{}}async function bt(){if(a.index+1<a.questions.length)return a.index+=1,a.pendingAnswer=null,a.feedback=null,V(),!1;try{await me(a.score,a.answers),a.lastError=null}catch(e){a.lastError=e}return pe(),!0}function yt(){var t;const e=new Map;return a.answers.filter(s=>!s.correct).forEach(s=>{e.set(s.category,(e.get(s.category)||0)+1)}),((t=[...e.entries()].sort((s,n)=>n[1]-s[1])[0])==null?void 0:t[0])||null}function gt(){const e=Math.round(a.score/a.questions.length*100);fe({score:a.score,total:a.questions.length,percentage:e,goal:a.goal,completedAt:new Date().toISOString()});const t=v(d.onboarding,{});m(d.onboarding,{...t,result:!0})}function wt(){const e=a.questions.length;if(!e)return`
            <section class="state-card">
                <h1>Результат не найден</h1>
                <p>Начните новую проверку знаний с главной страницы.</p>
                <a class="button" href="/v2/" data-route="/">На главную</a>
            </section>
        `;const t=Math.round(a.score/e*100),s=yt(),n=a.answers.filter(i=>!i.correct),r=a.lastError?'<p class="error-banner">Результат показан, но сервер не смог сохранить его. Локальная история сохранена.</p>':"";return`
        <section>
            <p class="eyebrow">Готово</p>
            <h1>${t>=80?"Отличная работа":"Проверка завершена"}</h1>
            <p class="score" aria-label="${a.score} из ${e}">${a.score}/${e}</p>
            <p class="lede">${t}% правильных ответов.</p>
            ${r}
            ${s?`<p class="tip">Подсказка 3 из 3: стоит повторить тему «${o(Q(s))}».</p>`:""}
            <div class="button-row">
                ${n.length?'<button class="button" type="button" data-action="retry-errors">Повторить ошибки</button>':'<a class="button" href="/v2/cases" data-route="/cases">Перейти к кейсам</a>'}
                <a class="button secondary" href="/v2/learn" data-route="/learn">К обучению</a>
                <a class="button secondary" href="/v2/" data-route="/">Другая цель</a>
            </div>
            <details>
                <summary>Посмотреть ответы</summary>
                <ul>
                    ${a.answers.map(i=>`
                        <li>${i.correct?"Верно":"Ошибка"}: ${o(i.question)}</li>
                    `).join("")}
                </ul>
            </details>
        </section>
    `}const _=document.querySelector("#app"),$t=document.querySelector("#offline-banner"),J=document.querySelector("#session-banner");function vt(e){return e==="/"?B():e==="/join"?Me():e.startsWith("/start/")?Ve(e.split("/").at(-1)):e==="/quiz"?a.questions.length?lt():B():e==="/result"?wt():e==="/learn"?Ge():e==="/learn/review"?Ye():e==="/cases"?a.cases.current?Oe():ae():e==="/profile"||e==="/me"?nt():e==="/host"?Be():te("Такой страницы в V2 пока нет.","На главную",{home:!0})}function c({focus:e=!0}={}){var s;const t=I();if(_.innerHTML=j(vt(t),t),e){const n=document.querySelector("#main");n==null||n.focus({preventScroll:!0})}w(((s=document.querySelector("h1"))==null?void 0:s.textContent)||"Страница обновлена"),t==="/quiz"&&ht()}function N(e){_.innerHTML=j(ee(e),I())}function h(e,t){var s;a.lastError=e,_.innerHTML=j(te(e.message||"Неизвестная ошибка"),I()),(s=_.querySelector('[data-action="retry"]'))==null||s.addEventListener("click",t,{once:!0})}async function M(e,t=""){De(t),Y(e),g("/quiz",{silent:!0}),N("Готовим вопросы");try{await ct(),c()}catch(s){h(s,()=>M(e,t))}}async function re(){if(a.learn.stats){c();return}N("Открываем обучение");try{await Ke(),c()}catch(e){h(e,re)}}async function O(){if(a.cases.list!==null||a.cases.current){c();return}N("Загружаем кейсы");try{await Le(),c()}catch(e){h(e,O)}}async function ie(){N("Открываем профиль");try{await st(),c()}catch(e){h(e,ie)}}async function oe(){const e=I();return e==="/learn"&&!a.learn.stats?(await re(),!0):e==="/cases"&&a.cases.list===null&&!a.cases.current?(await O(),!0):(e==="/profile"||e==="/me")&&a.profileExtras.certificates===null?(await ie(),!0):!1}document.addEventListener("click",async e=>{var i,l,p,y,P,S,D;const t=(i=e.target.closest("[data-goal]"))==null?void 0:i.dataset.goal;if(t){g(Ue(t));return}const s=e.target.closest("[data-answer]");if(s&&!s.dataset.action){try{const u=Number(s.dataset.answer);if(pt(u)){c({focus:!1}),(p=(l=document.querySelector(".confidence-prompt"))==null?void 0:l.focus)==null||p.call(l);return}await ne(u),c({focus:!1}),(P=(y=document.querySelector(".feedback"))==null?void 0:y.focus)==null||P.call(y)}catch(u){h(u,c)}return}const n=e.target.closest("[data-action]"),r=n==null?void 0:n.dataset.action;if(r){if(r==="skip-name"){const u=I().split("/").at(-1);await M(u)}if(r==="next-question"&&(await bt()&&(gt(),g("/result",{silent:!0})),c()),r==="confirm-answer")try{await ft(n.dataset.confidence||null),c({focus:!1}),(D=(S=document.querySelector(".feedback"))==null?void 0:S.focus)==null||D.call(S)}catch(u){h(u,c)}if(r==="retry-errors"){const u=new Set(a.answers.filter($=>!$.correct).map($=>$.questionId));a.questions=a.questions.filter($=>u.has($.id)),a.index=0,a.score=0,a.answers=[],a.pendingAnswer=null,a.feedback=null,a.lastError=null,g("/quiz",{silent:!0}),c()}if(r==="start-review"){g("/learn/review",{silent:!0}),N("Готовим карточки");try{await Xe(),c()}catch(u){h(u,()=>{g("/learn")})}}if(r==="start-category"){const u=n.dataset.category;g("/quiz",{silent:!0}),N("Готовим практику по теме");try{await at(u),c()}catch($){h($,()=>g("/learn"))}}if(r==="review-answer")try{await et(Number(n.dataset.answer)),c({focus:!1})}catch(u){h(u,c)}if(r==="review-quality")try{await tt(Number(n.dataset.quality)),c()}catch(u){h(u,c)}if(r==="open-case"){const u=n.dataset.caseId;g("/cases",{silent:!0}),N("Открываем кейс");try{await _e(u),c()}catch($){h($,O)}}if(r==="case-answer")try{await ze(Number(n.dataset.answer)),c({focus:!1})}catch(u){h(u,c)}if(r==="case-next"&&(await Qe(),c()),r==="back-cases"&&(je(),a.cases.list===null?await O():c()),r==="copy-link")try{await We(n.dataset.copy||""),w("Ссылка скопирована");const u=n.textContent;n.textContent="Скопировано",window.setTimeout(()=>{n.textContent=u},1600)}catch{w("Не удалось скопировать")}}});document.addEventListener("submit",async e=>{const t=e.target;if(t.dataset.form==="identity"){e.preventDefault();const s=I().split("/").at(-1);await M(s,new FormData(t).get("displayName")||"")}if(t.dataset.form==="seminar"){e.preventDefault();const s=new FormData(t),n=String(s.get("code")||"").trim().toUpperCase(),r=String(s.get("name")||"").trim();z({displayName:r}),localStorage.setItem("glm_game_id",n),localStorage.setItem("glm_player_name",r),window.location.assign("/realtime-player.html")}if(t.dataset.form==="profile-settings"&&(e.preventDefault(),rt(new FormData(t)),w("Настройки сохранены"),c({focus:!1})),t.dataset.form==="action-plan"){e.preventDefault();const s=String(new FormData(t).get("text")||"").trim();if(s.length<3){w("Опишите план чуть подробнее");return}try{await it(s),c({focus:!1}),w("План действия сохранён")}catch(n){h(n,c)}}});function U(){$t.hidden=navigator.onLine}window.addEventListener("online",U);window.addEventListener("offline",U);window.addEventListener("glm:auth-expired",()=>{J.hidden=!1,w("Сессия истекла. Создаём новую гостевую сессию."),window.setTimeout(()=>{J.hidden=!0},5e3)});window.addEventListener("error",e=>{e.error instanceof R||console.error(e.error)});ce();qe(()=>{oe().then(e=>{e||c()})});U();oe().then(e=>{e||c({focus:!1})});
//# sourceMappingURL=index-Dt7OI8xF.js.map
