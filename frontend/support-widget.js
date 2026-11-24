// Customer chat uses same-origin, authenticated Studio APIs only.
async function startSupportWidget() {
  let session;
  try {
    const r=await fetch('/api/auth/session',{credentials:'same-origin'});
    if(!r.ok)return;session=await r.json();
    if(!session.authenticated||!session.user?.id)return;
  }catch{return;}
  if(document.getElementById('qual-support-widget'))return;
  const host=document.createElement('div');host.id='qual-support-widget';document.body.append(host);
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<link rel="stylesheet" href="/frontend/support-widget.css?v=human-handoff-1"><section id="panel" role="dialog" aria-label="Qual AI support assistant" hidden><header><div><strong>Qual AI support</strong><small id="mode">AI assistance · Human help available</small></div><button id="close" aria-label="Close support chat">×</button></header><div id="log" role="log" aria-live="polite"></div><div id="notice" class="notice" role="status" hidden></div><div id="error" class="notice" role="alert" hidden></div><form><label for="text">How can we help?</label><textarea id="text" maxlength="6000" placeholder="Tell us what you’re trying to do…" required></textarea><footer><small>Leave out passwords and participant data.</small><button id="send" type="submit">Send</button></footer></form><div id="handoff"><button id="human" type="button">Talk to a human</button><small>No guaranteed response time. You can keep working.</small></div><div id="links"><a href="/support">Support request form</a><button id="fresh">New conversation</button></div></section><button id="launcher" aria-expanded="false" aria-controls="panel">Get help</button>`;
  const $=id=>root.getElementById(id);let conversation=null,pending=null,opened=false,busy=false,polling=false,signature='';
  const storageKey='qual-support-'+session.user.id;
  function bubble(role,text){const b=document.createElement('div');b.className='bubble '+role;const label=document.createElement('strong');label.className='speaker';label.textContent=role==='support'?'Support specialist':role==='user'?'You':'Qual AI assistant';b.append(label,document.createTextNode(text));$('log').append(b);}
  function issue(text){$('error').textContent=text;$('error').hidden=false;}
  async function api(path,body){const r=await fetch('/api/support-chat/'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});let d;try{d=await r.json();}catch{throw new Error('Support chat is temporarily unavailable. Please use the support request form.');}if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Support chat is temporarily unavailable.');return d;}
  function render(d){
    const next=JSON.stringify(d.messages);
    if(next!==signature){const log=$('log'),top=log.scrollTop,bottom=log.scrollHeight-top-log.clientHeight<70;log.replaceChildren();for(const m of d.messages)bubble(m.role,m.content);if(!d.messages.length)bubble('assistant','Hi! I can help with Qual AI. If we cannot resolve the issue, you can request a human below.');signature=next;log.scrollTop=bottom?log.scrollHeight:top;}
    const state=d.handoff_state||'none';
    $('mode').textContent=state==='requested'?'Waiting for human support · AI paused':state==='active'?'Human support joined · AI paused':state==='resolved'?'Conversation resolved':'AI assistance · Human help available';
    $('human').disabled=busy||['requested','active'].includes(state);
    $('human').textContent=state==='requested'?'Human support requested':state==='active'?'Connected to support':'Talk to a human';
    $('notice').hidden=!d.ticket_id;
    $('notice').textContent=d.ticket_id?`${d.ticket_id} · ${state==='requested'?'No one has joined yet. Replies will appear here.':state==='active'?'You are chatting with human support.':state==='resolved'?'Resolved. Reply to reopen with human support.':'Saved for support review.'}`:'';
  }
  async function sync(){if(!conversation)return;const id=conversation;const d=await api('conversations/'+encodeURIComponent(id));if(conversation===id)render(d);}
  async function fresh(){const r=await api('conversations',{});conversation=r.id;pending=null;signature='';sessionStorage.setItem(storageKey,conversation);render({messages:[],handoff_state:'none'});}
  function close(){$('panel').hidden=true;$('launcher').setAttribute('aria-expanded','false');$('launcher').focus();}
  $('close').onclick=close;
  $('launcher').onclick=async()=>{if(!$('panel').hidden){close();return;}$('panel').hidden=false;$('launcher').setAttribute('aria-expanded','true');$('text').focus();if(opened){sync().catch(e=>issue(e.message));return;}opened=true;try{const saved=sessionStorage.getItem(storageKey);if(saved){conversation=saved;try{await sync();}catch{await fresh();}}else await fresh();}catch(e){issue(e.message);opened=false;}};
  root.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  $('fresh').onclick=()=>fresh().catch(e=>issue(e.message));
  async function send(message,human=false){
    if(busy)return;busy=true;$('send').disabled=true;$('fresh').disabled=true;$('human').disabled=true;$('error').hidden=true;
    try{if(!conversation)await fresh();const body=pending&&pending.message===message&&pending.request_human===human?pending:{conversation_id:conversation,request_id:crypto.randomUUID(),message,request_human:human};pending=body;await api('messages',body);pending=null;if(!human)$('text').value='';await sync();}
    catch(e){issue(e.message);}finally{busy=false;$('send').disabled=false;$('fresh').disabled=false;await sync().catch(()=>{});$('text').focus();}
  }
  root.querySelector('form').onsubmit=e=>{e.preventDefault();const text=$('text').value.trim();if(text)send(text);};
  $('human').onclick=()=>send('I would like to talk to a human support specialist.',true);
  setInterval(async()=>{if(document.hidden||$('panel').hidden||busy||polling||!conversation)return;polling=true;try{await sync();}catch(e){issue('Chat connection interrupted. Retrying automatically; your conversation is saved.');}finally{polling=false;}},4000);
}
startSupportWidget();
