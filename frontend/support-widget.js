// Customer chat uses same-origin, authenticated Studio APIs only.
async function startSupportWidget() {
  let session;
  try {
    const r = await fetch('/api/auth/session', {credentials:'same-origin'});
    if (!r.ok) return;
    session = await r.json();
    if (!session.authenticated || !session.user?.id) return;
  } catch { return; }
  if (document.getElementById('qual-support-widget')) return;
  const host=document.createElement('div');host.id='qual-support-widget';document.body.append(host);
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<link rel="stylesheet" href="/frontend/support-widget.css?v=customer-agent-1"><section id="panel" role="dialog" aria-label="Qual AI support assistant" hidden><header><div><strong>Qual AI support</strong><small>Questions, troubleshooting, and tickets</small></div><button id="close" aria-label="Close support chat">×</button></header><div id="log" role="log" aria-live="polite"></div><div id="notice" class="notice" role="status" hidden></div><div id="error" class="notice" role="alert" hidden></div><form><label for="text">How can we help?</label><textarea id="text" maxlength="6000" placeholder="Tell us what you’re trying to do…" required></textarea><footer><small>Leave out passwords and participant data.</small><button id="send" type="submit">Send</button></footer></form><div id="links"><a href="/support">Support request form</a><button id="fresh">New conversation</button></div></section><button id="launcher" aria-expanded="false" aria-controls="panel">Get help</button>`;
  const $=id=>root.getElementById(id);let conversation=null,pending=null,opened=false;
  const storageKey='qual-support-'+session.user.id;
  function bubble(role,text){const b=document.createElement('div');b.className='bubble '+role;b.textContent=text;$('log').append(b);$('log').scrollTop=$('log').scrollHeight;}
  function issue(text){$('error').textContent=text;$('error').hidden=false;}
  async function api(path,body){const r=await fetch('/api/support-chat/'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});let d;try{d=await r.json();}catch{throw new Error('Support chat is temporarily unavailable. Please use the support request form.');}if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Support chat is temporarily unavailable.');return d;}
  async function fresh(){const r=await api('conversations',{});conversation=r.id;pending=null;sessionStorage.setItem(storageKey,conversation);$('log').replaceChildren();$('notice').hidden=true;bubble('assistant','Hi! I can help with Qual AI or create a ticket for support. What are you trying to do?');}
  function close(){ $('panel').hidden=true;$('launcher').setAttribute('aria-expanded','false');$('launcher').focus();}
  $('close').onclick=close;
  $('launcher').onclick=async()=>{if(!$('panel').hidden){close();return;}$('panel').hidden=false;$('launcher').setAttribute('aria-expanded','true');$('text').focus();if(opened)return;opened=true;try{const saved=sessionStorage.getItem(storageKey);if(saved){try{const d=await api('conversations/'+encodeURIComponent(saved));conversation=saved;for(const m of d.messages)bubble(m.role,m.content);if(!d.messages.length)bubble('assistant','Hi! What can I help you with?');if(d.ticket_id){$('notice').textContent='Linked support ticket: '+d.ticket_id;$('notice').hidden=false;}}catch{await fresh();}}else await fresh();}catch(e){issue(e.message);opened=false;}};
  root.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  $('fresh').onclick=()=>fresh().catch(e=>issue(e.message));
  root.querySelector('form').onsubmit=async e=>{e.preventDefault();const message=$('text').value.trim();if(!message)return;$('send').disabled=true;$('fresh').disabled=true;$('error').hidden=true;try{if(!conversation)await fresh();const body=pending&&pending.message===message?pending:{conversation_id:conversation,request_id:crypto.randomUUID(),message};pending=body;const d=await api('messages',body);bubble('user',message);bubble('assistant',d.answer);pending=null;$('text').value='';if(d.ticket_notice){$('notice').textContent=d.ticket_notice;$('notice').hidden=false;}}catch(e){issue(e.message);}finally{$('send').disabled=false;$('fresh').disabled=false;$('text').focus();}};
}
startSupportWidget();
