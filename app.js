import {PLC,ADDRESSES,LABELS,templates,validateProgram,sampleProgram} from './engine.js';
import {PlantView} from './scene.js';

const $=id=>document.getElementById(id),plc=new PLC();
const inputs=['X0','X1','X2','X3','X4'],outputs=['M0','Y0','Y1','Y2'];
const escape=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let running=false,view=null,logs=['Hệ sẵn sàng · chạy mô phỏng và nhấn Start'];
try{view=new PlantView($('scene'))}catch(err){console.error(err);$('scene').querySelector('.scene-fallback').hidden=false}

function pulse(addr,value=true){plc.inputs[addr]=value;runScan(100);setTimeout(()=>{plc.inputs[addr]=!value;refresh()},260)}
function appendLogs(entries){for(const line of entries)logs.unshift(`#${String(plc.scanCount).padStart(5,'0')}  ${line}`);logs=logs.slice(0,6);$('event-log').innerHTML=logs.map(x=>`<div class="log-item">${escape(x)}</div>`).join('')}
function runScan(dt=100){appendLogs(plc.scan(dt));refresh()}
function setRunning(next){running=next;$('play-btn').textContent=running?'Ⅱ Tạm dừng':'▶ Chạy mô phỏng';$('run-status').textContent=running?'PLC đang RUN':'Đang tạm dừng';$('run-dot').classList.toggle('on',running)}
function signalList(list,id){$(id).innerHTML=list.map(a=>`<div class="signal-row" data-signal="${a}"><code>${a}</code><span class="sig-name">${LABELS[a]}</span><i class="signal-dot"></i><span class="sig-state">OFF</span></div>`).join('')}
signalList(inputs,'input-list');signalList(outputs,'output-list');
$('io-map').innerHTML=[...inputs,...outputs].map(a=>`<div class="io-row" data-io="${a}"><code>${a}</code><span>${LABELS[a]}</span><i></i></div>`).join('');

function refresh(){
  $('scan-label').textContent=`Scan ${String(plc.scanCount).padStart(5,'0')}`;
  for(const a of [...inputs,...outputs]){
    const on=plc.value(a),row=document.querySelector(`[data-signal="${a}"]`),io=document.querySelector(`[data-io="${a}"]`);
    row?.classList.toggle('on',on);if(row)row.querySelector('.sig-state').textContent=on?'ON':'OFF';io?.querySelector('i')?.classList.toggle('on',on);
  }
  $('input-count').textContent=`${inputs.filter(a=>plc.value(a)).length}/5 ON`;
  const cp=plc.preset('counter'),tp=plc.preset('timer');
  $('counter-value').innerHTML=`${plc.counter.value} <span>/ ${cp}</span>`;
  $('counter-meter').style.width=`${Math.min(100,plc.counter.value/cp*100)}%`;
  $('timer-value').innerHTML=`${(plc.timer.elapsed/1000).toFixed(1)} <span>/ ${(tp/1000).toFixed(1)} s</span>`;
  $('timer-meter').style.width=`${Math.min(100,plc.timer.elapsed/tp*100)}%`;
  $('estop-btn').classList.toggle('latched',!plc.inputs.X4);
  document.querySelectorAll('.rung').forEach((el,i)=>{
    const state=plc.rungState[i];el.classList.toggle('active',!!state?.on);
    el.querySelectorAll('.contact').forEach(node=>node.classList.toggle('powered',!!state?.contacts[Number(node.dataset.branch)]?.[Number(node.dataset.contact)]));
    el.querySelector('.coil')?.classList.toggle('on',!!state?.on);
    const live=el.querySelector('.rung-live');if(live){live.textContent=state?.on?'TRUE · có điện':'FALSE · mất điện';live.classList.toggle('active-text',!!state?.on)}
  });
  view?.update(plc);
}

const addrOptions=current=>ADDRESSES.map(a=>`<option value="${a}" ${a===current?'selected':''}>${a}</option>`).join('');
function targetOptions(r){const opts=r.kind==='coil'?['M0','Y0','Y1','Y2']:r.kind==='timer'?['T0']:['C0'];return opts.map(o=>`<option value="${o}" ${o===r.target?'selected':''}>${o}</option>`).join('')}
function contactHTML(c,bi,ci){return `<span class="contact-wrap"><span class="contact" data-branch="${bi}" data-contact="${ci}"><select data-change="addr" aria-label="Địa chỉ tiếp điểm">${addrOptions(c.addr)}</select><button type="button" class="contact-toggle" data-action="toggle-nc" title="Đổi NO / NC">${c.nc?'—/—  NC':'—| |— NO'}</button></span><button class="contact-delete" data-action="remove-contact" title="Xóa tiếp điểm" aria-label="Xóa tiếp điểm">×</button></span>`}
function rungHTML(r,i){
  const kindLabel={coil:'COIL',timer:'TON',counter:'CTU',reset:'RES'}[r.kind];
  const branches=r.branches.map((branch,bi)=>`<div class="branch" data-branch="${bi}">${bi?'<span class="branch-sep">OR</span>':''}${branch.map((c,ci)=>contactHTML(c,bi,ci)).join('')}<button class="branch-action" data-action="add-contact" title="Thêm tiếp điểm AND">+ AND</button></div>`).join('');
  const preset=r.kind==='timer'?`<input class="preset-input" type="number" min="100" max="10000" step="100" value="${r.preset}" data-change="preset" aria-label="Thời gian timer mili giây"> ms`:r.kind==='counter'?`<input class="preset-input" type="number" min="1" max="99" step="1" value="${r.preset}" data-change="preset" aria-label="Số kiện cần đếm"> kiện`:'';
  return `<article class="rung" data-rung="${i}"><div class="rung-top"><div class="rung-title"><span class="rung-index">${String(i+1).padStart(2,'0')}</span><span class="rung-name">${escape(r.name)}</span></div><div class="rung-actions"><button data-action="move-up" aria-label="Đưa rung lên">↑</button><button data-action="move-down" aria-label="Đưa rung xuống">↓</button><button data-action="remove-rung" aria-label="Xóa rung">Xóa</button></div></div><div class="ladder-line"><i class="rail-vertical"></i><div class="branches">${branches}</div><span class="wire"></span><div class="coil"><label>${kindLabel}</label><select class="target-select" data-change="target" aria-label="Địa chỉ cuộn dây">${targetOptions(r)}</select><span class="meta">${r.kind==='coil'?'( )':r.kind==='timer'?'trễ mở':r.kind==='counter'?'cạnh lên':'xóa'}</span></div><i class="rail-vertical"></i></div><div class="rung-bottom"><button class="branch-action" data-action="add-branch">+ Nhánh OR</button><span>${preset}</span><span class="rung-live">FALSE · mất điện</span></div></article>`;
}
function renderProgram(){
  $('rungs').innerHTML=plc.program.map(rungHTML).join('');$('rung-count').textContent=`${plc.program.length} rungs`;
  refresh();
}
function changed(){try{plc.program=validateProgram(plc.program);$('program-note').textContent='Chương trình đã chỉnh · có hiệu lực ở scan tiếp theo';renderProgram()}catch(e){alert(e.message)}}

$('rungs').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-action]');if(!btn)return;
  const root=btn.closest('.rung'),i=Number(root.dataset.rung),r=plc.program[i],action=btn.dataset.action;
  const branch=btn.closest('.branch'),contact=btn.closest('.contact-wrap')?.querySelector('.contact');
  if(action==='toggle-nc')r.branches[Number(contact.dataset.branch)][Number(contact.dataset.contact)].nc=!r.branches[Number(contact.dataset.branch)][Number(contact.dataset.contact)].nc;
  if(action==='remove-contact'){const b=r.branches[Number(contact.dataset.branch)];if(b.length>1)b.splice(Number(contact.dataset.contact),1);else if(r.branches.length>1)r.branches.splice(Number(contact.dataset.branch),1);else return}
  if(action==='add-contact'){const b=r.branches[Number(branch.dataset.branch)];if(b.length>=5){alert('Tối đa 5 tiếp điểm mỗi nhánh.');return}b.push({addr:'X2',nc:false})}
  if(action==='add-branch'){if(r.branches.length>=4){alert('Tối đa 4 nhánh song song.');return}r.branches.push([{addr:'X2',nc:false}])}
  if(action==='move-up'&&i>0)[plc.program[i-1],plc.program[i]]=[plc.program[i],plc.program[i-1]];
  if(action==='move-down'&&i<plc.program.length-1)[plc.program[i+1],plc.program[i]]=[plc.program[i],plc.program[i+1]];
  if(action==='remove-rung'){if(plc.program.length===1)return;plc.program.splice(i,1)}
  changed();
});
$('rungs').addEventListener('change',e=>{
  const el=e.target,r=plc.program[Number(el.closest('.rung').dataset.rung)];
  if(el.dataset.change==='addr'){const node=el.closest('.contact');r.branches[Number(node.dataset.branch)][Number(node.dataset.contact)].addr=el.value}
  if(el.dataset.change==='target')r.target=el.value;
  if(el.dataset.change==='preset')r.preset=Number(el.value);
  changed();
});
for(const kind of ['coil','timer','counter'])$(`add-${kind}`).addEventListener('click',()=>{if(plc.program.length>=24){alert('Tối đa 24 rungs.');return}plc.program.push({...templates[kind](),id:`r${Date.now()}`});changed();$('rungs').lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'})});

$('play-btn').addEventListener('click',()=>setRunning(!running));
$('step-btn').addEventListener('click',()=>{setRunning(false);runScan(100)});
$('plant-reset').addEventListener('click',()=>{setRunning(false);plc.reset();logs=['Hệ đã đặt lại'];appendLogs([]);renderProgram()});
$('camera-reset').addEventListener('click',()=>view?.resetCamera());
$('start-btn').addEventListener('click',()=>pulse('X0',true));
$('stop-btn').addEventListener('click',()=>pulse('X1',false));
$('reset-count-btn').addEventListener('click',()=>pulse('X3',true));
$('sensor-btn').addEventListener('click',()=>{plc.manualSensor=true;runScan(100);setTimeout(()=>{plc.manualSensor=false;runScan(0)},450)});
$('estop-btn').addEventListener('click',()=>{plc.inputs.X4=!plc.inputs.X4;runScan(100);appendLogs([plc.inputs.X4?'E-stop đã nhả':'E-stop được nhấn'])});
$('view-3d').addEventListener('click',()=>setView('3d'));
$('view-wire').addEventListener('click',()=>setView('wire'));
function setView(mode){const wire=mode==='wire';$('wiring').hidden=!wire;$('view-3d').classList.toggle('selected',!wire);$('view-wire').classList.toggle('selected',wire);$('view-3d').setAttribute('aria-pressed',String(!wire));$('view-wire').setAttribute('aria-pressed',String(wire));$('camera-reset').hidden=wire}
$('help-toggle').addEventListener('click',()=>{const p=$('help-panel');p.hidden=!p.hidden;$('help-toggle').setAttribute('aria-expanded',String(!p.hidden))});
$('reset-program').addEventListener('click',()=>{plc.program=sampleProgram();plc.reset();setRunning(false);logs=['Đã khôi phục chương trình mẫu'];appendLogs([]);$('program-note').textContent='Chương trình mẫu · chỉnh sửa có hiệu lực ở scan tiếp theo';renderProgram()});
$('save-program').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({format:'plc-3d-lab-v1',program:plc.program},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='plc-ladder-program.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
$('load-program').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());const program=validateProgram(data.program??data);plc.reset();plc.program=program;setRunning(false);logs=['Đã mở chương trình JSON'];appendLogs([]);changed()}catch(err){alert(`Không mở được: ${err.message}`)}e.target.value=''});

setInterval(()=>{if(running)runScan(100)},100);
appendLogs([]);renderProgram();

// Optional browser agent interface; all actions share the visible simulation state.
if(document.modelContext?.registerTool){
  const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool)).catch(console.warn)}catch(err){console.warn(err)}};
  register({name:'read_plc_state',title:'Read PLC state',description:'Read the current inputs, outputs, timer, counter and scan count from the visible PLC simulation.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({inputs:{...plc.inputs},outputs:{...plc.bits},timer:{...plc.timer},counter:{value:plc.counter.value,done:plc.counter.done},scanCount:plc.scanCount})});
  register({name:'configure_ladder_program',title:'Configure Ladder program',description:'Replace the visible Ladder program with validated rungs and reset the simulation.',inputSchema:{type:'object',properties:{program:{type:'array',minItems:1,maxItems:24,items:{type:'object'}}},required:['program'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{const program=validateProgram(input?.program);setRunning(false);plc.reset();plc.program=program;renderProgram();return {rungs:program.length,scanCount:plc.scanCount}}});
  register({name:'run_plc_scans',title:'Run PLC scans',description:'Advance the visible PLC and conveyor simulation by 1 to 100 scan cycles.',inputSchema:{type:'object',properties:{cycles:{type:'integer',minimum:1,maximum:100}},required:['cycles'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!Number.isInteger(input?.cycles)||input.cycles<1||input.cycles>100)throw Error('cycles must be an integer from 1 to 100');setRunning(false);for(let i=0;i<input.cycles;i++)plc.scan(100);refresh();return {scanCount:plc.scanCount,outputs:{...plc.bits},counter:plc.counter.value}}});
}
