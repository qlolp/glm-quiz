/**
 * GLM Quiz — Kahoot classic/accuracy scoring test
 * Usage: BASE_URL=http://147.45.174.206 ADMIN_PASSWORD=... node tests/kahoot-scoring-ws.test.cjs
 */
const BASE_URL=process.env.BASE_URL||'http://localhost:3000',WS_URL=BASE_URL.replace(/^http/,'ws'),ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||(console.error('Set ADMIN_PASSWORD'),process.exit(1)),TIMEOUT=12000;
let passed=0,failed=0;
function assert(ok,msg){ok?(passed++,console.log(`  ✅ ${msg}`)):(failed++,console.log(`  ❌ ${msg}`))}
class Client{
    constructor(name){this.name=name;this.messages=[];this.waiters=[];this.ws=new WebSocket(WS_URL);this.ready=new Promise((resolve,reject)=>{this.ws.addEventListener('open',()=>resolve(this));this.ws.addEventListener('error',()=>reject(new Error(`${name} socket error`)))});this.ws.addEventListener('message',event=>{let d;try{d=JSON.parse(event.data)}catch(e){return}this.messages.push(d);this.waiters=this.waiters.filter(w=>{if(w.match(d)){w.resolve(d);return false}return true})})}
    send(d){this.ws.send(JSON.stringify(d))}
    waitFor(type,extra=()=>true){const match=m=>m.type===type&&extra(m),old=this.messages.find(match);if(old)return Promise.resolve(old);return new Promise((resolve,reject)=>{const w={match,resolve};this.waiters.push(w);setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==w);reject(new Error(`${this.name}: timeout ${type}`))},TIMEOUT)})}
    close(){try{this.ws.close()}catch(e){}}
}
async function answers(){
    const auth=await fetch(`${BASE_URL}/api/auth/admin`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:ADMIN_PASSWORD})});
    const {token}=await auth.json();const res=await fetch(`${BASE_URL}/api/default-questions`,{headers:{Authorization:`Bearer ${token}`}});
    const data=await res.json();return new Map(data.questions.map(q=>[q.id,q.correct_answer??q.correct]));
}
async function runMode(scoring,names){
    const host=new Client(`${scoring}-host`);await host.ready;host.send({type:'create_game',host_id:`test-${scoring}`,scoring});const created=await host.waitFor('game_created');
    const players=[];
    for(const name of names){const p=new Client(name);await p.ready;p.send({type:'join_game',game_id:created.game_id,player_name:name,team_name:'Команда'});const joined=await p.waitFor('joined');players.push({client:p,id:joined.player_id})}
    host.send({type:'start_game',game_id:created.game_id});const q=await host.waitFor('new_question');const correct=answerMap.get(q.question.id);
    for(let i=0;i<players.length;i++){if(i)await new Promise(r=>setTimeout(r,450));players[i].client.send({type:'submit_answer',game_id:created.game_id,player_id:players[i].id,answer:correct})}
    const pointResults=await Promise.all(players.map(p=>p.client.waitFor('answer_result')));
    const reveal=await host.waitFor('answer_reveal');
    players.forEach(p=>p.client.close());host.close();return {created,pointResults,reveal};
}
let answerMap;
async function run(){
    console.log(`\n🧪 GLM Quiz Kahoot Scoring Tests\nBase: ${WS_URL}\n`);answerMap=await answers();
    const accuracy=await runMode('accuracy',['Точный 1','Точный 2']);
    assert(accuracy.created.scoring==='accuracy','Accuracy mode stored on room');
    assert(accuracy.pointResults.every(r=>r.points===1000),'Accuracy awards fixed 1000 regardless of response time');
    assert(accuracy.reveal.leaderboard.every(p=>p.score===1000),'Accuracy personal leaderboard correct');
    assert(accuracy.reveal.team_leaderboard[0].score===2000,'Accuracy team leaderboard sums fixed points');
    const classic=await runMode('classic',['Классик']);
    assert(classic.created.scoring==='classic','Classic mode remains default contract');
    assert(classic.pointResults[0].points>1000,'Classic still awards time bonus');
    const packHost=new Client('pack-host');await packHost.ready;packHost.send({type:'create_game',host_id:'test-pack'});const packCreated=await packHost.waitFor('game_created');
    packHost.send({type:'start_game',game_id:packCreated.game_id,pack_id:'nutrition'});
    const packQ=await packHost.waitFor('new_question');
    assert(packQ.question&&packQ.question.id===301,'Nutrition pack starts with first curated question');
    packHost.close();
    console.log(`\n📊 Kahoot scoring results: ${passed} passed, ${failed} failed`);process.exit(failed?1:0);
}
run().catch(error=>{console.error('Kahoot scoring test error:',error.message);process.exit(1)});
