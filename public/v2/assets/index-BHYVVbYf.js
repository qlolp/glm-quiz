(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))n(r);new MutationObserver(r=>{for(const o of r)if(o.type==="childList")for(const d of o.addedNodes)d.tagName==="LINK"&&d.rel==="modulepreload"&&n(d)}).observe(document,{childList:!0,subtree:!0});function s(r){const o={};return r.integrity&&(o.integrity=r.integrity),r.referrerPolicy&&(o.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?o.credentials="include":r.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function n(r){if(r.ep)return;r.ep=!0;const o=s(r);fetch(r.href,o)}})();const q="glm.v2.",p={session:`${q}session`,profile:`${q}profile`,preferences:`${q}preferences`,progress:`${q}progress`,history:`${q}history`,onboarding:`${q}onboarding`,migration:`${q}migration`};function z(e,t=null){if(!e)return t;try{return JSON.parse(e)}catch{return t}}function M(e,t=null){return z(localStorage.getItem(e),t)}function b(e,t){localStorage.setItem(e,JSON.stringify(t))}function ee(e){localStorage.removeItem(e)}function he(){if(localStorage.getItem(p.migration))return;const e=z(localStorage.getItem("quiz_user"),{}),t=localStorage.getItem("userId")||e.id||null,s=localStorage.getItem("username")||e.username||null,n=localStorage.getItem("userDisplayName")||e.display_name||s||"",r=localStorage.getItem("userToken");(t||r)&&b(p.session,{userId:t,username:s,token:r}),n&&b(p.profile,{displayName:n});const o={},d=localStorage.getItem("glm_quiz_sound"),f=localStorage.getItem("glm_quiz_tts_rate"),v=localStorage.getItem("glm_quiz_tts_pitch");d!==null&&(o.sound=d==="true"),f!==null&&(o.speechRate=Number(f)),v!==null&&(o.speechPitch=Number(v)),Object.keys(o).length&&b(p.preferences,o);const _=z(localStorage.getItem("glm_quiz_progress")),N=z(localStorage.getItem("glm_quiz_history"));_&&b(p.progress,{..._,migratedFrom:"glm_quiz_progress"}),N&&b(p.history,N),b(p.migration,{version:1,migratedAt:new Date().toISOString()})}function T(){return M(p.session,{})}function me(e,t){b(p.session,{userId:e.id,username:e.username,displayName:e.display_name,token:t})}function be(){ee(p.session)}function y(){return M(p.profile,{})}function Q(e){b(p.profile,e)}function ye(e){b(p.progress,{...e,savedAt:new Date().toISOString()})}function ge(){ee(p.progress)}function ve(e){const t=M(p.history,[]);b(p.history,[e,...t].slice(0,30))}function O(){return M(p.preferences,{sound:!0,tts:!1,speechRate:1,confidencePrompt:!0})}function $e(e){b(p.preferences,{...O(),...e})}class j extends Error{constructor(t,s=0,n="request_failed"){super(t),this.name="ApiError",this.status=s,this.code=n}}async function h(e,t={}){const{auth:s=!1,retryAuth:n=!1,...r}=t,o=new Headers(r.headers||{}),d=T().token;s&&d&&o.set("Authorization",`Bearer ${d}`),r.body&&!o.has("Content-Type")&&o.set("Content-Type","application/json");let f;try{f=await fetch(e,{...r,headers:o,cache:r.cache||"no-store"})}catch{throw new j(navigator.onLine?"Сервер временно недоступен.":"Нет подключения к интернету.",0,navigator.onLine?"network":"offline")}if(s&&(f.status===401||f.status===403)&&(be(),window.dispatchEvent(new CustomEvent("glm:auth-expired")),n))return await S(),h(e,{...t,retryAuth:!1});const v=await f.json().catch(()=>({}));if(!f.ok)throw new j(v.error||`Ошибка запроса (${f.status})`,f.status,f.status===401||f.status===403?"auth_expired":"api");return v}async function S(e=""){var r,o;const t=T();if(t.token&&t.userId)return t;const s=((o=(r=globalThis.crypto)==null?void 0:r.randomUUID)==null?void 0:o.call(r))||`${Date.now()}_${Math.random().toString(36).slice(2,9)}`,n=await h("/api/users",{method:"POST",body:JSON.stringify({username:`guest_${s}`,display_name:e.trim()||"Участник"})});return me(n.user,n.token),T()}function te(){return h("/api/questions")}function ae(e,t){return h("/api/quiz/check-answer",{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({questionId:e,answer:t})})}function we(e,t){return h("/api/quiz/complete",{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({score:e,total_questions:t.length,answers:t.map(({questionId:s,answer:n})=>({questionId:s,answer:n}))})})}function ke(){return h("/api/cases")}function xe(e){return h(`/api/cases/${encodeURIComponent(e)}`)}function Me(e,t,s){return h(`/api/cases/${encodeURIComponent(e)}/check-step`,{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({step_number:t,answer:s})})}function Se(e,t,s=!0){return h(`/api/cases/${encodeURIComponent(e)}/progress`,{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({score:t,completed:s})})}function Ne(e=20){return h(`/api/spaced-repetition/due?limit=${e}`,{auth:!0,retryAuth:!0})}function qe(){return h("/api/spaced-repetition/stats",{auth:!0,retryAuth:!0})}function Ae(e,t){return h("/api/spaced-repetition/review",{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({question_id:e,quality:t})})}function Le(e,t=null,s="v2"){return h("/api/action-plans",{method:"POST",auth:!0,retryAuth:!0,body:JSON.stringify({text:e,score:t,mode:s})})}function Ie(e){return h(`/api/certificates/user/${encodeURIComponent(e)}`,{auth:!0,retryAuth:!0})}const C="/v2";function P(){const e=window.location.pathname;return e===C||e===`${C}/`?"/":e.startsWith(`${C}/`)?e.slice(C.length):"/"}function $(e,{replace:t=!1,silent:s=!1}={}){const n=e==="/"?`${C}/`:`${C}${e}`;history[t?"replaceState":"pushState"]({},"",n),s||window.dispatchEvent(new CustomEvent("glm:navigate"))}function Ce(e){document.addEventListener("click",t=>{const s=t.target.closest("a[data-route]");!s||t.defaultPrevented||t.button!==0||t.metaKey||t.ctrlKey||t.shiftKey||t.altKey||(t.preventDefault(),$(s.dataset.route))}),window.addEventListener("popstate",e),window.addEventListener("glm:navigate",e)}const a={goal:null,questions:[],index:0,score:0,answers:[],pendingAnswer:null,feedback:null,busy:!1,lastError:null,learn:{mode:null,stats:null,cards:[],index:0,feedback:null,awaitingQuality:!1,reviewed:0,correct:0,finished:!1},cases:{list:null,current:null,steps:[],stepsByNumber:{},stepNumber:1,feedback:null,pendingNext:null,correctCount:0,answered:0,finished:!1},profileExtras:{certificates:null,actionPlanSaved:!1}};function se(e){Object.assign(a,{goal:e,questions:[],index:0,score:0,answers:[],pendingAnswer:null,feedback:null,busy:!1,lastError:null})}function Ee(){Object.assign(a.learn,{mode:null,cards:[],index:0,feedback:null,awaitingQuality:!1,reviewed:0,correct:0,finished:!1})}function ne(){Object.assign(a.cases,{current:null,steps:[],stepsByNumber:{},stepNumber:1,feedback:null,pendingNext:null,correctCount:0,answered:0,finished:!1})}const Pe={ethics:"Профессиональная этика",rights:"Права получателей",care_standards:"Стандарты ухода",safety:"Безопасность",emergency:"Экстренные ситуации",communication:"Коммуникация",documentation:"Документооборот",quality:"Оценка качества",mobility:"Мобильность",accessibility:"Доступность",forms_of_service:"Формы обслуживания",service_types:"Виды услуг",mission:"Миссия",spb_specific:"Специфика СПб",general:"Общие знания"},_e={easy:"Легкий",medium:"Средний",hard:"Сложный"};function R(e){return Pe[e]||e||"Общие знания"}const Te={home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-6h5v6"/>',learn:'<path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H3z"/><path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H15a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H21z"/>',cases:'<path d="M4 7h16v13H4z"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M4 12h16"/>',profile:'<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',check:'<path d="M20 6.5 9.5 17 4 11.5"/>',cross:'<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',arrowRight:'<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',arrowLeft:'<path d="M20 12H5"/><path d="M11 18l-6-6 6-6"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.75h.01"/>',alert:'<path d="M12 3.5 22 20H2z"/><path d="M12 9.5v5"/><path d="M12 17.5h.01"/>',offline:'<path d="M3 3l18 18"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><path d="M5 12a10 10 0 0 1 4-2.5"/><path d="M15 9.5A10 10 0 0 1 19 12"/><path d="M12 19h.01"/>',play:'<path d="M7 4.5 19 12 7 19.5z"/>',repeat:'<path d="M4 11a8 8 0 0 1 13.5-5.5L20 8"/><path d="M20 4v4h-4"/><path d="M20 13a8 8 0 0 1-13.5 5.5L4 16"/><path d="M4 20v-4h4"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.5 2"/>',layers:'<path d="M12 3 3 8l9 5 9-5z"/><path d="M3 13l9 5 9-5"/>',cards:'<path d="M4 7h11v13H4z"/><path d="M8 4h11v13"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.5"/><path d="M17 19a6 6 0 0 0-2-4.4"/>',presentation:'<path d="M3 4h18"/><path d="M4 4v10h16V4"/><path d="M12 14v3"/><path d="M8.5 20l3.5-3 3.5 3"/>',copy:'<path d="M9 9h11v11H9z"/><path d="M15 9V4H4v11h5"/>',external:'<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',certificate:'<circle cx="12" cy="9.5" r="5.5"/><path d="M9 14.5 8 21l4-2 4 2-1-6.5"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3"/><path d="M12 18.5v3"/><path d="M2.5 12h3"/><path d="M18.5 12h3"/><path d="M5.3 5.3l2.1 2.1"/><path d="M16.6 16.6l2.1 2.1"/><path d="M18.7 5.3l-2.1 2.1"/><path d="M7.4 16.6l-2.1 2.1"/>',target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',note:'<path d="M5 3.5h14v17H5z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h3"/>',pulse:'<path d="M3 12h4l2.5-6 4 12L16 12h5"/>',chat:'<path d="M4 5h16v11H9l-5 4z"/>',key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8"/><path d="M16.5 6.5 19 9"/>',activity:'<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>',inbox:'<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 4h14l2 9v7H3v-7z"/>'};function i(e,{size:t=null}={}){const s=Te[e];return s?`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${t?` style="width:${t};height:${t}"`:""}>${s}</svg>`:""}const Re=[["/","Главная","home"],["/learn","Обучение","learn"],["/cases","Кейсы","cases"],["/profile","Профиль","profile"]];function c(e=""){return String(e).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function Oe(e){return e.startsWith("/quiz")||e.startsWith("/result")||e.startsWith("/start")||e==="/join"?"/":e.startsWith("/learn")?"/learn":e.startsWith("/cases")||e.startsWith("/case")?"/cases":e==="/me"||e.startsWith("/profile")?"/profile":e.startsWith("/host")?"":e}function B(e,t="/"){const s=Oe(t),n=Re.map(([r,o,d])=>`
        <a class="nav-item" href="/v2${r==="/"?"/":r}" data-route="${r}"
           ${s===r?'aria-current="page"':""}>${i(d)}<span>${o}</span></a>
    `).join("");return`
        <div class="app-shell">
            <header class="topbar">
                <div class="topbar-inner">
                    <a class="brand" href="/v2/" data-route="/">
                        <span class="brand-mark" aria-hidden="true"></span>
                        GLM Quiz
                        <span class="brand-sub">V2</span>
                    </a>
                    <a class="topbar-link" href="/v2/host" data-route="/host">
                        ${i("presentation")}<span>Спикерам</span>
                    </a>
                </div>
            </header>
            <main id="main" class="page" tabindex="-1">${e}</main>
            <nav class="bottom-nav" aria-label="Основная навигация">
                <div class="bottom-nav-inner">${n}</div>
            </nav>
        </div>
    `}function k(e,t,s=""){return`
        <div class="page-head">
            ${e?`<p class="eyebrow">${c(e)}</p>`:""}
            <h1>${c(t)}</h1>
            ${s?`<p class="lede">${c(s)}</p>`:""}
        </div>
    `}function g(e,t=""){return`
        <div class="section-head">
            <h2>${c(e)}</h2>
            ${t?`<p class="muted">${c(t)}</p>`:""}
        </div>
    `}function E(e,{tone:t="",iconName:s="info",html:n=""}={}){return`
        <div class="callout ${t}">
            ${i(s)}
            <div>${n||c(e)}</div>
        </div>
    `}function re(e,t,s="Вопрос"){const n=Math.max(1,Number(t)||1),r=Math.min(100,Math.round(e/n*100));return`
        <div class="meter-wrap">
            <p class="meter-label">
                <span>${c(s)} <span class="meter-step">${e} / ${n}</span></span>
                <span>${r}%</span>
            </p>
            <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100"
                 aria-valuenow="${r}" aria-label="${c(s)} ${e} из ${n}">
                <div class="meter-fill" style="width:${r}%"></div>
            </div>
        </div>
    `}function ie(e="Загружаем…"){return`
        <section aria-busy="true" aria-label="${c(e)}">
            <div class="page-head">
                <p class="eyebrow">${c(e)}</p>
            </div>
            <div class="stack">
                <div class="skeleton"></div>
                <div class="skeleton"></div>
                <div class="skeleton"></div>
            </div>
        </section>
    `}function ce(e,t="Повторить",{home:s=!1}={}){const n=s?`<a class="button" href="/v2/" data-route="/">${i("home")}${c(t)}</a>`:`<button class="button" type="button" data-action="retry">${i("repeat")}${c(t)}</button>`;return`
        <section class="state-card reveal-panel" role="alert">
            <span class="state-icon err">${i("alert")}</span>
            <h1>Что-то пошло не так</h1>
            <p class="muted">${c(e)}</p>
            <div class="button-row">
                ${n}
                ${s?"":'<a class="button secondary" href="/v2/" data-route="/">На главную</a>'}
            </div>
        </section>
    `}function ze(e,t,s="/",n="На главную",r="inbox"){return`
        <section class="state-card reveal-panel">
            <span class="state-icon">${i(r)}</span>
            <h1>${c(e)}</h1>
            <p class="muted">${c(t)}</p>
            <a class="button" href="/v2${s}" data-route="${s}">${c(n)}${i("arrowRight")}</a>
        </section>
    `}function w(e){const t=document.querySelector("#announcer");t&&(t.textContent=e)}const oe=["А","Б","В","Г"],K={quick:7,training:10};let G=null;function Ve(e){const t=[...e];for(let s=t.length-1;s>0;s-=1){const n=Math.floor(Math.random()*(s+1));[t[s],t[n]]=[t[n],t[s]]}return t}async function He(){a.busy=!0,a.lastError=null;try{const e=y(),[t]=await Promise.all([te(),S(e.displayName||"")]),s=(t.questions||[]).filter(n=>Number.isFinite(n.id)&&n.question&&Array.isArray(n.options)&&n.options.length===4);if(!s.length)throw new Error("В банке пока нет доступных вопросов.");a.questions=Ve(s).slice(0,K[a.goal]||K.quick),a.index=0,a.score=0,a.answers=[],a.pendingAnswer=null,a.feedback=null,D()}catch(e){throw a.lastError=e,e}finally{a.busy=!1}}function D(){ye({goal:a.goal,questions:a.questions,index:a.index,score:a.score,answers:a.answers})}function je(e,t){return e?t===e.correctIndex?"is-correct":t===e.selected&&!e.correct?"is-wrong":"":a.pendingAnswer===t?"is-selected":""}function Qe(e){return e==="is-correct"?`<span class="answer-state">${i("check")}</span>`:e==="is-wrong"?`<span class="answer-state">${i("cross")}</span>`:'<span class="answer-state"></span>'}function U(e,t,{className:s,disabled:n,action:r=null}){const o=r?`data-action="${r}" data-answer="${t}"`:`data-answer="${t}"`;return`
        <button class="answer ${s}" type="button" ${o} ${n?"disabled":""}>
            <span class="answer-mark" aria-hidden="true">${oe[t]||t+1}</span>
            <span>${c(e)}</span>
            ${Qe(s)}
        </button>
    `}function Be(){const e=a.questions[a.index];if(!e)return"";const t=!!a.feedback||a.busy||a.pendingAnswer!==null,s=e.options.map((n,r)=>U(n,r,{className:je(a.feedback,r),disabled:t})).join("");return`
        <section>
            ${re(a.index+1,a.questions.length,"Вопрос")}
            <article class="question-card">
                <div class="question-head">
                    <span class="badge accent">${c(R(e.category))}</span>
                    ${e.difficulty?`<span class="badge">${c(De(e.difficulty))}</span>`:""}
                </div>
                <p class="q-text">${c(e.question)}</p>
                <div class="answers" role="group" aria-label="Варианты ответа">${s}</div>
            </article>
            ${a.pendingAnswer!==null&&!a.feedback?Ue():""}
            ${a.feedback?Fe():""}
        </section>
    `}function De(e){return{easy:"Легкий",medium:"Средний",hard:"Сложный"}[e]||e}function Ue(){return`
        <section class="feedback reveal-panel confidence-prompt" role="group"
                 aria-labelledby="confidence-title" tabindex="-1">
            <h2 class="verdict" id="confidence-title">${i("info")}Насколько вы уверены?</h2>
            <p class="feedback-text">Ответ ещё не отправлен. Оценка уверенности помогает точнее подобрать повторение.</p>
            <div class="confidence-actions">
                <button class="button secondary" type="button" data-action="confirm-answer" data-confidence="low">Не уверен</button>
                <button class="button secondary" type="button" data-action="confirm-answer" data-confidence="medium">Скорее уверен</button>
                <button class="button" type="button" data-action="confirm-answer" data-confidence="high">Уверен</button>
            </div>
        </section>
    `}function Fe(){const e=a.feedback,t=e.correct?e.explanation:e.wrong_explanation||e.explanation,s=a.index+1===a.questions.length;return`
        <section class="feedback reveal-panel ${e.correct?"ok":"error"}" role="status" tabindex="-1">
            <h2 class="verdict">
                ${i(e.correct?"check":"cross")}${e.correct?"Верно":"Неверно"}
            </h2>
            <p class="feedback-text">${c(t||"Пояснение к этому вопросу пока не добавлено.")}</p>
            ${!e.correct&&e.hint?`<p class="feedback-text"><strong>Подсказка на будущее:</strong> ${c(e.hint)}</p>`:""}
            <button class="button block" type="button" data-action="next-question">
                ${s?"Показать результат":"Следующий вопрос"}${i("arrowRight")}
            </button>
        </section>
    `}function We(e){return a.busy||a.feedback||a.pendingAnswer!==null?!1:O().confidencePrompt!==!1?(a.pendingAnswer=e,!0):!1}async function le(e,t=null){if(!(a.busy||a.feedback)){a.busy=!0;try{const s=a.questions[a.index],n=await ae(s.id,e);a.feedback={...n,selected:e},a.answers.push({questionId:s.id,question:s.question,category:s.category,answer:e,confidence:t,correct:n.correct}),n.correct&&(a.score+=1),a.pendingAnswer=null,D(),w(n.correct?"Верно":"Неверно"),Ge(n.correct)}finally{a.busy=!1}}}async function Je(e){a.pendingAnswer!==null&&await le(a.pendingAnswer,e)}function Ke({force:e=!1}={}){const t=O(),s=a.questions[a.index];if(!(!t.tts||!s||!globalThis.speechSynthesis||!globalThis.SpeechSynthesisUtterance)&&!(!e&&G===s.id)){G=s.id;try{globalThis.speechSynthesis.cancel();const n=s.options.map((o,d)=>`${oe[d]}. ${o}`).join(". "),r=new globalThis.SpeechSynthesisUtterance(`${s.question}. ${n}`);r.lang="ru-RU",r.rate=Number.isFinite(t.speechRate)?t.speechRate:1,Number.isFinite(t.speechPitch)&&(r.pitch=t.speechPitch),globalThis.speechSynthesis.speak(r)}catch{}}}function Ge(e){if(O().sound!==!1)try{const t=globalThis.AudioContext||globalThis.webkitAudioContext;if(!t)return;const s=new t,n=s.createOscillator(),r=s.createGain();n.type="sine",n.frequency.value=e?660:220,r.gain.setValueAtTime(.05,s.currentTime),r.gain.exponentialRampToValueAtTime(1e-4,s.currentTime+.14),n.connect(r),r.connect(s.destination),n.start(),n.stop(s.currentTime+.14),n.addEventListener("ended",()=>s.close().catch(()=>{}),{once:!0})}catch{}}async function Xe(){if(a.index+1<a.questions.length)return a.index+=1,a.pendingAnswer=null,a.feedback=null,D(),!1;try{await we(a.score,a.answers),a.lastError=null}catch(e){a.lastError=e}return ge(),!0}async function Ye(){const e=await ke();a.cases.list=e.cases||[]}function de(){const e=a.cases.list;return e===null?ie("Загружаем кейсы"):e.length?`
        <section>
            ${k("Кейсы","Разберите рабочую ситуацию","Ответы проверяются на сервере. В части кейсов дальнейший путь зависит от вашего выбора.")}
            <div class="stack">
                ${e.map(t=>`
                    <button class="card card-lead" type="button" data-action="open-case"
                            data-case-id="${c(t.id)}">
                        <span class="card-icon" aria-hidden="true">${i("cases")}</span>
                        <span class="stack-tight">
                            <span class="card-title">${c(t.title)}</span>
                            <span class="card-body">${c(t.description||"")}</span>
                            <span class="card-meta">
                                <span class="badge">${c(_e[t.difficulty]||t.difficulty||"Средний")}</span>
                                <span class="badge">${Number(t.steps_count||0)} шагов</span>
                            </span>
                        </span>
                    </button>
                `).join("")}
            </div>
        </section>
    `:ze("Кейсов пока нет","Загляните позже или откройте классическую версию интерфейса.","/","На главную","cases")}async function Ze(e){var o;ne();const t=y();await S(t.displayName||"");const s=await xe(e),n=s.steps||[],r={};n.forEach(d=>{r[d.step_number]=d}),a.cases.current=s.case,a.cases.steps=n,a.cases.stepsByNumber=r,a.cases.stepNumber=((o=n[0])==null?void 0:o.step_number)||1}function et(e){return`
        <ol class="step-rail" aria-hidden="true">
            ${e.steps.map(t=>`<li class="${t.step_number===e.stepNumber?"is-current":t.step_number<e.stepNumber?"is-done":""}"></li>`).join("")}
        </ol>
    `}function tt(e){const t=Math.max(e.answered,e.steps.length),s=Math.round(e.correctCount/t*100),n=s===100?"Идеальный разбор ситуации.":s>=50?"Хороший результат — можно пройти ещё раз для закрепления.":"Есть над чем поработать. Пройдите кейс снова.";return`
        <section>
            ${k("Кейс завершён",e.current.title,n)}
            <div class="score-panel">
                <div class="score-dial" style="--dial:${s}" role="img"
                     aria-label="${e.correctCount} из ${t}">
                    <div class="score-dial-inner">
                        <span class="score-value">${e.correctCount}/${t}</span>
                        <span class="score-unit">${s}% верно</span>
                    </div>
                </div>
            </div>
            <div class="section">
                <div class="stack">
                    <button class="button block" type="button" data-action="back-cases">
                        ${i("arrowLeft")}К списку кейсов
                    </button>
                    <button class="button secondary" type="button" data-action="open-case"
                            data-case-id="${c(e.current.id)}">${i("repeat")}Пройти снова</button>
                </div>
            </div>
        </section>
    `}function at(){const e=a.cases,t=e.current;if(!t)return de();if(e.finished)return tt(e);const s=e.stepsByNumber[e.stepNumber];if(!s)return`
            <section class="state-card">
                <span class="state-icon err">${i("alert")}</span>
                <h1>Шаг не найден</h1>
                <p class="muted">Похоже, кейс изменился. Вернитесь к списку и откройте его снова.</p>
                <button class="button" type="button" data-action="back-cases">${i("arrowLeft")}К списку</button>
            </section>
        `;const n=(s.options||[]).map((r,o)=>U(r,o,{className:e.feedback?st(e.feedback,o):"",disabled:!!e.feedback||a.busy,action:"case-answer"})).join("");return`
        <section>
            ${et(e)}
            <div class="page-head">
                <p class="eyebrow">Шаг ${e.stepNumber} из ${e.steps.length}</p>
                <h1>${c(t.title)}</h1>
            </div>
            ${t.scenario?`<p class="scenario">${c(t.scenario)}</p>`:""}
            <article class="question-card" style="margin-top: var(--sp-4)">
                <p class="q-text">${c(s.question)}</p>
                <div class="answers" role="group" aria-label="Варианты действия">${n}</div>
            </article>
            ${e.feedback?`
                <section class="feedback reveal-panel ${e.feedback.correct?"ok":"error"}"
                         role="status" tabindex="-1">
                    <h2 class="verdict">
                        ${i(e.feedback.correct?"check":"cross")}${e.feedback.correct?"Верно":"Неверно"}
                    </h2>
                    <p class="feedback-text">${c(e.feedback.explanation||"")}</p>
                    <button class="button block" type="button" data-action="case-next">
                        ${e.feedback.finished?"Завершить кейс":"Следующий шаг"}${i("arrowRight")}
                    </button>
                </section>
            `:""}
            <p style="margin-top: var(--sp-5)">
                <button class="text-button" type="button" data-action="back-cases">
                    ${i("arrowLeft")}К списку кейсов
                </button>
            </p>
        </section>
    `}function st(e,t){return t===e.correctIndex?"is-correct":t===e.selected&&!e.correct?"is-wrong":""}async function nt(e){if(!(a.busy||a.cases.feedback)){a.busy=!0;try{const t=await Me(a.cases.current.id,a.cases.stepNumber,e);a.cases.answered+=1,t.correct&&(a.cases.correctCount+=1),a.cases.feedback={...t,selected:e},a.cases.pendingNext=t.finished?null:t.next_step,w(t.correct?"Верно":"Неверно")}finally{a.busy=!1}}}async function rt(){const e=a.cases;if(e.feedback){if(e.feedback.finished||e.pendingNext===null){e.finished=!0,e.feedback=null;try{await Se(e.current.id,e.correctCount,!0)}catch{}return}e.stepNumber=e.pendingNext,e.pendingNext=null,e.feedback=null}}function it(){ne()}const X={quick:{title:"Проверить себя",meta:"7 вопросов · около 3 минут",description:"Короткий срез знаний. Результат и разбор ошибок сразу после теста."},training:{title:"Потренироваться",meta:"10 вопросов · с пояснениями",description:"Спокойный режим без таймера: пояснение появляется после каждого ответа."}},ct=[{goal:"quick",iconName:"target",title:"Проверить себя",body:"Короткий срез знаний с результатом сразу.",meta:["7 вопросов","около 3 минут"]},{goal:"training",iconName:"learn",title:"Потренироваться",body:"Пояснение появляется сразу после ответа.",meta:["10 вопросов","без таймера"]},{goal:"seminar",iconName:"users",title:"Войти в семинар",body:"Подключиться к общей игре по коду ведущего.",meta:["нужен код","и имя"]}],ot=[["Выберите режим","Проверка знаний, тренировка с пояснениями или живая игра в зале."],["Ответьте на вопросы","Каждый ответ проверяется на сервере, объяснение доступно сразу."],["Разберите результат","Слабые темы попадают в обучение и в план действия."]];function lt({goal:e,iconName:t,title:s,body:n,meta:r}){return`
        <button class="card card-lead" type="button" data-goal="${e}">
            <span class="card-icon" aria-hidden="true">${i(t)}</span>
            <span class="stack-tight">
                <span class="card-title">${c(s)}</span>
                <span class="card-body">${c(n)}</span>
                <span class="card-meta">
                    ${r.map(o=>`<span class="badge">${c(o)}</span>`).join("")}
                </span>
            </span>
        </button>
    `}function Y(){const e=!M(p.onboarding,{}).goal,t=y();return`
        <section>
            ${k("Семинар «Не просто накормить»","Знания для практики в соцобслуживании","Проверка и обучение для директоров и специалистов: стандарты ухода, этика и осторожное применение ИИ в ежедневной работе.")}

            ${e?E("Начните с короткой проверки — около трёх минут, без таймера давления.",{tone:"info"}):""}

            <div class="stack" style="margin-top: var(--sp-5)">
                ${ct.map(lt).join("")}
            </div>

            <div class="section">
                ${g("Как это работает","Три шага от старта до плана действия.")}
                <ol class="steps">
                    ${ot.map(([s,n])=>`
                        <li class="step">
                            <div>
                                <span class="step-title">${c(s)}</span>
                                <span class="step-text">${c(n)}</span>
                            </div>
                        </li>
                    `).join("")}
                </ol>
            </div>

            <div class="section">
                ${g("Контекст семинара","Банк вопросов шире одной темы — так устроены реальные рабочие задачи.")}
                <p class="muted" style="max-width: 36rem">
                    Материал опирается на практику организаций социального обслуживания:
                    питание и качество ухода, права получателей услуг, коммуникация команды
                    и этичные решения там, где появляется ИИ.
                </p>
            </div>

            <div class="section">
                ${g("Полезное рядом")}
                <div class="link-list">
                    <a href="/guide/user">${i("note")}<span>Инструкция участника</span>${i("arrowRight")}</a>
                    <a href="/v2/learn" data-route="/learn">${i("layers")}<span>Повторение и практика по темам</span>${i("arrowRight")}</a>
                    <a href="/v2/host" data-route="/host">${i("presentation")}<span>Кабинет спикера</span>${i("arrowRight")}</a>
                </div>
                ${t.displayName?`<p class="meta" style="margin-top: var(--sp-4)">Вы продолжаете как ${c(t.displayName)}.</p>`:""}
            </div>
        </section>
    `}function dt(e){const t=X[e]||X.quick,s=y();return`
        <section>
            ${k(t.meta,t.title,t.description)}
            <form class="stack" data-form="identity">
                <div class="field">
                    <label for="display-name">Как к вам обращаться?</label>
                    <p class="field-hint" id="display-name-hint">
                        Необязательно. Имя видно только вам и ведущему семинара.
                    </p>
                    <input id="display-name" name="displayName" maxlength="60"
                           autocomplete="name" aria-describedby="display-name-hint"
                           value="${c(s.displayName||"")}">
                </div>
                <div class="button-row">
                    <button class="button" type="submit">${i("play")}Начать</button>
                    <button class="button secondary" type="button" data-action="skip-name">Без имени</button>
                </div>
            </form>

            <div class="section">
                <details class="disclosure">
                    <summary>Дополнительные настройки</summary>
                    <p class="muted" style="margin-top: var(--sp-3)">
                        Категории подбираются автоматически. Озвучку вопросов и звуковые
                        подсказки можно включить в профиле.
                    </p>
                </details>
            </div>
        </section>
    `}function ut(){const e=y();return`
        <section>
            ${k("Живой семинар","Введите код ведущего","Код показан на экране в зале.")}
            <form class="stack" data-form="seminar">
                <div class="field">
                    <label for="seminar-code">Код игры</label>
                    <input id="seminar-code" class="code-input" name="code" required maxlength="12"
                           inputmode="latin" autocapitalize="characters" autocomplete="one-time-code"
                           placeholder="ABC123">
                </div>
                <div class="field">
                    <label for="seminar-name">Ваше имя</label>
                    <input id="seminar-name" name="name" required maxlength="20"
                           autocomplete="name" value="${c(e.displayName||"")}">
                </div>
                <button class="button block" type="submit">${i("arrowRight")}Перейти в зал</button>
            </form>
            <div class="section">
                ${E("Если код не подходит, попросите ведущего показать его ещё раз — код меняется для каждой игры.",{tone:"info"})}
            </div>
        </section>
    `}function pt(e){const t=M(p.onboarding,{});return b(p.onboarding,{...t,goal:!0}),e==="seminar"?"/join":`/start/${e}`}function ft(e){const t=e.trim();return t&&Q({...y(),displayName:t}),t}const ht=[{title:"Kahoot",href:"/realtime-host.html",iconName:"users",meta:"Живая викторина с PIN",body:"Создайте комнату на хосте. Участники входят по коду через «Войти в семинар».",participant:"/realtime-player.html"},{title:"Пульс зала",href:"/pulse-host.html",iconName:"pulse",meta:"Анонимный опрос без очков",body:"Вопрос с вариантами или шкала Likert с гистограммой и средним значением.",participant:"/pulse-player.html"},{title:"Live Q&A",href:"/qa-host.html",iconName:"chat",meta:"Вопросы с премодерацией",body:"Модерация и голосование за вопросы на стороне ведущего.",participant:"/qa-player.html"},{title:"Дайджест дня",href:"/seminar-digest.html",iconName:"inbox",meta:"Нужен вход администратора",body:"Сводка квизов, слабых тем, pre/post и Q&A за выбранные даты."},{title:"Heatmap сцены",href:"/stage-heatmap.html",iconName:"activity",meta:"Категории и слабые места",body:"Визуализация для обсуждения на проекторе."},{title:"Админка",href:"/admin.html",iconName:"settings",meta:"Пароль администратора",body:"Вопросы, аналитика, «плохие вопросы», пакетная регистрация."},{title:"QR-слайд",href:"/qr.html",iconName:"target",meta:"На проектор или в чат",body:"Участники сканируют QR и попадают на главную викторины."},{title:"Статус",href:"/status.html",iconName:"activity",meta:"Диагностика на площадке",body:"Здоровье API, сброс кэша, версия сборки."},{title:"Гайд спикера",href:"/guide/speaker",iconName:"note",meta:"Чеклист семинара",body:"Полная инструкция: коды, Kahoot, пульс, Q&A, сценарии."}];function A(e){try{return new URL(e,window.location.origin).href}catch{return e}}function I(e,t){return`
        <div class="copy-row">
            <div class="stack-tight">
                <span class="copy-label">${c(e)}</span>
                <code class="copy-value">${c(t)}</code>
            </div>
            <button class="button secondary" type="button" data-action="copy-link"
                    data-copy="${c(t)}">${i("copy")}Копировать</button>
        </div>
    `}function mt(e){return`
        <article class="card card-lead">
            <span class="card-icon" aria-hidden="true">${i(e.iconName)}</span>
            <div class="stack-tight">
                <span class="card-title">${c(e.title)}</span>
                <span class="card-meta"><span class="badge">${c(e.meta)}</span></span>
                <p class="card-body">${c(e.body)}</p>
                <div class="button-row" style="margin-top: var(--sp-2)">
                    <a class="button" href="${c(e.href)}">${i("external")}Открыть</a>
                    ${e.participant?`<button class="button secondary" type="button" data-action="copy-link"
                                   data-copy="${c(A(e.participant))}">${i("copy")}Ссылка игрока</button>`:""}
                </div>
            </div>
        </article>
    `}function bt(){return`
        <section>
            ${k("Кабинет спикера","Инструменты ведущего","Единая точка входа во все режимы зала и ссылки для участников.")}

            ${E("",{tone:"info",iconName:"presentation",html:"<strong>Как запустить зал:</strong> откройте нужный хост, покажите PIN или QR, затем дайте участникам ссылку из списка ниже."})}

            <div class="section">
                ${g("Ссылки участникам")}
                <div class="stack">
                    ${I("Новый интерфейс (V2)",A("/v2/"))}
                    ${I("Вход в семинар (V2)",A("/v2/join"))}
                    ${I("Классическая главная",A("/"))}
                    ${I("Kahoot-игрок",A("/realtime-player.html"))}
                    ${I("Пульс-игрок",A("/pulse-player.html"))}
                    ${I("Q&A-участник",A("/qa-player.html"))}
                </div>
            </div>

            <div class="section">
                ${g("Хост-инструменты")}
                <div class="stack">
                    ${ht.map(mt).join("")}
                </div>
            </div>

            <div class="section">
                <div class="link-list">
                    <a href="/guide/speaker">${i("note")}<span>Гайд спикера</span><span class="link-arrow">${i("external")}</span></a>
                    <a href="/status.html">${i("activity")}<span>Статус сервиса</span><span class="link-arrow">${i("external")}</span></a>
                    <a href="/v2/" data-route="/">${i("home")}<span>К интерфейсу участника</span><span class="link-arrow">${i("arrowRight")}</span></a>
                </div>
            </div>
        </section>
    `}async function yt(e){var s;if((s=navigator.clipboard)!=null&&s.writeText){await navigator.clipboard.writeText(e);return}const t=document.createElement("textarea");t.value=e,t.setAttribute("readonly",""),t.style.position="fixed",t.style.left="-9999px",document.body.appendChild(t),t.select(),document.execCommand("copy"),t.remove()}const gt=[{value:0,label:"Снова",hint:"Не вспомнил"},{value:3,label:"Трудно",hint:"С трудом"},{value:4,label:"Хорошо",hint:"Уверенно"},{value:5,label:"Легко",hint:"Сразу"}],vt={ethics:"Этика",rights:"Права",care_standards:"Уход",safety:"Безопасность",emergency:"Экстренное",communication:"Коммуникация",documentation:"Документы",quality:"Качество"};async function $t(){const e=y();await S(e.displayName||"");try{a.learn.stats=await qe()}catch{a.learn.stats={total_cards:0,due_today:0,mature_cards:0}}}function wt(){const e=a.learn.stats||{},t=Number(e.due_today||0),s=Number(e.total_cards||0),n=Number(e.mature_cards||0);return`
        <section>
            ${k("Обучение","Закрепляйте знания системно","Интервальные повторения и практика по темам — по алгоритму SM-2.")}

            <div class="stat-grid">
                <div class="stat">
                    <span class="stat-value">${t}</span>
                    <span class="stat-label">к повтору</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${s}</span>
                    <span class="stat-label">в колоде</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${n}</span>
                    <span class="stat-label">закреплено</span>
                </div>
            </div>

            <div class="grid-2" style="margin-top: var(--sp-5)">
                <button class="card card-lead" type="button" data-action="start-review">
                    <span class="card-icon" aria-hidden="true">${i("cards")}</span>
                    <span class="stack-tight">
                        <span class="card-title">Повторение на сегодня</span>
                        <span class="card-body">Карточки по алгоритму SM-2. Новые вопросы добавляются автоматически.</span>
                        <span class="card-meta">
                            <span class="badge ${t?"primary":""}">${t} к повтору</span>
                        </span>
                    </span>
                </button>
                <a class="card card-lead" href="/v2/start/training" data-route="/start/training">
                    <span class="card-icon" aria-hidden="true">${i("learn")}</span>
                    <span class="stack-tight">
                        <span class="card-title">Свободная тренировка</span>
                        <span class="card-body">10 случайных вопросов с пояснениями после каждого ответа.</span>
                        <span class="card-meta"><span class="badge">около 5 минут</span></span>
                    </span>
                </a>
            </div>

            <div class="section">
                ${g("Практика по теме","По 7 вопросов из выбранной категории.")}
                <div class="chip-grid">
                    ${Object.entries(vt).map(([r,o])=>`
                        <button class="chip" type="button" data-action="start-category" data-category="${r}">
                            ${c(o)}
                        </button>
                    `).join("")}
                </div>
            </div>
        </section>
    `}async function kt(){Ee(),a.learn.mode="review";const e=y();await S(e.displayName||"");const t=await Ne(20),s=[...t.due||[],...t.new||[]];if(!s.length)throw new Error("Пока нет карточек. Пройдите тренировку — вопросы попадут в колоду.");a.learn.cards=s,a.learn.index=0,a.learn.finished=!1}function xt(e){const t=e.reviewed?Math.round(e.correct/e.reviewed*100):0;return`
        <section>
            ${k("Повторение","Сессия завершена","Карточки сохранены в расписании повторений.")}
            <div class="score-panel">
                <div class="score-dial" style="--dial:${t}" role="img"
                     aria-label="${e.correct} из ${e.reviewed}">
                    <div class="score-dial-inner">
                        <span class="score-value">${e.correct}/${e.reviewed}</span>
                        <span class="score-unit">${t}% верно</span>
                    </div>
                </div>
            </div>
            <div class="section">
                <div class="stack">
                    <button class="button block" type="button" data-action="start-review">
                        ${i("repeat")}Ещё одна сессия
                    </button>
                    <a class="button secondary" href="/v2/learn" data-route="/learn">${i("arrowLeft")}К обучению</a>
                </div>
            </div>
        </section>
    `}function Mt(){const e=a.learn;if(e.finished)return xt(e);const t=e.cards[e.index];if(!t)return"";const s=(t.options||[]).map((n,r)=>U(n,r,{className:e.feedback?Nt(e.feedback,r):"",disabled:!!e.feedback||a.busy,action:"review-answer"})).join("");return`
        <section>
            ${re(e.index+1,e.cards.length,"Карточка")}
            <article class="question-card">
                <div class="question-head">
                    <span class="badge accent">${c(R(t.category))}</span>
                </div>
                <p class="q-text">${c(t.question)}</p>
                <div class="answers" role="group" aria-label="Варианты ответа">${s}</div>
            </article>
            ${e.feedback?St(e):""}
        </section>
    `}function St(e){return`
        <section class="feedback reveal-panel ${e.feedback.correct?"ok":"error"}" role="status" tabindex="-1">
            <h2 class="verdict">
                ${i(e.feedback.correct?"check":"cross")}${e.feedback.correct?"Верно":"Неверно"}
            </h2>
            <p class="feedback-text">${c(e.feedback.explanation||"Пояснение появится после оценки.")}</p>
            ${e.awaitingQuality?`
                <p class="field-hint">Насколько легко было вспомнить ответ?</p>
                <div class="quality-row">
                    ${gt.map(t=>`
                        <button class="button secondary" type="button"
                                data-action="review-quality" data-quality="${t.value}"
                                title="${c(t.hint)}">${c(t.label)}</button>
                    `).join("")}
                </div>
            `:""}
        </section>
    `}function Nt(e,t){return t===e.correctIndex?"is-correct":t===e.selected&&!e.correct?"is-wrong":""}async function qt(e){if(!(a.busy||a.learn.feedback)){a.busy=!0;try{const t=a.learn.cards[a.learn.index],s=await ae(t.id,e);a.learn.feedback={...s,selected:e},a.learn.awaitingQuality=!0,s.correct&&(a.learn.correct+=1),w(s.correct?"Верно":"Неверно")}finally{a.busy=!1}}}async function At(e){if(!(a.busy||!a.learn.awaitingQuality)){a.busy=!0;try{const t=a.learn.cards[a.learn.index];await Ae(t.id,Number(e)),a.learn.reviewed+=1,a.learn.awaitingQuality=!1,a.learn.feedback=null,a.learn.index+1<a.learn.cards.length?a.learn.index+=1:a.learn.finished=!0}finally{a.busy=!1}}}async function Lt(e){se("category"),a.goal="category";const t=y(),[s]=await Promise.all([te(),S(t.displayName||"")]),n=(s.questions||[]).filter(o=>o.category===e&&Number.isFinite(o.id)&&o.question&&Array.isArray(o.options)&&o.options.length===4);if(!n.length)throw new Error(`В теме «${R(e)}» пока нет вопросов.`);const r=[...n].sort(()=>Math.random()-.5);a.questions=r.slice(0,Math.min(7,r.length)),a.index=0,a.score=0,a.answers=[],a.feedback=null}async function It(){const e=T();if(!e.userId||!e.token){a.profileExtras.certificates=[];return}try{const t=await Ie(e.userId);a.profileExtras.certificates=t.certificates||t||[]}catch{a.profileExtras.certificates=[]}}function Ct(e){if(!e.length)return"";const t=Math.round(e.reduce((n,r)=>n+(r.percentage||0),0)/e.length),s=Math.max(...e.map(n=>n.percentage||0));return`
        <div class="stat-grid">
            <div class="stat">
                <span class="stat-value">${e.length}</span>
                <span class="stat-label">проверок</span>
            </div>
            <div class="stat">
                <span class="stat-value">${t}%</span>
                <span class="stat-label">в среднем</span>
            </div>
            <div class="stat">
                <span class="stat-value">${s}%</span>
                <span class="stat-label">лучший</span>
            </div>
        </div>
    `}function Et(e){return e.length?`
        <div class="section">
            ${g("Последние результаты")}
            <div class="record-list">
                ${e.slice(0,5).map(t=>`
                    <div class="record">
                        <span class="record-score">${t.score}/${t.total}</span>
                        <span class="badge ${t.percentage>=70?"ok":""}">${t.percentage}%</span>
                        <span class="meta">${new Date(t.completedAt).toLocaleDateString("ru-RU")}</span>
                    </div>
                `).join("")}
            </div>
        </div>
    `:""}function Pt(){const e=y(),t=O(),s=M(p.history,[]),n=T(),r=a.profileExtras.certificates||[];return`
        <section>
            ${k("Профиль",e.displayName||"Участник",s.length?"Ваш прогресс в новом интерфейсе и настройки прохождения.":"Пройдите первую проверку — регистрация не обязательна.")}

            ${Ct(s)}
            ${Et(s)}

            <div class="section">
                ${g("Настройки прохождения")}
                <form class="stack" data-form="profile-settings">
                    <div class="field">
                        <label for="profile-name">Как к вам обращаться</label>
                        <input id="profile-name" name="displayName" maxlength="60"
                               autocomplete="name" value="${c(e.displayName||"")}">
                    </div>
                    <label class="check-row">
                        <input type="checkbox" name="tts" ${t.tts?"checked":""}>
                        <span>Озвучивать вопросы, если браузер поддерживает синтез речи</span>
                    </label>
                    <label class="check-row">
                        <input type="checkbox" name="confidencePrompt" ${t.confidencePrompt!==!1?"checked":""}>
                        <span>Спрашивать уверенность перед проверкой ответа</span>
                    </label>
                    <label class="check-row">
                        <input type="checkbox" name="sound" ${t.sound!==!1?"checked":""}>
                        <span>Звуковые подсказки о правильности ответа</span>
                    </label>
                    <button class="button" type="submit">${i("settings")}Сохранить настройки</button>
                </form>
            </div>

            <div class="section">
                ${g("План действия","Коротко зафиксируйте, что примените на работе после обучения.")}
                <form class="stack" data-form="action-plan">
                    <div class="field">
                        <label for="action-plan-text">Мой следующий шаг</label>
                        <textarea id="action-plan-text" name="text" rows="3" maxlength="2000"
                                  placeholder="Например: проверить порядок передачи смены"></textarea>
                    </div>
                    <button class="button secondary" type="submit">${i("note")}Сохранить план</button>
                    ${a.profileExtras.actionPlanSaved?E("План сохранён.",{tone:"ok",iconName:"check"}):""}
                </form>
            </div>

            <div class="section">
                ${g("Сертификаты и аккаунт")}
                <div class="link-list">
                    <a href="/my-certificates.html">
                        ${i("certificate")}<span>Мои сертификаты${r.length?` (${r.length})`:""}</span>
                        <span class="link-arrow">${i("external")}</span>
                    </a>
                    <a href="/register.html">
                        ${i("key")}<span>Регистрация для сертификата</span>
                        <span class="link-arrow">${i("external")}</span>
                    </a>
                    <a href="/status.html">
                        ${i("activity")}<span>Статус сервиса</span>
                        <span class="link-arrow">${i("external")}</span>
                    </a>
                    <a href="/guide/user">
                        ${i("note")}<span>Инструкция участника</span>
                        <span class="link-arrow">${i("external")}</span>
                    </a>
                    <a href="/v2/host" data-route="/host">
                        ${i("presentation")}<span>Кабинет спикера</span>
                        <span class="link-arrow">${i("arrowRight")}</span>
                    </a>
                </div>
                <p class="meta" style="margin-top: var(--sp-4)">
                    Сессия: ${n.userId?"активна":"ещё не создана"}.
                </p>
            </div>
        </section>
    `}function _t(e){const t=String(e.get("displayName")||"").trim();Q({...y(),displayName:t}),$e({tts:e.get("tts")==="on",confidencePrompt:e.get("confidencePrompt")==="on",sound:e.get("sound")==="on"}),t&&S(t).catch(()=>{})}async function Tt(e){const t=y();await S(t.displayName||""),await Le(e),a.profileExtras.actionPlanSaved=!0}function Rt(){var t;const e=new Map;return a.answers.filter(s=>!s.correct).forEach(s=>{e.set(s.category,(e.get(s.category)||0)+1)}),((t=[...e.entries()].sort((s,n)=>n[1]-s[1])[0])==null?void 0:t[0])||null}function Ot(){const e=Math.round(a.score/a.questions.length*100);ve({score:a.score,total:a.questions.length,percentage:e,goal:a.goal,completedAt:new Date().toISOString()});const t=M(p.onboarding,{});b(p.onboarding,{...t,result:!0})}function zt(e){return e>=90?{title:"Отличный результат",text:"Материал освоен уверенно."}:e>=70?{title:"Хороший результат",text:"Осталось закрепить отдельные темы."}:e>=50?{title:"Проверка завершена",text:"Есть темы, которые стоит повторить."}:{title:"Проверка завершена",text:"Рекомендуем пройти тренировку с пояснениями."}}function Vt(){const e=a.questions.length;if(!e)return`
            <section class="state-card">
                <span class="state-icon">${i("inbox")}</span>
                <h1>Результат не найден</h1>
                <p class="muted">Начните новую проверку знаний с главной страницы.</p>
                <a class="button" href="/v2/" data-route="/">${i("home")}На главную</a>
            </section>
        `;const t=Math.round(a.score/e*100),s=Rt(),n=a.answers.filter(d=>!d.correct),{title:r,text:o}=zt(t);return`
        <section>
            ${k("Результат",r,o)}

            <div class="score-panel">
                <div class="score-dial" style="--dial:${t}" role="img"
                     aria-label="${a.score} из ${e}, ${t} процентов">
                    <div class="score-dial-inner">
                        <span class="score-value">${a.score}/${e}</span>
                        <span class="score-unit">${t}% верно</span>
                    </div>
                </div>
                <div class="stat-grid" style="width:100%">
                    <div class="stat">
                        <span class="stat-value">${a.score}</span>
                        <span class="stat-label">верно</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${n.length}</span>
                        <span class="stat-label">ошибок</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${e}</span>
                        <span class="stat-label">вопросов</span>
                    </div>
                </div>
            </div>

            ${a.lastError?E("Результат показан, но сервер не смог его сохранить. Локальная история сохранена.",{tone:"err",iconName:"alert"}):""}

            ${s?`<div style="margin-top: var(--sp-4)">${E(`Стоит повторить тему «${R(s)}».`,{tone:"info",iconName:"target"})}</div>`:""}

            <div class="section">
                ${g("Что дальше")}
                <div class="stack">
                    ${n.length?`<button class="button block" type="button" data-action="retry-errors">${i("repeat")}Повторить ошибки (${n.length})</button>`:`<a class="button block" href="/v2/cases" data-route="/cases">${i("cases")}Перейти к кейсам</a>`}
                    <div class="button-row">
                        <a class="button secondary" href="/v2/learn" data-route="/learn">${i("learn")}К обучению</a>
                        <a class="button secondary" href="/v2/" data-route="/">Другой режим</a>
                    </div>
                </div>
            </div>

            <div class="section">
                <details class="disclosure">
                    <summary>Посмотреть все ответы (${a.answers.length})</summary>
                    <ul class="review-list">
                        ${a.answers.map(d=>`
                            <li class="review-item ${d.correct?"ok":"err"}">
                                ${i(d.correct?"check":"cross")}
                                <div>
                                    <span>${c(d.question)}</span>
                                    <span class="card-meta">${c(R(d.category))}</span>
                                </div>
                            </li>
                        `).join("")}
                    </ul>
                </details>
            </div>
        </section>
    `}const V=document.querySelector("#app"),Ht=document.querySelector("#offline-banner"),Z=document.querySelector("#session-banner");function jt(e){return e==="/"?Y():e==="/join"?ut():e.startsWith("/start/")?dt(e.split("/").at(-1)):e==="/quiz"?a.questions.length?Be():Y():e==="/result"?Vt():e==="/learn"?wt():e==="/learn/review"?Mt():e==="/cases"?a.cases.current?at():de():e==="/profile"||e==="/me"?Pt():e==="/host"?bt():ce("Такой страницы в V2 пока нет.","На главную",{home:!0})}function l({focus:e=!0}={}){var s;const t=P();if(V.innerHTML=B(jt(t),t),e){const n=document.querySelector("#main");n==null||n.focus({preventScroll:!0})}w(((s=document.querySelector("h1"))==null?void 0:s.textContent)||"Страница обновлена"),t==="/quiz"&&Ke()}function L(e){V.innerHTML=B(ie(e),P())}function m(e,t){var s;a.lastError=e,V.innerHTML=B(ce(e.message||"Неизвестная ошибка"),P()),(s=V.querySelector('[data-action="retry"]'))==null||s.addEventListener("click",t,{once:!0})}async function F(e,t=""){ft(t),se(e),$("/quiz",{silent:!0}),L("Готовим вопросы");try{await He(),l()}catch(s){m(s,()=>F(e,t))}}async function ue(){if(a.learn.stats){l();return}L("Открываем обучение");try{await $t(),l()}catch(e){m(e,ue)}}async function H(){if(a.cases.list!==null||a.cases.current){l();return}L("Загружаем кейсы");try{await Ye(),l()}catch(e){m(e,H)}}async function pe(){L("Открываем профиль");try{await It(),l()}catch(e){m(e,pe)}}async function fe(){const e=P();return e==="/learn"&&!a.learn.stats?(await ue(),!0):e==="/cases"&&a.cases.list===null&&!a.cases.current?(await H(),!0):(e==="/profile"||e==="/me")&&a.profileExtras.certificates===null?(await pe(),!0):!1}document.addEventListener("click",async e=>{var o,d,f,v,_,N,J;const t=(o=e.target.closest("[data-goal]"))==null?void 0:o.dataset.goal;if(t){$(pt(t));return}const s=e.target.closest("[data-answer]");if(s&&!s.dataset.action){try{const u=Number(s.dataset.answer);if(We(u)){l({focus:!1}),(f=(d=document.querySelector(".confidence-prompt"))==null?void 0:d.focus)==null||f.call(d);return}await le(u),l({focus:!1}),(_=(v=document.querySelector(".feedback"))==null?void 0:v.focus)==null||_.call(v)}catch(u){m(u,l)}return}const n=e.target.closest("[data-action]"),r=n==null?void 0:n.dataset.action;if(r){if(r==="skip-name"){const u=P().split("/").at(-1);await F(u)}if(r==="next-question"&&(await Xe()&&(Ot(),$("/result",{silent:!0})),l()),r==="confirm-answer")try{await Je(n.dataset.confidence||null),l({focus:!1}),(J=(N=document.querySelector(".feedback"))==null?void 0:N.focus)==null||J.call(N)}catch(u){m(u,l)}if(r==="retry-errors"){const u=new Set(a.answers.filter(x=>!x.correct).map(x=>x.questionId));a.questions=a.questions.filter(x=>u.has(x.id)),a.index=0,a.score=0,a.answers=[],a.pendingAnswer=null,a.feedback=null,a.lastError=null,$("/quiz",{silent:!0}),l()}if(r==="start-review"){$("/learn/review",{silent:!0}),L("Готовим карточки");try{await kt(),l()}catch(u){m(u,()=>{$("/learn")})}}if(r==="start-category"){const u=n.dataset.category;$("/quiz",{silent:!0}),L("Готовим практику по теме");try{await Lt(u),l()}catch(x){m(x,()=>$("/learn"))}}if(r==="review-answer")try{await qt(Number(n.dataset.answer)),l({focus:!1})}catch(u){m(u,l)}if(r==="review-quality")try{await At(Number(n.dataset.quality)),l()}catch(u){m(u,l)}if(r==="open-case"){const u=n.dataset.caseId;$("/cases",{silent:!0}),L("Открываем кейс");try{await Ze(u),l()}catch(x){m(x,H)}}if(r==="case-answer")try{await nt(Number(n.dataset.answer)),l({focus:!1})}catch(u){m(u,l)}if(r==="case-next"&&(await rt(),l()),r==="back-cases"&&(it(),a.cases.list===null?await H():l()),r==="copy-link")try{await yt(n.dataset.copy||""),w("Ссылка скопирована");const u=n.innerHTML;n.innerHTML=`${i("check")}Скопировано`,window.setTimeout(()=>{n.innerHTML=u},1600)}catch{w("Не удалось скопировать")}}});document.addEventListener("submit",async e=>{const t=e.target;if(t.dataset.form==="identity"){e.preventDefault();const s=P().split("/").at(-1);await F(s,new FormData(t).get("displayName")||"")}if(t.dataset.form==="seminar"){e.preventDefault();const s=new FormData(t),n=String(s.get("code")||"").trim().toUpperCase(),r=String(s.get("name")||"").trim();Q({displayName:r}),localStorage.setItem("glm_game_id",n),localStorage.setItem("glm_player_name",r),window.location.assign("/realtime-player.html")}if(t.dataset.form==="profile-settings"&&(e.preventDefault(),_t(new FormData(t)),w("Настройки сохранены"),l({focus:!1})),t.dataset.form==="action-plan"){e.preventDefault();const s=String(new FormData(t).get("text")||"").trim();if(s.length<3){w("Опишите план чуть подробнее");return}try{await Tt(s),l({focus:!1}),w("План действия сохранён")}catch(n){m(n,l)}}});function W(){Ht.hidden=navigator.onLine}window.addEventListener("online",W);window.addEventListener("offline",W);window.addEventListener("glm:auth-expired",()=>{Z.hidden=!1,w("Сессия истекла. Создаём новую гостевую сессию."),window.setTimeout(()=>{Z.hidden=!0},5e3)});window.addEventListener("error",e=>{e.error instanceof j||console.error(e.error)});he();Ce(()=>{fe().then(e=>{e||l()})});W();fe().then(e=>{e||l({focus:!1})});
//# sourceMappingURL=index-BHYVVbYf.js.map
