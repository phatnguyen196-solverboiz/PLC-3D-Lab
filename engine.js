export const ADDRESSES = ['X0','X1','X2','X3','X4','M0','Y0','Y1','Y2','T0.DN','C0.DN'];
export const LABELS = {X0:'Start',X1:'Stop OK (NC)',X2:'Cảm biến',X3:'Reset lô',X4:'E-stop OK (NC)',M0:'Tự giữ',Y0:'Motor',Y1:'Đèn chạy',Y2:'Báo đầy','T0.DN':'Timer đủ','C0.DN':'Đếm đủ'};
const c=(addr,nc=false)=>({addr,nc});
export function sampleProgram(){return [
  {id:'r1',name:'Mạch tự giữ Start / Stop',kind:'coil',branches:[[c('X1'),c('X4'),c('X0')],[c('X1'),c('X4'),c('M0')]],target:'M0'},
  {id:'r2',name:'Chạy băng tải khi chưa đầy',kind:'coil',branches:[[c('M0'),c('C0.DN',true)]],target:'Y0'},
  {id:'r3',name:'Trễ bật đèn RUN',kind:'timer',branches:[[c('Y0')]],target:'T0',preset:1500},
  {id:'r4',name:'Đèn RUN sau trễ',kind:'coil',branches:[[c('T0.DN')]],target:'Y1'},
  {id:'r5',name:'Đếm kiện qua cảm biến',kind:'counter',branches:[[c('X2')]],target:'C0',preset:3},
  {id:'r6',name:'Đèn báo đầy lô',kind:'coil',branches:[[c('C0.DN')]],target:'Y2'},
  {id:'r7',name:'Xóa bộ đếm',kind:'reset',branches:[[c('X3')]],target:'C0'}
]}
export const templates={coil:()=>({name:'Ngõ ra mới',kind:'coil',branches:[[c('X2')]],target:'Y2'}),timer:()=>({name:'Timer ON delay',kind:'timer',branches:[[c('M0')]],target:'T0',preset:1500}),counter:()=>({name:'Counter cạnh lên',kind:'counter',branches:[[c('X2')]],target:'C0',preset:3})};

export function validateProgram(data){
  if(!Array.isArray(data)||data.length<1||data.length>24)throw Error('Chương trình cần từ 1 đến 24 rungs.');
  return data.map((r,i)=>{
    if(!['coil','timer','counter','reset'].includes(r.kind))throw Error(`Rung ${i+1}: loại lệnh không hợp lệ.`);
    if(!Array.isArray(r.branches)||r.branches.length<1||r.branches.length>4)throw Error(`Rung ${i+1}: cần 1–4 nhánh.`);
    const branches=r.branches.map(b=>{
      if(!Array.isArray(b)||b.length<1||b.length>5)throw Error(`Rung ${i+1}: mỗi nhánh cần 1–5 tiếp điểm.`);
      return b.map(x=>{if(!ADDRESSES.includes(x.addr))throw Error(`Rung ${i+1}: địa chỉ sai.`);return {addr:x.addr,nc:!!x.nc}});
    });
    const allowed=r.kind==='coil'?['M0','Y0','Y1','Y2']:r.kind==='timer'?['T0']:['C0'];
    if(!allowed.includes(r.target))throw Error(`Rung ${i+1}: cuộn dây không hợp lệ.`);
    const preset=r.kind==='timer'?Math.min(10000,Math.max(100,Math.round(Number(r.preset)||1500))):r.kind==='counter'?Math.min(99,Math.max(1,Math.round(Number(r.preset)||3))):undefined;
    return {id:String(r.id||`r${i+1}`).slice(0,30),name:String(r.name||'Rung mới').slice(0,60),kind:r.kind,target:r.target,branches,...(preset===undefined?{}:{preset})};
  });
}

export class PLC {
  constructor(){this.program=sampleProgram();this.reset()}
  reset(){this.inputs={X0:false,X1:true,X2:false,X3:false,X4:true};this.bits={M0:false,Y0:false,Y1:false,Y2:false};this.timer={elapsed:0,done:false};this.counter={value:0,done:false,last:false};this.scanCount=0;this.rungState=[];this.lastEvents=[];this.boxes=[{x:-1.8,id:1}];this.boxSerial=2;this.spawnClock=0;this.manualSensor=false}
  value(addr){if(addr==='T0.DN')return this.timer.done;if(addr==='C0.DN')return this.counter.done;return !!(this.inputs[addr]??this.bits[addr])}
  scan(dt=100){
    const before={...this.bits,count:this.counter.value,timer:this.timer.done};
    this.inputs.X2=this.manualSensor||this.boxes.some(box=>box.x>.2&&box.x<.52);
    this.rungState=[];
    for(const rung of this.program){
      const contactState=rung.branches.map(branch=>branch.map(x=>x.nc?!this.value(x.addr):this.value(x.addr)));
      const on=contactState.some(branch=>branch.every(Boolean));
      this.rungState.push({on,contacts:contactState});
      if(rung.kind==='coil')this.bits[rung.target]=on;
      if(rung.kind==='timer'){
        this.timer.elapsed=on?Math.min(rung.preset,this.timer.elapsed+dt):0;
        this.timer.done=this.timer.elapsed>=rung.preset;
      }
      if(rung.kind==='counter'){
        if(on&&!this.counter.last)this.counter.value=Math.min(999,this.counter.value+1);
        this.counter.last=on;
        this.counter.done=this.counter.value>=rung.preset;
      }
      if(rung.kind==='reset'&&on){this.counter.value=0;this.counter.done=false}
    }
    this.scanCount++;
    const events=[];
    if(!before.Y0&&this.bits.Y0)events.push('Motor Y0 bật');
    if(before.Y0&&!this.bits.Y0)events.push('Motor Y0 dừng');
    if(before.count!==this.counter.value)events.push(`C0 = ${this.counter.value}`);
    if(!before.timer&&this.timer.done)events.push('T0 đã đủ thời gian');
    if(!before.Y2&&this.bits.Y2)events.push('Đủ lô · đèn Y2 bật');
    this.lastEvents=events;
    // Cơ cấu chuyển động sau khi PLC đã xuất tín hiệu trong scan này.
    if(this.bits.Y0){
      for(const box of this.boxes)box.x+=dt*.00053;
      this.boxes=this.boxes.filter(box=>box.x<2.65);
      this.spawnClock+=dt;
      if(this.spawnClock>=2900){this.spawnClock=0;this.boxes.push({x:-2.25,id:this.boxSerial++})}
    }
    return events;
  }
  preset(kind){return this.program.find(r=>r.kind===kind)?.preset??(kind==='timer'?1500:3)}
}
