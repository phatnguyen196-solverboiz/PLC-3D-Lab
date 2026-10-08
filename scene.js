import * as THREE from './three.module.js';

const mat=(color,metalness=.2,roughness=.65)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
const bodyMat=mat(0x465b69,.45),edgeMat=mat(0x213642,.5),steel=mat(0x8497a2,.65,.35),beltMat=mat(0x23343d,.22),orange=mat(0xf4a45e,.12),floorMat=mat(0x1b3040,.3),dark=mat(0x13232f,.4);
function box(w,h,d,m,x,y,z){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);return o}
function label(text,w=1.3,color='#dff4f1'){
  const cv=document.createElement('canvas');cv.width=512;cv.height=128;const ctx=cv.getContext('2d');ctx.fillStyle='#122330';ctx.fillRect(0,0,512,128);ctx.fillStyle=color;ctx.font='bold 44px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,65);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),side:THREE.DoubleSide}));return mesh;
}
function cable(points,color){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return new THREE.Mesh(new THREE.TubeGeometry(curve,25,.018,6,false),mat(color,.25))}

export class PlantView{
  constructor(container){
    this.container=container;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x102231);
    this.scene.fog=new THREE.Fog(0x102231,12,24);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    container.prepend(this.renderer.domElement);
    this.camera=new THREE.PerspectiveCamera(39,1,.1,100);this.azimuth=.7;this.elevation=.48;this.distance=10.7;this.target=new THREE.Vector3(-.1,.7,0);
    this.scene.add(new THREE.HemisphereLight(0xc6e7fc,0x2a4b52,2));
    const key=new THREE.DirectionalLight(0xfff3df,2.3);key.position.set(-2,8,6);this.scene.add(key);
    const fill=new THREE.DirectionalLight(0x5cbde0,1);fill.position.set(5,3,-4);this.scene.add(fill);
    this.root=new THREE.Group();this.scene.add(this.root);this.boxMeshes=new Map();this.build();this.bind();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();this.frame();
  }
  build(){
    const g=this.root;
    const floor=box(9,.12,5.2,floorMat,-.15,-.09,0);g.add(floor);
    const grid=new THREE.GridHelper(9,18,0x315568,0x274558);grid.position.y=-.025;g.add(grid);
    // Conveyor, roller shafts, support frame and moving belt.
    g.add(box(5,.13,1.24,bodyMat,0,.71,0),box(5.05,.15,.89,beltMat,0,.805,0));
    for(const z of [-.58,.58])g.add(box(5.15,.24,.08,steel,0,.8,z));
    for(const x of [-2.3,-1.1,0,1.1,2.3]){
      const roller=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,1.06,16),steel);roller.rotation.x=Math.PI/2;roller.position.set(x,.81,0);g.add(roller);
    }
    for(const x of [-2,2])for(const z of [-.48,.48])g.add(box(.09,.7,.09,bodyMat,x,.34,z));
    g.add(box(4.1,.08,.06,edgeMat,0,.29,-.48),box(4.1,.08,.06,edgeMat,0,.29,.48));
    this.motor=new THREE.Group();this.motor.position.set(-2.35,.56,.72);g.add(this.motor);
    const motorBody=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.56,24),mat(0x2e7883,.6));motorBody.rotation.z=Math.PI/2;this.motor.add(motorBody);
    this.motorShaft=new THREE.Group();this.motorShaft.position.x=.32;this.motor.add(this.motorShaft);this.motorShaft.add(box(.09,.1,.37,steel,0,0,0));
    // PLC cabinet and 24 V power supply.
    g.add(box(1.55,2.4,.72,bodyMat,-3.22,1.3,-1.05),box(1.64,.13,.8,steel,-3.22,2.55,-1.05));
    g.add(box(1.44,2.18,.045,mat(0x263d4a,.4),-3.22,1.31,-.66));
    g.add(box(.58,.52,.07,mat(0x719099,.4),-3.6,1.96,-.61));
    g.add(box(.54,.18,.076,mat(0x2b444e,.3),-3.6,2.03,-.56));
    const ps=label('24V DC',.46);ps.position.set(-3.6,1.82,-.56);g.add(ps);
    const plc=box(.72,.75,.10,mat(0xa7b5b7,.3),-2.94,1.76,-.59);g.add(plc);
    const plcLabel=label('PLC CPU',.58);plcLabel.position.set(-2.94,1.91,-.527);g.add(plcLabel);
    for(let row=0;row<2;row++)for(let i=0;i<5;i++){
      const p=box(.07,.055,.014,dark,-3.19+i*.12,1.66-row*.13,-.528);g.add(p);
    }
    g.add(box(.91,.2,.15,dark,-3.22,.85,-.52));
    const terminal=label('TERMINALS',.66);terminal.position.set(-3.22,.85,-.435);g.add(terminal);
    for(let i=0;i<6;i++)g.add(box(.09,.07,.05,steel,-3.58+i*.14,.73,-.48));
    // Operator panel, sensor and stack light.
    g.add(box(.85,.45,.28,mat(0x344f5f),-3.2,.45,.75));
    const b1=new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,.04,20),mat(0x33c4a5));b1.rotation.x=Math.PI/2;b1.position.set(-3.45,.49,.91);g.add(b1);
    const b2=b1.clone();b2.material=mat(0xe8aa64);b2.position.x=-3.19;g.add(b2);
    const b3=b1.clone();b3.material=mat(0xc45253);b3.position.x=-2.93;g.add(b3);
    g.add(box(.09,1.05,.09,steel,.38,1.35,-.72));
    g.add(box(.28,.16,.22,mat(0x3d7288),.38,1.33,-.48));
    this.sensorGlow=new THREE.Mesh(new THREE.SphereGeometry(.05,12,10),new THREE.MeshBasicMaterial({color:0x3474aa}));this.sensorGlow.position.set(.38,1.33,-.35);g.add(this.sensorGlow);
    g.add(box(.09,1.65,.09,steel,2.65,1.45,-.78));
    this.runLamp=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.18,20),new THREE.MeshStandardMaterial({color:0x1a6a60,emissive:0x000000}));this.runLamp.position.set(2.65,2.27,-.78);g.add(this.runLamp);
    this.fullLamp=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.18,20),new THREE.MeshStandardMaterial({color:0x9d652a,emissive:0x000000}));this.fullLamp.position.set(2.65,2.49,-.78);g.add(this.fullLamp);
    g.add(cable([[-2.8,.69,-.63],[-2.4,.15,-.9],[-1.5,.13,-.9],[-1.1,.4,-.6]],0x62afaa));
    g.add(cable([[-2.77,.72,-.63],[-2.2,.14,-1.26],[-.3,.15,-1.3],[.37,1.2,-.7]],0x6ab6d8));
    g.add(cable([[-2.64,.8,-.62],[-2,.14,-1.55],[1.9,.14,-1.54],[2.64,1.2,-.8]],0xf6b25e));
    const conveyorLabel=label('CONVEYOR · Y0',1.45);conveyorLabel.position.set(1.23,.39,.64);g.add(conveyorLabel);
  }
  bind(){
    const c=this.renderer.domElement;let drag=null;
    c.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,a:this.azimuth,b:this.elevation};c.setPointerCapture(e.pointerId)});
    c.addEventListener('pointermove',e=>{if(!drag)return;this.azimuth=drag.a-(e.clientX-drag.x)*.006;this.elevation=Math.max(.1,Math.min(1.35,drag.b+(e.clientY-drag.y)*.005));this.updateCamera()});
    c.addEventListener('pointerup',()=>drag=null);c.addEventListener('pointercancel',()=>drag=null);
    c.addEventListener('wheel',e=>{e.preventDefault();this.distance=Math.max(6.5,Math.min(16,this.distance+Math.sign(e.deltaY)*.6));this.updateCamera()},{passive:false});
  }
  resetCamera(){this.azimuth=.7;this.elevation=.48;this.distance=10.7;this.updateCamera()}
  updateCamera(){const a=this.azimuth,e=this.elevation,d=this.distance;this.camera.position.set(this.target.x+d*Math.sin(a)*Math.cos(e),this.target.y+d*Math.sin(e),this.target.z+d*Math.cos(a)*Math.cos(e));this.camera.lookAt(this.target)}
  resize(){const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);this.updateCamera()}
  update(plc){
    const seen=new Set();for(const b of plc.boxes){seen.add(b.id);let mesh=this.boxMeshes.get(b.id);if(!mesh){mesh=box(.35,.34,.34,orange,0,0,0);this.root.add(mesh);this.boxMeshes.set(b.id,mesh)}mesh.position.set(b.x,1.06,0)}
    for(const [id,mesh] of this.boxMeshes)if(!seen.has(id)){this.root.remove(mesh);mesh.geometry.dispose();this.boxMeshes.delete(id)}
    this.runLamp.material.emissive.setHex(plc.bits.Y1?0x23c9a9:0x000000);this.fullLamp.material.emissive.setHex(plc.bits.Y2?0xff9e34:0x000000);
    this.sensorGlow.material.color.setHex(plc.inputs.X2?0x79d6ff:0x3474aa);
    this.runLamp.scale.setScalar(plc.bits.Y1?1.12:1);this.fullLamp.scale.setScalar(plc.bits.Y2?1.12:1);
    this.motorShaft.rotation.x+=plc.bits.Y0?.22:0;
  }
  frame(){this.renderer.render(this.scene,this.camera);requestAnimationFrame(()=>this.frame())}
}
