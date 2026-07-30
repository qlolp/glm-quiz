/**
 * GLM Quiz — moderated Live Q&A WebSocket test
 * Usage: BASE_URL=http://147.45.174.206 node tests/qa-ws.test.cjs
 */
const BASE_URL=process.env.BASE_URL||'http://localhost:3000',WS_URL=BASE_URL.replace(/^http/,'ws'),TIMEOUT=8000;
let passed=0,failed=0;
function assert(ok,msg){ok?(passed++,console.log(`  ✅ ${msg}`)):(failed++,console.log(`  ❌ ${msg}`))}
class Client{
    constructor(name){this.name=name;this.messages=[];this.waiters=[];this.ws=new WebSocket(WS_URL);this.ready=new Promise((resolve,reject)=>{this.ws.addEventListener('open',()=>resolve(this));this.ws.addEventListener('error',()=>reject(new Error(`${name} socket error`)))});this.ws.addEventListener('message',event=>{let data;try{data=JSON.parse(event.data)}catch(e){return}this.messages.push(data);this.waiters=this.waiters.filter(w=>{if(w.match(data)){w.resolve(data);return false}return true})})}
    send(data){this.ws.send(JSON.stringify(data))}
    waitFor(type,extra=()=>true){const match=m=>m.type===type&&extra(m),old=this.messages.find(match);if(old)return Promise.resolve(old);return new Promise((resolve,reject)=>{const waiter={match,resolve};this.waiters.push(waiter);setTimeout(()=>{this.waiters=this.waiters.filter(w=>w!==waiter);reject(new Error(`${this.name}: timeout waiting for ${type}`))},TIMEOUT)})}
    close(){try{this.ws.close()}catch(e){}}
}
async function run(){
    console.log(`\n🧪 GLM Quiz Q&A WS Tests\nBase: ${WS_URL}\n`);
    const host=new Client('host');await host.ready;host.send({type:'qa_create'});const created=await host.waitFor('qa_created');
    assert(!!created.qa_id&&!!created.host_token,'Host receives Q&A code and token');
    const player=new Client('player');await player.ready;player.send({type:'qa_join',qa_id:created.qa_id});const joined=await player.waitFor('qa_joined');
    assert(!!joined.player_token,'Player receives stable anonymous token');
    player.send({type:'qa_submit',qa_id:created.qa_id,text:'<img src=x onerror=alert(1)> Вопрос?'});
    const ack=await player.waitFor('qa_submit_ack');assert(!!ack.question_id,'Anonymous question accepted for moderation');
    const pending=await host.waitFor('qa_host_state',m=>m.questions?.some(q=>q.id===ack.question_id));
    const pendingQuestion=pending.questions.find(q=>q.id===ack.question_id);
    assert(pendingQuestion.status==='pending'&&pendingQuestion.text.includes('&lt;img'),'Pending question is escaped and visible to host');
    const preApprovalStates=player.messages.filter(m=>m.type==='qa_state');
    assert(!preApprovalStates.some(m=>m.questions?.some(q=>q.id===ack.question_id)),'Pending question hidden from audience');
    host.send({type:'qa_approve',qa_id:created.qa_id,question_id:ack.question_id});
    const approved=await player.waitFor('qa_state',m=>m.questions?.some(q=>q.id===ack.question_id));
    assert(approved.questions[0].status==='approved','Approved question published');
    player.send({type:'qa_upvote',qa_id:created.qa_id,question_id:ack.question_id});
    const vote=await player.waitFor('qa_upvote_ack',m=>m.question_id===ack.question_id);
    assert(vote.votes===1,'First upvote counted');
    player.send({type:'qa_upvote',qa_id:created.qa_id,question_id:ack.question_id});
    const duplicate=await player.waitFor('qa_upvote_ack',m=>m.already_voted===true);
    assert(duplicate.votes===1,'Duplicate upvote rejected');
    host.send({type:'qa_highlight',qa_id:created.qa_id,question_id:ack.question_id});
    const highlighted=await player.waitFor('qa_state',m=>m.highlighted_id===ack.question_id);
    assert(highlighted.questions.find(q=>q.id===ack.question_id).highlighted,'Host highlight broadcast');
    host.close();
    await new Promise(r=>setTimeout(r,300));
    const hostB=new Client('host-reconnect');await hostB.ready;hostB.send({type:'qa_reconnect_host',qa_id:created.qa_id,host_token:created.host_token});
    const reconnected=await hostB.waitFor('qa_host_reconnected');assert(reconnected.qa_id===created.qa_id,'Host reconnects to same Q&A');
    const restored=await hostB.waitFor('qa_host_state');assert(restored.questions.some(q=>q.id===ack.question_id&&q.votes===1),'Reconnect restores questions and votes');
    hostB.send({type:'qa_close',qa_id:created.qa_id});await Promise.all([player.waitFor('qa_closed'),hostB.waitFor('qa_closed')]);assert(true,'Host closes Q&A for host and audience');
    player.close();hostB.close();
    console.log(`\n📊 Q&A WS results: ${passed} passed, ${failed} failed`);process.exit(failed?1:0);
}
run().catch(error=>{console.error('Q&A WS test error:',error.message);process.exit(1)});
