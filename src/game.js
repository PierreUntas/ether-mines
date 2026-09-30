(()=>{
'use strict';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,sm=t=>t*t*(3-2*t);
const touch=matchMedia('(pointer:coarse)').matches;
function hash(x,y,s=0){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(97+s,1442695041);h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296}
function hash3(x,y,z,s=0){return hash(x+Math.imul(z|0,19349663),y,s)}
function vn2(x,z,s=0){const xi=Math.floor(x),zi=Math.floor(z),xf=sm(x-xi),zf=sm(z-zi);const a=hash(xi,zi,s),b=hash(xi+1,zi,s),c=hash(xi,zi+1,s),d=hash(xi+1,zi+1,s);return a+(b-a)*xf+(c-a)*zf+(a-b-c+d)*xf*zf}
function vn3(x,y,z,s=0){const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=sm(x-xi),yf=sm(y-yi),zf=sm(z-zi);const L=(a,b,t)=>a+(b-a)*t;
 const c=(dx,dy,dz)=>hash3(xi+dx,yi+dy,zi+dz,s);return L(L(L(c(0,0,0),c(1,0,0),xf),L(c(0,1,0),c(1,1,0),xf),yf),L(L(c(0,0,1),c(1,0,1),xf),L(c(0,1,1),c(1,1,1),xf),yf),zf)}

// ---------- atlas de textures (16 px, pixel art procédural) ----------
const AT=16,AN=16;
const atlas=document.createElement('canvas');atlas.width=atlas.height=AT*AN;const ag=atlas.getContext('2d');
const emis=document.createElement('canvas');emis.width=emis.height=AT*AN;const eg=emis.getContext('2d');eg.fillStyle='#000';eg.fillRect(0,0,256,256);
function tile(i,fn){const ox=(i%AN)*AT,oy=Math.floor(i/AN)*AT;const P=(x,y,c)=>{if(c===null){ag.clearRect(ox+x,oy+y,1,1);return}ag.fillStyle=c;ag.fillRect(ox+x,oy+y,1,1)};const E=(x,y,c)=>{eg.fillStyle=c;eg.fillRect(ox+x,oy+y,1,1)};fn(P,E,i)}
function noise(P,i,base,list){for(let y=0;y<16;y++)for(let x=0;x<16;x++){let c=base;const r=hash(i*131+x,y,5);let acc=0;for(const[col,p]of list){acc+=p;if(r<acc){c=col;break}}P(x,y,c)}}
const GR=['#9fe3c4',[['#b6efd6',.2],['#86d4b1',.2],['#cdf7e3',.05]]];
const DI=['#c9a9dc',[['#b793cc',.25],['#dbc1ea',.15],['#a784bd',.06]]];
const ST=['#a9adcf',[['#9699bf',.25],['#bcc0de',.2],['#8a8db3',.06]]];
tile(0,(P,E,i)=>noise(P,i,...GR));
tile(2,(P,E,i)=>noise(P,i,...DI));
tile(1,(P,E,i)=>{noise(P,2,...DI);for(let x=0;x<16;x++){const d=3+(hash(x,1,9)<.45?1:0)+(hash(x,2,9)<.15?1:0);for(let y=0;y<d;y++)P(x,y,hash(x,y,3)<.25?'#b6efd6':'#9fe3c4');P(x,d,'#86d4b1')}});
tile(3,(P,E,i)=>noise(P,i,...ST));
tile(4,(P,E,i)=>noise(P,i,'#f6e3c4',[['#ecd3ae',.25],['#fbeed8',.15],['#e2c59c',.04]]));
tile(5,(P,E,i)=>{noise(P,i,'#cda07c',[['#d8ad8a',.2],['#bf9270',.15]]);for(const x of[2,6,11,14])for(let y=0;y<16;y++)if(hash(x,y,4)<.8)P(x,y,'#a87d5d')});
tile(6,(P,E,i)=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const d=Math.hypot(x-7.5,y-7.5);P(x,y,x===0||y===0||x===15||y===15?'#a87d5d':Math.floor(d)%3===0?'#caa07e':'#ecc9a2')}});
tile(7,(P,E,i)=>{noise(P,i,'#8fdcb0',[['#a8e8c4',.22],['#74c99a',.22],[null,.1]])});
tile(8,(P,E,i)=>{noise(P,i,'#ffbcdc',[['#ffd3e8',.22],['#f29cc6',.2],[null,.1]])});
tile(9,(P,E,i)=>{noise(P,3,...ST);for(const[cx,cy]of[[4,4],[11,6],[6,11],[12,12]]){for(const[dx,dy,c]of[[0,-2,'#c9f7ff'],[-1,-1,'#7fe8ff'],[0,-1,'#c9f7ff'],[1,-1,'#3fc6f5'],[-1,0,'#7fe8ff'],[0,0,'#7fe8ff'],[1,0,'#3fc6f5'],[0,1,'#3fc6f5']]){P(cx+dx,cy+dy,c);E(cx+dx,cy+dy,c)}}});
tile(10,(P,E,i)=>{noise(P,i,'#f2cfa6',[['#f7dcbc',.2],['#e8c298',.15]]);for(let y=0;y<16;y++)for(let x=0;x<16;x++){if(y%4===3)P(x,y,'#d7ae84');const o=[3,11,7,14][Math.floor(y/4)];if(x===o&&y%4!==3)P(x,y,'#d7ae84')}});
tile(11,(P,E,i)=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const b=x===0||y===0||x===15||y===15;P(x,y,b?'#e6fbff':'rgba(200,240,255,.16)')}for(const[x,y]of[[3,4],[4,3],[5,2],[3,6],[4,5],[5,4],[6,3],[11,11],[12,10]])P(x,y,'rgba(255,255,255,.75)')});
tile(12,(P,E,i)=>noise(P,i,'#5b5782',[['#4a4670',.3],['#7a76a3',.15]]));
const DIAM=[[7,2],[8,2],[6,3],[7,3],[8,3],[9,3],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[6,6],[7,6],[8,6],[9,6],[7,7],[8,7],[5,8],[10,8],[6,9],[7,9],[8,9],[9,9],[7,10],[8,10],[7,11],[8,11]];
tile(13,(P,E,i)=>{noise(P,i,'#6a58e0',[['#5d4bd6',.2],['#7a69ea',.2]]);for(let k=0;k<16;k++){P(k,0,'#4f40bf');P(k,15,'#4f40bf');P(0,k,'#4f40bf');P(15,k,'#4f40bf')}for(const[x,y]of DIAM){const c=x<8?'#ffd24d':'#ffeaa0';P(x,y+2,c);E(x,y+2,c)}});
tile(14,(P,E,i)=>{noise(P,i,'#ffe68a',[['#ffd95e',.25],['#fff2b8',.15]]);for(let k=0;k<16;k++){P(k,0,'#e8b93c');P(k,15,'#e8b93c');P(0,k,'#e8b93c');P(15,k,'#e8b93c')}for(const[x,y]of[[7,6],[8,6],[6,7],[7,7],[8,7],[9,7],[7,8],[8,8],[7,9],[8,9]]){P(x,y,'#8a7bef');E(x,y,'#6a58e0')}});
tile(15,(P,E,i)=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const b=x<2||y<2||x>13||y>13;const d=Math.hypot(x-7.5,y-7.5);const c=b?'#8a7bef':d<3?'#ffffff':d<5?'#bff6ff':'#7fe8ff';P(x,y,c);if(!b)E(x,y,c)}for(const k of[2,13]){for(let y=2;y<14;y++)P(k,y,'#6a58e0')}});
tile(16,(P,E,i)=>{noise(P,i,'#f6f4ff',[['#ffffff',.2],['#ebe8fb',.15]]);for(let k=0;k<9;k++){P(2+k,3+Math.floor(k*.7),'#dcd6f5');P(6+k,10+Math.floor(k*.4),'#dcd6f5')}});
tile(17,(P,E,i)=>noise(P,i,'#ffffff',[['#eef2ff',.25],['#e2e8fb',.08]]));
tile(18,(P,E,i)=>{noise(P,3,...ST);for(let x=0;x<16;x++){const d=3+(hash(x,4,9)<.5?1:0);for(let y=0;y<d;y++)P(x,y,hash(x,y,6)<.2?'#eef2ff':'#ffffff')}});
function flower(P,col,center){for(let y=0;y<16;y++)for(let x=0;x<16;x++)P(x,y,null);for(let y=7;y<16;y++){P(7,y,'#6fbf8f');P(8,y,'#5aa97a')}P(6,11,'#6fbf8f');P(5,10,'#6fbf8f');P(9,12,'#6fbf8f');P(10,11,'#6fbf8f');for(const[dx,dy]of[[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]])P(7+dx,5+dy,col);P(7,5,center);P(8,5,col);P(8,4,col);P(8,6,col)}
tile(19,P=>flower(P,'#ff8fc8','#fff2b8'));tile(20,P=>flower(P,'#ffd95e','#ff9f6b'));tile(21,P=>flower(P,'#8fb8ff','#ffffff'));
tile(22,(P,E,i)=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++)P(x,y,null);for(const[x,h]of[[2,7],[4,11],[6,8],[8,13],[10,9],[12,12],[14,6]])for(let y=16-h;y<16;y++)P(x+(y<16-h/2&&hash(x,y)<.5?1:0),y,y<16-h*.6?'#b6efd6':'#86d4b1')});
tile(24,(P,E)=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++)P(x,y,null);for(const[x,y]of DIAM){const c=x<8?'#7fe8ff':'#c9f7ff';P(x,y+2,y>6?'#3fc6f5':c);E(x,y+2,c)}});
function pick(P,head,headD){for(let y=0;y<16;y++)for(let x=0;x<16;x++)P(x,y,null);for(let k=0;k<11;k++){P(3+k,13-k,'#8a5a33');P(4+k,13-k,'#b98a5a')}for(const[x,y]of[[6,2],[7,2],[8,2],[9,3],[10,3],[11,4],[12,5],[12,6],[13,7],[13,8],[13,9],[5,3],[4,3],[3,4]])P(x,y,head);for(const[x,y]of[[8,3],[9,4],[10,4],[11,5],[12,7],[12,8]])P(x,y,headD)}
tile(25,P=>pick(P,'#f2cfa6','#d7ae84'));tile(26,(P,E)=>{pick(P,'#7fe8ff','#3fc6f5');for(const[x,y]of[[6,2],[7,2],[8,2],[9,3],[10,3],[11,4],[12,5],[12,6],[13,7],[13,8]])E(x,y,'#7fe8ff')});
const atlasTex=new THREE.CanvasTexture(atlas),emisTex=new THREE.CanvasTexture(emis);
for(const t of[atlasTex,emisTex]){t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.generateMipmaps=false}
const waterC=document.createElement('canvas');waterC.width=waterC.height=32;{const w=waterC.getContext('2d');for(let y=0;y<32;y++)for(let x=0;x<32;x++){const r=hash(x,y,77);w.fillStyle=r<.18?'#a9dcf7':r<.3?'#6fb6e8':'#86c7ee';w.fillRect(x,y,1,1)}for(let k=0;k<10;k++){const x=Math.floor(hash(k,1,78)*28),y=Math.floor(hash(k,2,78)*30);w.fillStyle='#d7f1ff';w.fillRect(x,y,4,1)}}
const waterTex=new THREE.CanvasTexture(waterC);waterTex.wrapS=waterTex.wrapT=THREE.RepeatWrapping;waterTex.magFilter=THREE.NearestFilter;waterTex.minFilter=THREE.NearestFilter;waterTex.generateMipmaps=false;

// ---------- blocs et objets (chaque objet = un jeton) ----------
const B={
 1:{n:'Herbe',t:[0,1,2],h:.6,drop:2},2:{n:'Terre',t:[2,2,2],h:.6},3:{n:'Granite',t:[3,3,3],h:2,stone:1},4:{n:'Sable',t:[4,4,4],h:.5},
 5:{n:'Bois',t:[6,5,6],h:1.4},6:{n:'Feuilles',t:[7,7,7],h:.25,leaf:1,drop:0},7:{n:'Feuilles roses',t:[8,8,8],h:.25,leaf:1,drop:0},
 8:{n:"Minerai d'éther",t:[9,9,9],h:2.6,stone:1,drop:101},9:{n:'Planches',t:[10,10,10],h:1.1},10:{n:'Verre',t:[11,11,11],h:.5,glass:1},
 11:{n:'Eau',water:1},12:{n:'Socle',t:[12,12,12],h:Infinity},13:{n:'Validateur',t:[14,13,14],h:2.5,stone:1},14:{n:'Lanterne',t:[15,15,15],h:.5},
 15:{n:'Marbre',t:[16,16,16],h:2.2,stone:1},16:{n:'Neige',t:[17,18,3],h:.5},
 17:{n:'Fleur rose',x:19,h:.05},18:{n:'Fleur dorée',x:20,h:.05},19:{n:'Fleur bleue',x:21,h:.05},20:{n:'Herbes hautes',x:22,h:.05,drop:0}};
const ITEM={101:{n:"Cristal d'éther",icon:24},102:{n:'Pioche en bois',icon:25,tool:2.2},201:{n:'Pioche de cristal',icon:26,tool:5,nft:1}};
const nameOf=id=>B[id]?B[id].n:ITEM[id].n;
const isCross=id=>B[id]&&B[id].x!=null;
const isTransp=id=>id===0||id===11||isCross(id)||(B[id]&&(B[id].leaf||B[id].glass));
const isSolid=id=>id&&id!==11&&!isCross(id);
const isOpaque=id=>id&&!isTransp(id);

// ---------- monde ----------
const SX=96,SZ=96,SY=48,SEA=15,CH=16,NC=SX/CH;
const W=new Uint8Array(SX*SY*SZ);
const I=(x,y,z)=>x+z*SX+y*SX*SZ;
const get=(x,y,z)=>(x<0||y<0||z<0||x>=SX||y>=SY||z>=SZ)?0:W[I(x,y,z)];
const hmap=new Int16Array(SX*SZ);
const SPAWN={x:48,z:48,y:0};
function heightAt(x,z){const c=vn2(x/40,z/40,1)*.6+vn2(x/17,z/17,2)*.3+vn2(x/7,z/7,3)*.1;const m=sm(clamp((vn2(x/64+10,z/64+10,4)-.52)/.25,0,1));
 const d=Math.hypot(x-SPAWN.x,z-SPAWN.z),flat=sm(clamp((d-5)/10,0,1));return Math.floor(lerp(20,12+c*14+m*18*vn2(x/16,z/16,5),flat))}
function biome(x,z){const b=vn2(x/50+30,z/50-20,6);return b<.42?'plaine':b<.66?'foret':'dunes'}
function setB(x,y,z,id){if(x>=0&&y>=0&&z>=0&&x<SX&&y<SY&&z<SZ)W[I(x,y,z)]=id}
function generate(){
 W.fill(0);
 for(let z=0;z<SZ;z++)for(let x=0;x<SX;x++){
  const h=heightAt(x,z),bi=biome(x,z);hmap[x+z*SX]=h;
  for(let y=0;y<SY;y++){let id=0;
   if(y===0)id=12;else if(y<h-3)id=3;else if(y<h)id=(bi==='dunes'||h<=SEA+1)?4:2;
   else if(y===h){id=h<=SEA+1?4:bi==='dunes'?4:h>=36?16:h>=31?3:1}
   else if(y<=SEA)id=11;
   if(id===3&&y>1&&y<h-4&&vn3(x/11,y/7,z/11,7)>.7)id=0;
   if(id===3&&vn3(x/3.2,y/3.2,z/3.2,8)>.8-Math.min(.1,(h-y)*.004))id=8;
   if(id)W[I(x,y,z)]=id}}
 // flèches de cristal, arbres, plantes
 for(let z=3;z<SZ-3;z++)for(let x=3;x<SX-3;x++){const h=hmap[x+z*SX],top=get(x,h,z),bi=biome(x,z),d=Math.hypot(x-SPAWN.x,z-SPAWN.z);
  if(top!==1||d<8)continue;const r=hash(x,z,40);
  if(bi==='foret'&&r<.004){const t=2+Math.floor(hash(x,z,41)*3);for(let k=1;k<=t;k++)setB(x,h+k,z,8);continue}
  if(r<(bi==='foret'?.028:.01)){const th=4+Math.floor(hash(x,z,42)*3),leaf=bi==='foret'?7:6;
   for(let k=1;k<=th;k++)setB(x,h+k,z,5);
   for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const rr=Math.hypot(dx,dy*1.2,dz);if(rr<=2.5-(hash(x+dx,z+dz,dy+50)<.3?.6:0)&&get(x+dx,h+th+dy,z+dz)===0)setB(x+dx,h+th+dy,z+dz,leaf)}
   setB(x,h+th+2,z,leaf);continue}
  if(get(x,h+1,z)===0){if(r<.09)setB(x,h+1,z,20);else if(r<.11)setB(x,h+1,z,17+Math.floor(hash(x,z,43)*3))}}
 // le sanctuaire du validateur, au point d'apparition
 const sy=hmap[SPAWN.x+SPAWN.z*SX];
 for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){setB(SPAWN.x+dx,sy,SPAWN.z+dz,15);for(let k=1;k<7;k++)setB(SPAWN.x+dx,sy+k,SPAWN.z+dz,0)}
 for(const[dx,dz]of[[-3,-3],[3,-3],[-3,3],[3,3]])for(let k=1;k<=4;k++)setB(SPAWN.x+dx,sy+k,SPAWN.z+dz,15);
 for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)if(Math.abs(dx)===3||Math.abs(dz)===3)setB(SPAWN.x+dx,sy+5,SPAWN.z+dz,15);
 setB(SPAWN.x,sy+1,SPAWN.z,13);for(const[dx,dz]of[[-2,-2],[2,-2],[-2,2],[2,2]])setB(SPAWN.x+dx,sy+4,SPAWN.z+dz,14);
 SPAWN.y=sy+1}

// ---------- état, sauvegarde ----------
let KEY='mines-ether:solo';
const SAVE_V=2;
const S0=()=>({v:SAVE_V,chunks:{},edits:{},inv:{},bar:[null,null,null,null,null,null,null,null,null],sel:0,pos:null,placed:{},serial:0,nfts:[],log:[],supply:{},day:.3,dayN:1,seen:{},totalMint:0,totalBurn:0});
let S=S0(),ME={id:'moi',name:'moi',color:'#8a7bef'};const OWN=new Map();
function loadState(){let s=null;try{s=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}S=Object.assign(S0(),s||{});if(s&&!s.v)S.v=1;migrateSave(S)}
// Migrations de la sauvegarde locale : chaque version sait convertir la précédente. Ne jamais renommer KEY.
function migrateSave(s){
 if(!s.v||s.v<2){const conv=o=>{const r={};for(const k in o){const i=+k;if(!Number.isInteger(i)){r[k]=o[k];continue}r[`${i%96},${Math.floor(i/(96*96))},${Math.floor(i/96)%96}`]=o[k]}return r};
  s.edits=conv(s.edits||{});s.placed=conv(s.placed||{});s.chunks=s.chunks||{};s.v=2;dirty=true}
}
let dirty=false;function save(){if(!dirty)return;dirty=false;S.pos=[P.x,P.y,P.z,yaw,pitch];try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
setInterval(save,4000);addEventListener('pagehide',save);

// ---------- rendu three ----------
let renderer;try{renderer=new THREE.WebGLRenderer({antialias:!touch,powerPreference:'high-performance'})}catch(e){$('play').textContent='WebGL indisponible sur cet appareil';throw e}
renderer.setPixelRatio(Math.min(devicePixelRatio,touch?1.5:2));renderer.autoClear=false;
renderer.shadowMap.enabled=!touch;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xe6e0ff,34,92);
const camera=new THREE.PerspectiveCamera(72,1,.05,400);camera.rotation.order='YXZ';
const hemi=new THREE.HemisphereLight(0xdfe8ff,0xb9a7e0,.6);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff2e0,.9);sun.castShadow=!touch;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-44,right:44,top:44,bottom:-44,near:1,far:180});sun.shadow.bias=-.0006;sun.shadow.normalBias=.04;scene.add(sun);scene.add(sun.target);
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();handCam.aspect=camera.aspect;handCam.updateProjectionMatrix()}
// ciel
const skyU={top:{value:new THREE.Color()},hor:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3()},sunCol:{value:new THREE.Color()},night:{value:0}};
const sky=new THREE.Mesh(new THREE.SphereGeometry(300,32,16),new THREE.ShaderMaterial({uniforms:skyU,side:THREE.BackSide,depthWrite:false,fog:false,
 vertexShader:'varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform vec3 top,hor,sunCol,sunDir;uniform float night;varying vec3 vD;void main(){float h=vD.y;vec3 c=mix(hor,top,pow(clamp(h,0.,1.),.55));c=mix(c,hor*.8,clamp(-h*3.,0.,1.));float s=max(dot(vD,sunDir),0.);c+=sunCol*(smoothstep(.9985,.9992,s)*1.4+pow(s,14.)*.35);float m=max(dot(vD,-sunDir),0.);c+=vec3(.95,.95,1.)*smoothstep(.9990,.9994,m)*night;gl_FragColor=vec4(c,1.);}'}));
sky.renderOrder=-1;scene.add(sky);
const starG=new THREE.BufferGeometry(),sp=[];for(let i=0;i<700;i++){const u=hash(i,1,90)*2-1,a=hash(i,2,90)*Math.PI*2,r=Math.sqrt(1-u*u);if(u<0.05)continue;sp.push(Math.cos(a)*r*280,u*280,Math.sin(a)*r*280)}
starG.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));const stars=new THREE.Points(starG,new THREE.PointsMaterial({color:0xffffff,size:1.6,sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false}));scene.add(stars);
const cloudC=document.createElement('canvas');cloudC.width=cloudC.height=64;{const c=cloudC.getContext('2d');for(let y=0;y<64;y++)for(let x=0;x<64;x++){const v=vn2(x/6,y/6,60)*.7+vn2(x/3,y/3,61)*.3;if(v>.62){c.fillStyle='#ffffff';c.fillRect(x,y,1,1)}}}
const cloudTex=new THREE.CanvasTexture(cloudC);cloudTex.magFilter=THREE.NearestFilter;cloudTex.minFilter=THREE.NearestFilter;cloudTex.wrapS=cloudTex.wrapT=THREE.RepeatWrapping;cloudTex.repeat.set(3,3);
const clouds=new THREE.Mesh(new THREE.PlaneGeometry(900,900),new THREE.MeshBasicMaterial({map:cloudTex,transparent:true,opacity:.85,depthWrite:false,fog:false,side:THREE.DoubleSide}));clouds.rotation.x=-Math.PI/2;clouds.position.y=SY+26;scene.add(clouds);
// grand losange au loin
function ethGeo(r,ht,hb,gap,cols){const pos=[],col=[],e=[[r,0,0],[0,0,r],[-r,0,0],[0,0,-r]];const hx=h=>{const n=parseInt(h.slice(1),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]};
 for(let i=0;i<4;i++){const a=e[i],c=e[(i+1)%4];pos.push(0,ht,0,a[0],gap/2,a[2],c[0],gap/2,c[2],0,-hb,0,a[0],-gap/2,a[2],c[0],-gap/2,c[2]);const t=hx(cols[i%2]),b=hx(cols[2+i%2]);for(let j=0;j<3;j++)col.push(...t);for(let j=0;j<3;j++)col.push(...b)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));return g}
const ethMat=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,fog:false});
const bigEth=new THREE.Mesh(ethGeo(9,15,10,2.5,['#9a8cf5','#c2b8ff','#6a58e0','#8a7bef']),ethMat);bigEth.position.set(SX/2,SY+40,-60);scene.add(bigEth);

// ---------- maillage par tronçons ----------
const FACES=[
 {n:[1,0,0],a:0,c:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],s:1},{n:[-1,0,0],a:0,c:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],s:1},
 {n:[0,1,0],a:1,c:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],s:0},{n:[0,-1,0],a:1,c:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],s:2},
 {n:[0,0,1],a:2,c:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]],s:1},{n:[0,0,-1],a:2,c:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]],s:1}];
const AOF=[.42,.62,.82,1];
const opMat=new THREE.MeshLambertMaterial({map:atlasTex,emissiveMap:emisTex,emissive:0xffffff,vertexColors:true,alphaTest:.5});
const glMat=new THREE.MeshLambertMaterial({map:atlasTex,emissiveMap:emisTex,emissive:0xffffff,vertexColors:true,transparent:true,depthWrite:false});
const waMat=new THREE.MeshLambertMaterial({map:waterTex,transparent:true,opacity:.78,depthWrite:false,color:0xdcefff});
const plMat=new THREE.MeshLambertMaterial({map:atlasTex,alphaTest:.5,side:THREE.DoubleSide});
function uvRect(ti){const tx=ti%AN,ty=Math.floor(ti/AN),e=.0008;return[tx/AN+e,(tx+1)/AN-e,1-(ty+1)/AN+e,1-ty/AN-e]}
const chunks=[];
function buildChunk(cx,cz){
 const A={op:[[],[],[],[],[]],gl:[[],[],[],[],[]],wa:[[],[],[],[]],pl:[[],[],[],[]]};// pos,nor,uv,col,idx
 const pushQ=(G,pts,nor,uvs,cols,flipTri)=>{const base=G[0].length/3;for(let k=0;k<4;k++){G[0].push(...pts[k]);G[1].push(...nor);G[2].push(...uvs[k]);if(cols)G[3].push(cols[k],cols[k],cols[k])}const ix=cols?G[4]:G[3];if(flipTri)ix.push(base+1,base+2,base+3,base+1,base+3,base);else ix.push(base,base+1,base+2,base,base+2,base+3)};
 for(let y=0;y<SY;y++)for(let z=cz*CH;z<cz*CH+CH;z++)for(let x=cx*CH;x<cx*CH+CH;x++){
  const id=W[I(x,y,z)];if(!id)continue;const b=B[id];
  if(b.x!=null){const[u0,u1,v0,v1]=uvRect(b.x),o=.15;for(const[p,q]of[[[x+o,z+o],[x+1-o,z+1-o]],[[x+1-o,z+o],[x+o,z+1-o]]])pushQ(A.pl,[[p[0],y,p[1]],[p[0],y+1,p[1]],[q[0],y+1,q[1]],[q[0],y,q[1]]],[0,1,0],[[u0,v0],[u0,v1],[u1,v1],[u1,v0]],null,false);continue}
  if(b.water){for(const f of FACES){const nb=get(x+f.n[0],y+f.n[1],z+f.n[2]);if(nb===11||isSolid(nb)&&!B[nb].leaf&&!B[nb].glass)continue;if(f.n[1]<0)continue;
    const top=get(x,y+1,z)!==11?.86:1;const pts=f.c.map(c=>[x+c[0],y+(c[1]?top:0),z+c[2]]);const uvs=pts.map(p=>f.a===1?[p[0]*.25,p[2]*.25]:f.a===0?[p[2]*.25,p[1]*.25]:[p[0]*.25,p[1]*.25]);pushQ(A.wa,pts,f.n,uvs,null,false)}continue}
  const G=b.glass?A.gl:A.op;
  for(const f of FACES){const nx=x+f.n[0],ny=y+f.n[1],nz=z+f.n[2],nb=get(nx,ny,nz);
   if(ny<0)continue;if(isOpaque(nb))continue;if(nb===id&&(b.leaf||b.glass))continue;
   const[u0,u1,v0,v1]=uvRect(b.t[f.s]);
   const u=(f.a+1)%3,w=(f.a+2)%3,ao=[],pts=[],uvs=[];
   for(const c of f.c){const p=[nx,ny,nz],du=c[u]?1:-1,dw=c[w]?1:-1;const p1=p.slice();p1[u]+=du;const p2=p.slice();p2[w]+=dw;const p3=p1.slice();p3[w]+=dw;
    const s1=isOpaque(get(...p1))?1:0,s2=isOpaque(get(...p2))?1:0,s3=isOpaque(get(...p3))?1:0;ao.push(s1&&s2?0:3-(s1+s2+s3));
    pts.push([x+c[0],y+c[1],z+c[2]]);
    let uu,vv;if(f.a===1){uu=c[0];vv=c[2]}else if(f.a===0){uu=f.n[0]>0?1-c[2]:c[2];vv=c[1]}else{uu=f.n[2]>0?c[0]:1-c[0];vv=c[1]}
    uvs.push([lerp(u0,u1,uu),lerp(v0,v1,vv)])}
   pushQ(G,pts,f.n,uvs,ao.map(a=>AOF[a]),ao[0]+ao[2]<ao[1]+ao[3])}}
 const mkG=(G,col)=>{if(!G[0].length)return null;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(G[0],3));g.setAttribute('normal',new THREE.Float32BufferAttribute(G[1],3));g.setAttribute('uv',new THREE.Float32BufferAttribute(G[2],2));if(col)g.setAttribute('color',new THREE.Float32BufferAttribute(G[3],3));g.setIndex(new THREE.Uint32BufferAttribute(col?G[4]:G[3],1));g.computeBoundingSphere();return g};
 const ch=chunks[cx+cz*NC]||(chunks[cx+cz*NC]={meshes:[]});for(const m of ch.meshes){scene.remove(m);m.geometry.dispose()}ch.meshes=[];
 const add=(g,mat,cast)=>{if(!g)return;const m=new THREE.Mesh(g,mat);m.castShadow=cast;m.receiveShadow=true;scene.add(m);ch.meshes.push(m)};
 add(mkG(A.op,true),opMat,true);add(mkG(A.gl,true),glMat,false);add(mkG(A.wa,false),waMat,false);add(mkG(A.pl,false),plMat,false)}
function rebuildAt(x,z){const cx=Math.floor(x/CH),cz=Math.floor(z/CH);const set=new Set([cx+','+cz]);if(x%CH===0)set.add((cx-1)+','+cz);if(x%CH===CH-1)set.add((cx+1)+','+cz);if(z%CH===0)set.add(cx+','+(cz-1));if(z%CH===CH-1)set.add(cx+','+(cz+1));
 for(const k of set){const[a,b]=k.split(',').map(Number);if(a>=0&&b>=0&&a<NC&&b<NC)buildChunk(a,b)}}

// ---------- validateurs : faisceaux ----------
const beamMat=new THREE.MeshBasicMaterial({color:0xffe68a,transparent:true,opacity:.4,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
const beamGeo=new THREE.CylinderGeometry(.12,.12,40,10,1,true),gemGeo=ethGeo(.22,.4,.26,.06,['#fff2b0','#ffd95e','#8a7bef','#6a58e0']);
const vals=new Map();
function addVal(x,y,z){if(vals.has(I(x,y,z)))return;const g=new THREE.Group();const b=new THREE.Mesh(beamGeo,beamMat);b.position.y=21;g.add(b);const d=new THREE.Mesh(gemGeo,ethMat);d.position.y=1.7;g.add(d);g.userData.d=d;g.position.set(x+.5,y,z+.5);scene.add(g);vals.set(I(x,y,z),g)}
function delVal(i){const g=vals.get(i);if(g){scene.remove(g);vals.delete(i)}}

// ---------- main (objet tenu) ----------
const handScene=new THREE.Scene(),handCam=new THREE.PerspectiveCamera(60,1,.01,10);
handScene.add(new THREE.AmbientLight(0xffffff,.55));const hl=new THREE.DirectionalLight(0xffffff,.7);hl.position.set(1,2,1);handScene.add(hl);
const hand=new THREE.Group();handScene.add(hand);let handMesh=null,handKey=null;
function blockBox(id,s){const g=new THREE.BoxGeometry(s,s,s),uv=g.attributes.uv,b=B[id];const map=[b.t[1],b.t[1],b.t[0],b.t[2],b.t[1],b.t[1]];
 for(let f=0;f<6;f++){const[u0,u1,v0,v1]=uvRect(map[f]);for(let k=0;k<4;k++){const i=f*4+k;uv.setXY(i,lerp(u0,u1,uv.getX(i)),lerp(v0,v1,uv.getY(i)))}}uv.needsUpdate=true;return g}
function flatSprite(ti,s){const g=new THREE.PlaneGeometry(s,s),uv=g.attributes.uv,[u0,u1,v0,v1]=uvRect(ti);for(let i=0;i<4;i++)uv.setXY(i,lerp(u0,u1,uv.getX(i)),lerp(v0,v1,uv.getY(i)));uv.needsUpdate=true;return g}
function setHand(){const it=S.bar[S.sel];const key=it||'main';if(key===handKey)return;handKey=key;if(handMesh){hand.remove(handMesh);handMesh.geometry.dispose()}
 if(!it){handMesh=new THREE.Mesh(new THREE.BoxGeometry(.16,.16,.5),new THREE.MeshLambertMaterial({color:0xf6d3b8}));handMesh.position.set(.34,-.32,-.55);handMesh.rotation.set(.2,-.2,0)}
 else if(B[it]&&!isCross(+it)){handMesh=new THREE.Mesh(blockBox(+it,.3),new THREE.MeshLambertMaterial({map:atlasTex,emissiveMap:emisTex,emissive:0xffffff,transparent:!!B[it].glass,alphaTest:B[it].leaf?.5:0}));handMesh.position.set(.4,-.36,-.62);handMesh.rotation.set(.25,.6,0)}
 else{const ti=B[it]?B[it].x:ITEM[it].icon;handMesh=new THREE.Mesh(flatSprite(ti,.5),new THREE.MeshLambertMaterial({map:atlasTex,emissiveMap:emisTex,emissive:0xffffff,alphaTest:.5,side:THREE.DoubleSide}));handMesh.position.set(.42,-.28,-.62);handMesh.rotation.set(0,-.5,.2)}
 hand.add(handMesh)}
resize();addEventListener('resize',resize);

// ---------- icônes (cube isométrique à partir de l'atlas) ----------
const iconCache={};
function icon(it){if(iconCache[it])return iconCache[it];const c=document.createElement('canvas');c.width=c.height=48;const x=c.getContext('2d');x.imageSmoothingEnabled=false;
 const tileImg=ti=>[(ti%AN)*AT,Math.floor(ti/AN)*AT];
 if(B[it]&&!isCross(+it)&&!B[it].water){const b=B[it],k=1/16;
  const face=(ti,m,shade)=>{const[sx,sy]=tileImg(ti);x.setTransform(...m);x.drawImage(atlas,sx,sy,16,16,0,0,16,16);if(shade){x.fillStyle=`rgba(20,14,50,${shade})`;x.fillRect(0,0,16,16)}};
  face(b.t[0],[20*k,-10*k,20*k,10*k,4,14],0);face(b.t[1],[20*k,10*k,0,22*k,4,14],.18);face(b.t[1],[20*k,-10*k,0,22*k,24,24],.34);x.setTransform(1,0,0,1,0,0)}
 else{const ti=B[it]?B[it].x:ITEM[it].icon;const[sx,sy]=tileImg(ti);x.drawImage(atlas,sx,sy,16,16,4,4,40,40)}
 return iconCache[it]=c}
function cloneIcon(it){const c=document.createElement('canvas');c.width=c.height=48;c.getContext('2d').drawImage(icon(it),0,0);return c}

// ---------- registre ----------
function logEv(kind,text,detail){const t=new Date();S.log.unshift({k:kind,t:t.toTimeString().slice(0,5),x:text,d:detail||''});if(S.log.length>200)S.log.length=200;dirty=true;
 const ev=document.createElement('div');ev.className='ev chip';ev.innerHTML=`<b class="${kind}">${{mint:'MINT',burn:'BURN',craft:'CRAFT',nft:'NFT'}[kind]}</b>${text}${detail?` <span>${detail}</span>`:''}`;$('feed').prepend(ev);
 while($('feed').children.length>4)$('feed').lastChild.remove();setTimeout(()=>{ev.style.opacity=0;setTimeout(()=>ev.remove(),600)},4200)}
function give(it,n,why){S.inv[it]=(S.inv[it]||0)+n;S.supply[it]=(S.supply[it]||0)+n;S.totalMint+=n;if(!S.bar.includes(String(it))&&!S.bar.includes(it)){const e=S.bar.indexOf(null);if(e>=0)S.bar[e]=String(it)}logEv('mint',`${n} ${nameOf(+it)}`,why||`jeton #${it}`);dirty=true;ui()}
function take(it,n){S.inv[it]-=n;S.supply[it]=Math.max(0,(S.supply[it]||0)-n);S.totalBurn+=n;if(S.inv[it]<=0){delete S.inv[it];if(!ITEM[it]?.nft){const k=S.bar.indexOf(String(it));if(k>=0)S.bar[k]=null}}dirty=true}

// ---------- joueur ----------
const P={x:SPAWN.x+.5,y:0,z:SPAWN.z+2.5,vy:0,on:false,inWater:false};
let yaw=0,pitch=-.12;
const PW=.3,PH=1.75,EYE=1.6;
function collides(x,y,z){for(let bx=Math.floor(x-PW);bx<=Math.floor(x+PW-1e-4);bx++)for(let by=Math.floor(y);by<=Math.floor(y+PH-1e-4);by++)for(let bz=Math.floor(z-PW);bz<=Math.floor(z+PW-1e-4);bz++){if(bx<0||bz<0||bx>=SX||bz>=SZ||by<0)return true;if(isSolid(get(bx,by,bz)))return true}return false}
function moveAxis(ax,amt){const n=Math.ceil(Math.abs(amt)/.2)||1,d=amt/n;for(let i=0;i<n;i++){P[ax]+=d;if(collides(P.x,P.y,P.z)){if(ax==='y'){if(d<0){P.y=Math.floor(P.y)+1;P.on=true}else P.y=Math.floor(P.y+PH)-PH-1e-3;P.vy=0}else{P[ax]-=d;bumped=true}return}}}
let bumped=false;

// ---------- entrées ----------
const keys=new Set();let playing=false,mining=false,locked=false,noLock=false,dragging=false,jumpHeld=false,sprint=false,regView=false;
addEventListener('keydown',e=>{if(chatOpen||document.activeElement&&document.activeElement.tagName==='INPUT')return;if(e.code==='Enter'&&playing){e.preventDefault();openChat();return}if(e.code==='KeyE'&&(playing||!$('panel').hidden)){togglePanel();return}if(!playing)return;keys.add(e.code);
 if(/^Digit[1-9]$/.test(e.code))select(+e.code.slice(5)-1);if(e.code==='KeyT'){regView=!regView;$('modeTag').hidden=!regView;buildRegView()}if(e.code==='Space')e.preventDefault()});
addEventListener('keyup',e=>keys.delete(e.code));
const cv=renderer.domElement;
function tryLock(){if(touch)return;try{const r=cv.requestPointerLock();if(r&&r.catch)r.catch(()=>{noLock=true})}catch(e){noLock=true}}
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===cv;if(!locked&&playing&&!noLock&&$('panel').hidden&&!chatOpen)pause()});
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('mousedown',e=>{if(!playing||touch)return;if(!locked&&!noLock){tryLock();return}if(e.button===0){mining=true;dragging=true}if(e.button===2)place()});
addEventListener('mouseup',e=>{if(e.button===0){mining=false;dragging=false}});
addEventListener('mousemove',e=>{if(!playing||touch)return;if(locked||(noLock&&dragging))look(e.movementX,e.movementY,.0022)});
addEventListener('wheel',e=>{if(!playing)return;select((S.sel+(e.deltaY>0?1:-1)+9)%9)},{passive:true});
function look(dx,dy,s){yaw-=dx*s;pitch=clamp(pitch-dy*s,-1.55,1.55)}
const stick=$('stick'),knob=$('knob'),move={x:0,y:0};let joyId=null,joyO=null,lookId=null,lookL=null;
cv.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||!playing)return;
 if(e.clientX<innerWidth*.42&&joyId===null){joyId=e.pointerId;joyO=[e.clientX,e.clientY];stick.style.display='block';stick.style.left=e.clientX+'px';stick.style.top=e.clientY+'px';knob.style.transform=''}else if(lookId===null){lookId=e.pointerId;lookL=[e.clientX,e.clientY]}});
cv.addEventListener('pointermove',e=>{if(e.pointerId===joyId){let dx=e.clientX-joyO[0],dy=e.clientY-joyO[1];const l=Math.hypot(dx,dy),m=46;if(l>m){dx*=m/l;dy*=m/l}knob.style.transform=`translate(${dx}px,${dy}px)`;move.x=dx/m;move.y=-dy/m}
 else if(e.pointerId===lookId){look(e.clientX-lookL[0],e.clientY-lookL[1],.005);lookL=[e.clientX,e.clientY]}});
function endP(e){if(e.pointerId===joyId){joyId=null;move.x=move.y=0;stick.style.display='none'}if(e.pointerId===lookId)lookId=null}
cv.addEventListener('pointerup',endP);cv.addEventListener('pointercancel',endP);
function hold(el,on,off){el.addEventListener('pointerdown',e=>{e.preventDefault();el.classList.add('on');on()});['pointerup','pointercancel','pointerleave'].forEach(t=>el.addEventListener(t,()=>{el.classList.remove('on');off()}))}
hold($('tMine'),()=>mining=true,()=>mining=false);hold($('tJump'),()=>jumpHeld=true,()=>jumpHeld=false);hold($('tPlace'),()=>place(),()=>{});
$('invBtn').onclick=()=>togglePanel();

// ---------- visée, minage, pose ----------
function raycast(max){const o=camera.position,d=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
 let x=Math.floor(o.x),y=Math.floor(o.y),z=Math.floor(o.z);const sx=Math.sign(d.x),sy=Math.sign(d.y),sz=Math.sign(d.z),tdx=Math.abs(1/d.x),tdy=Math.abs(1/d.y),tdz=Math.abs(1/d.z);
 let tx=d.x>0?(x+1-o.x)*tdx:(o.x-x)*tdx,ty=d.y>0?(y+1-o.y)*tdy:(o.y-y)*tdy,tz=d.z>0?(z+1-o.z)*tdz:(o.z-z)*tdz,prev=null,t=0;
 while(t<=max){const id=get(x,y,z);if(id&&id!==11)return{x,y,z,id,prev};prev=[x,y,z];if(tx<ty&&tx<tz){x+=sx;t=tx;tx+=tdx}else if(ty<tz){y+=sy;t=ty;ty+=tdy}else{z+=sz;t=tz;tz+=tdz}}return null}
const sel=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004,1.004,1.004)),new THREE.LineBasicMaterial({color:0x1c163a,transparent:true,opacity:.7}));sel.visible=false;scene.add(sel);
const crackTex=[];for(let s=0;s<8;s++){const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.fillStyle='rgba(28,22,58,.75)';let px=8,py=8;for(let k=0;k<(s+1)*5;k++){const a=hash(k,s,99)*6.28;px=clamp(px+Math.round(Math.cos(a)*1.4),0,15);py=clamp(py+Math.round(Math.sin(a)*1.4),0,15);x.fillRect(px,py,1,1);if(k%5===4){px=Math.floor(hash(k,1,98)*16);py=Math.floor(hash(k,2,98)*16)}}
 const t=new THREE.CanvasTexture(c);t.magFilter=t.minFilter=THREE.NearestFilter;crackTex.push(t)}
const crack=new THREE.Mesh(new THREE.BoxGeometry(1.006,1.006,1.006),new THREE.MeshBasicMaterial({map:crackTex[0],transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));crack.visible=false;scene.add(crack);
let target=null,mineKey=-1,mineT=0,swing=0;
function toolMult(id){const it=S.bar[S.sel];const t=it&&ITEM[it]&&ITEM[it].tool;if(!t)return 1;return B[id].stone?t:1+(t-1)*.5}
const parts=[],pGeo=new THREE.BoxGeometry(.12,.12,.12),pMats={};
function avgColor(ti){const[sx,sy]=[(ti%AN)*AT,Math.floor(ti/AN)*AT];const d=ag.getImageData(sx,sy,16,16).data;let r=0,g=0,b=0,n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>100){r+=d[i];g+=d[i+1];b+=d[i+2];n++}return n?`rgb(${r/n|0},${g/n|0},${b/n|0})`:'#fff'}
function burst(x,y,z,id){const ti=B[id].x!=null?B[id].x:B[id].t[1];const c=pMats[ti]||(pMats[ti]=new THREE.MeshLambertMaterial({color:avgColor(ti)}));
 for(let i=0;i<10;i++){const m=new THREE.Mesh(pGeo,c);m.position.set(x+.2+Math.random()*.6,y+.2+Math.random()*.6,z+.2+Math.random()*.6);scene.add(m);parts.push({m,v:[(Math.random()-.5)*3,Math.random()*3+1,(Math.random()-.5)*3],t:.7})}}
function breakBlock(t){
 const id=get(t.x,t.y,t.z);if(!id||id===12)return;const k=I(t.x,t.y,t.z);
 const owned=OWN.get(k)?.serial;commit(k,0,null);burst(t.x,t.y,t.z,id);
 const above=get(t.x,t.y+1,t.z);if(isCross(above)){commit(I(t.x,t.y+1,t.z),0,null)}
 const drop=B[id].drop!==undefined?B[id].drop:id;
 if(drop===101){const n=1+(hash(t.x*7+t.y,t.z,5)<.4?1:0);give(101,n,'extrait du minerai');if(!S.seen.cry){S.seen.cry=1}}
 else if(drop)give(drop,1,owned?`bloc #${owned} repris`:`jeton #${drop}`);
 if(id===13)delVal(k);
 for(const nft of S.nfts)if(S.bar[S.sel]==='nft'+nft.serial)nft.mined=(nft.mined||0)+1;
 dirty=true;rebuildAt(t.x,t.z);if(regView)buildRegView()}
function place(){
 if(!playing||!target||!target.prev)return;const it=S.bar[S.sel];if(!it||!B[it]||!(S.inv[it]>0))return;const id=+it;
 const[x,y,z]=target.prev;if(x<0||y<0||z<0||x>=SX||y>=SY||z>=SZ)return;const cur=get(x,y,z);if(cur&&cur!==11&&!isCross(cur))return;
 if(isSolid(id)&&x+1>P.x-PW&&x<P.x+PW&&y+1>P.y&&y<P.y+PH&&z+1>P.z-PW&&z<P.z+PW)return;
 if(isCross(id)&&![1,2].includes(get(x,y-1,z)))return;
 const k=I(x,y,z);take(it,1);S.serial++;commit(k,id,{by:ME.id,name:ME.name,serial:S.serial});swing=1;
 logEv('burn',`1 ${B[id].n}`,`→ bloc posé #${S.serial}`);
 if(id===13){addVal(x,y,z);if(!S.seen.val){S.seen.val=1;toastInfo('Validateur actif : il frappe un cristal à chaque slot de 12 secondes.')}}
 dirty=true;rebuildAt(x,z);ui();if(regView)buildRegView()}
function toastInfo(t){logEv('nft',t,'')}

// ---------- vue registre (blocs possédés) ----------
let regLines=null;
function buildRegView(){if(regLines){scene.remove(regLines);regLines.geometry.dispose();regLines=null}if(!regView)return;
 const pos=[];const E=[[0,0,0,1,0,0],[1,0,0,1,0,1],[1,0,1,0,0,1],[0,0,1,0,0,0],[0,1,0,1,1,0],[1,1,0,1,1,1],[1,1,1,0,1,1],[0,1,1,0,1,0],[0,0,0,0,1,0],[1,0,0,1,1,0],[1,0,1,1,1,1],[0,0,1,0,1,1]];
 let n=0;for(const[i,o]of OWN){if(o.by!==ME.id)continue;const x=i%SX,z=Math.floor(i/SX)%SZ,y=Math.floor(i/(SX*SZ));if(Math.hypot(x-P.x,y-P.y,z-P.z)>40)continue;if(++n>600)break;for(const e of E)pos.push(x+e[0]*1.01-.005,y+e[1]*1.01-.005,z+e[2]*1.01-.005,x+e[3]*1.01-.005,y+e[4]*1.01-.005,z+e[5]*1.01-.005)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));regLines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xb4a8ff,fog:false,transparent:true,opacity:.9,depthTest:false}));regLines.renderOrder=5;scene.add(regLines)}

// ---------- barre et panneau ----------
function select(i){S.sel=i;ui();const it=S.bar[i];const n=$('selname');n.textContent=it?nameOf(it.startsWith?.('nft')?201:+it):'Main nue';n.style.opacity=1;clearTimeout(select.t);select.t=setTimeout(()=>n.style.opacity=0,1600)}
function ui(){
 const bar=$('bar');if(!bar.children.length)for(let i=0;i<9;i++){const b=document.createElement('button');b.className='slot';b.innerHTML=`<i>${i+1}</i><b></b>`;b.onclick=()=>select(i);bar.appendChild(b)}
 [...bar.children].forEach((b,i)=>{const it=S.bar[i];b.classList.toggle('sel',i===S.sel);const old=b.querySelector('canvas');if(old)old.remove();b.querySelector('b').textContent='';
  if(it){const isN=String(it).startsWith('nft');b.prepend(cloneIcon(isN?201:+it));if(!isN)b.querySelector('b').textContent=S.inv[it]||0}});
 setHand();if(!$('panel').hidden)renderPanel()}
let tab='inv',selItem=null;
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{tab=t.dataset.tab;document.querySelectorAll('.tab').forEach(x=>x.setAttribute('aria-selected',x===t));renderPanel()});
$('closeP').onclick=togglePanel;
function togglePanel(){const p=$('panel');p.hidden=!p.hidden;if(!p.hidden){if(document.pointerLockElement)document.exitPointerLock();mining=false;renderPanel()}else if(playing)tryLock()}
const RECIPES=[
 {out:9,n:4,need:{5:1},d:'Débiter une bûche'},{out:102,n:1,need:{9:3},d:'Outil fongible · minage ×2'},{out:15,n:1,need:{3:2},d:'Tailler le granite'},
 {out:10,n:1,need:{4:2},d:'Fondre le sable'},{out:14,n:1,need:{10:1,101:1},d:'Lumière pour les galeries'},
 {out:201,n:1,need:{9:2,101:3},d:'Objet unique (ERC-721) · minage ×5',nft:1},{out:13,n:1,need:{101:8,15:4},d:'Frappe un cristal par slot'}];
function renderPanel(){
 const body=$('pbody');body.innerHTML='';
 if(tab==='inv'){
  const items=Object.keys(S.inv).filter(k=>S.inv[k]>0);const all=items.map(k=>({k,n:S.inv[k]})).concat(S.nfts.map(n=>({k:'nft'+n.serial,n:1,nft:n})));
  const wrap=document.createElement('div');wrap.className='inv';const grid=document.createElement('div');grid.className='grid';
  if(!all.length)grid.innerHTML='<p style="color:var(--muted);font-size:14px">Ton coffre est vide. Mine quelques blocs.</p>';
  if(!selItem||!all.find(a=>a.k===selItem))selItem=all[0]?.k||null;
  for(const a of all){const b=document.createElement('button');b.className='it'+(a.k===selItem?' sel':'')+(a.nft?' nftc':'');b.appendChild(cloneIcon(a.nft?201:+a.k));if(!a.nft)b.insertAdjacentHTML('beforeend',`<b>${a.n}</b>`);b.onclick=()=>{selItem=a.k;renderPanel()};grid.appendChild(b)}
  wrap.appendChild(grid);const card=document.createElement('div');card.className='card';
  if(selItem){const a=all.find(x=>x.k===selItem);const id=a.nft?201:+a.k;const isBlock=!!B[id];
   card.innerHTML=`<div class="top"></div><dl></dl><div class="btnrow"></div><p></p>`;const top=card.querySelector('.top');top.appendChild(cloneIcon(id));
   top.insertAdjacentHTML('beforeend',`<div><h3>${nameOf(id)}${a.nft?` #${a.nft.serial}`:''}</h3><span class="std">${a.nft?'ERC-721 · unique':'ERC-1155 · fongible'}</span></div>`);
   const dl=card.querySelector('dl');const row=(k,v)=>dl.insertAdjacentHTML('beforeend',`<div><dt>${k}</dt><dd>${v}</dd></div>`);
   if(a.nft){row('Jeton',`#201-${String(a.nft.serial).padStart(4,'0')}`);row('Forgée le',a.nft.date);row('Lieu de forge',a.nft.where);row('Blocs minés avec',a.nft.mined||0);row('Propriétaire','toi')}
   else{row('Identifiant',`#${id}`);row('Dans ton coffre',a.n);row('En circulation',S.supply[id]||a.n);if(isBlock){row('Blocs posés à ton nom',myBlocks())}}
   const br=card.querySelector('.btnrow');const put=document.createElement('button');put.className='b primary';put.textContent=`Placer dans l'emplacement ${S.sel+1}`;put.onclick=()=>{const key=a.nft?a.k:String(id);const ex=S.bar.indexOf(key);if(ex>=0)S.bar[ex]=null;S.bar[S.sel]=key;dirty=true;ui()};br.appendChild(put);
   card.querySelector('p').textContent=a.nft?'Un objet unique a son propre numéro et garde son histoire : qui l\'a forgé, où, et ce qu\'il a accompli.':isBlock?'Miner ce bloc frappe un jeton. Le poser le brûle, et le bloc posé porte ton numéro de série dans le registre.':'Une ressource fongible : chaque unité vaut exactement la même chose qu\'une autre.'}
  else card.innerHTML='<p>Choisis un objet pour voir sa fiche de jeton.</p>';
  wrap.appendChild(card);body.appendChild(wrap);body.insertAdjacentHTML('beforeend','<p class="note">Simulation locale : rien n\'est inscrit sur une vraie blockchain. C\'est une maquette de ce que donneraient des blocs tokenisés.</p>')}
 else if(tab==='craft'){for(const r of RECIPES){const ok=Object.entries(r.need).every(([k,n])=>(S.inv[k]||0)>=n);const d=document.createElement('div');d.className='rec';d.appendChild(cloneIcon(r.out));
  d.insertAdjacentHTML('beforeend',`<div><strong>${r.n>1?r.n+' × ':''}${nameOf(r.out)}</strong><span>${r.d}</span><div class="need">${Object.entries(r.need).map(([k,n])=>`<em class="${(S.inv[k]||0)>=n?'':'ko'}">${n} ${nameOf(+k)} (${S.inv[k]||0})</em>`).join('')}</div></div><button class="b ${ok?'primary':''}" ${ok?'':'disabled'}>Fabriquer</button>`);
  d.querySelector('button').onclick=()=>craft(r);body.appendChild(d)}}
 else{const pl=myBlocks();body.insertAdjacentHTML('beforeend',`<div class="stats"><div><b>${S.totalMint}</b><span>jetons frappés</span></div><div><b>${S.totalBurn}</b><span>jetons brûlés</span></div><div><b>${pl}</b><span>blocs posés à ton nom</span></div><div><b>${S.nfts.length}</b><span>objets uniques</span></div></div>`);
  const log=document.createElement('div');log.className='log';const col={mint:'var(--mint)',burn:'var(--burn)',craft:'var(--gold)',nft:'var(--cyan)'};
  log.innerHTML=S.log.map(l=>`<div><time>${l.t}</time><b style="background:${col[l.k]}">${l.k.toUpperCase()}</b><span>${l.x} <span style="color:var(--muted)">${l.d}</span></span></div>`).join('')||'<p style="color:var(--muted)">Rien d\'inscrit pour l\'instant.</p>';body.appendChild(log)}
}
function craft(r){for(const[k,n]of Object.entries(r.need))take(+k,n);logEv('craft',`${Object.entries(r.need).map(([k,n])=>n+' '+nameOf(+k)).join(' + ')}`,`→ ${r.n} ${nameOf(r.out)}`);
 if(r.nft){const serial=S.nfts.length+1;const n={serial,date:new Date().toLocaleDateString('fr-FR'),where:`${Math.floor(P.x)}, ${Math.floor(P.y)}, ${Math.floor(P.z)}`,mined:0};S.nfts.push(n);S.supply[201]=(S.supply[201]||0)+1;logEv('nft',`Pioche de cristal #${serial}`,'frappée, unique');const e=S.bar.indexOf(null);S.bar[e>=0?e:S.sel]='nft'+serial;dirty=true;ui()}
 else give(r.out,r.n,'fabriqué')}
// objets tenus : outils
const origToolMult=toolMult;
function heldTool(){const it=S.bar[S.sel];if(!it)return 1;if(String(it).startsWith('nft'))return 5;if(ITEM[it]&&ITEM[it].tool)return ITEM[it].tool;return 1}

// ---------- cycle jour et nuit ----------
const KF=[[0,'#0f1030','#2a2458','#000000',.0,.16,'#1d1a40'],[.22,'#3a3f8f','#ff9fb8','#ff9a7a',.15,.3,'#6a5a9e'],[.28,'#8fa8ff','#ffd6e8','#ffcfa6',.7,.52,'#e8d6f2'],[.5,'#86aaff','#e6e6ff','#fff4e0',1,.66,'#e6e2ff'],[.72,'#8fa0f0','#f3dcff','#ffe0c0',.8,.55,'#eadcf6'],[.78,'#6a5fc8','#ffa98a','#ff8a6a',.25,.34,'#9a7ab8'],[.85,'#1a1a48','#3a2f70','#000000',0,.18,'#26214e'],[1,'#0f1030','#2a2458','#000000',0,.16,'#1d1a40']];
const cA=new THREE.Color(),cB=new THREE.Color();
function lerpCol(a,b,t,out){cA.set(a);cB.set(b);return out.copy(cA).lerp(cB,t)}
const fogC=new THREE.Color();
function applyDay(){const t=S.day%1;let i=0;while(t>KF[i+1][0])i++;const a=KF[i],b=KF[i+1],k=(t-a[0])/(b[0]-a[0]);
 lerpCol(a[1],b[1],k,skyU.top.value);lerpCol(a[2],b[2],k,skyU.hor.value);lerpCol(a[3],b[3],k,skyU.sunCol.value);lerpCol(a[6],b[6],k,fogC);
 const si=lerp(a[4],b[4],k),hi=lerp(a[5],b[5],k);sun.intensity=si*.95;hemi.intensity=hi;sun.color.copy(skyU.sunCol.value).lerp(new THREE.Color(0xffffff),.5);
 const ang=(t-.25)*Math.PI*2,dir=new THREE.Vector3(Math.cos(ang),Math.sin(ang),.35).normalize();skyU.sunDir.value.copy(dir);
 const light=dir.y>0?dir:dir.clone().negate();sun.position.set(P.x+light.x*70,P.y+light.y*70,P.z+light.z*70);sun.target.position.set(P.x,P.y,P.z);
 if(dir.y<=0){sun.intensity=.12;sun.color.set(0x9fb0ff)}
 const night=clamp(-dir.y*4,0,1);skyU.night.value=night;stars.material.opacity=night*.9;
 scene.fog.color.copy(fogC);clouds.material.color.copy(skyU.hor.value).lerp(new THREE.Color(0xffffff),.6-.4*night);clouds.material.opacity=.85-.35*night;
 emisBoost=.6+night*.8;opMat.emissiveIntensity=emisBoost;glMat.emissiveIntensity=emisBoost;beamMat.opacity=.25+night*.45;
 const h=Math.floor(t*24),m=Math.floor((t*24-h)*60);$('clockTxt').innerHTML=`Jour ${S.dayN} · ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
 drawSunIcon(dir.y>0)}
let emisBoost=1,lastIconDay=null;
function drawSunIcon(day){if(day===lastIconDay)return;lastIconDay=day;const c=$('sunIcon').getContext('2d');c.clearRect(0,0,9,9);c.fillStyle=day?'#ffd95e':'#e6e8ff';if(day){c.fillRect(2,2,5,5);c.fillRect(4,0,1,9);c.fillRect(0,4,9,1)}else{c.fillRect(2,1,4,7);c.fillStyle='#1c163a';c.fillRect(4,1,3,5)}}

// ---------- boucle ----------
const GENESIS=1606824023;let lastSlot=Math.floor((Date.now()/1000-GENESIS)/12);
let last=performance.now(),bob=0;
function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;
 if(playing&&$('panel').hidden&&!chatOpen){
  let fx=0,fz=0;if(keys.has('KeyW')||keys.has('ArrowUp'))fz++;if(keys.has('KeyS')||keys.has('ArrowDown'))fz--;if(keys.has('KeyD')||keys.has('ArrowRight'))fx++;if(keys.has('KeyA')||keys.has('ArrowLeft'))fx--;
  fx+=move.x;fz+=move.y;const l=Math.hypot(fx,fz);if(l>1){fx/=l;fz/=l}
  const inW=get(Math.floor(P.x),Math.floor(P.y+.5),Math.floor(P.z))===11;P.inWater=inW;
  const run=keys.has('ShiftLeft')||keys.has('ShiftRight');const sp=(run?6.6:4.4)*(inW?.55:1),sn=Math.sin(yaw),cs=Math.cos(yaw);
  const vx=(-sn*fz+cs*fx)*sp,vz=(-cs*fz-sn*fx)*sp;const was=P.on;bumped=false;moveAxis('x',vx*dt);moveAxis('z',vz*dt);
  const jump=keys.has('Space')||jumpHeld;
  if(inW){P.vy=jump?2.6:Math.max(P.vy-9*dt,-2.2)}else{if(jump&&was)P.vy=8.2;else if(touch&&bumped&&was&&l>.3)P.vy=8.2;P.vy=Math.max(P.vy-24*dt,-30)}
  P.on=false;moveAxis('y',P.vy*dt);if(P.y<-10){P.x=SPAWN.x+.5;P.y=SPAWN.y+.1;P.z=SPAWN.z+2.5;P.vy=0}
  if(l>.1||!P.on)dirty=true;if(l>.1&&P.on)bob+=dt*(run?13:9);
  S.day+=dt/480;if(S.day>=1){S.day-=1;S.dayN++}
  // minage
  if(mining&&target&&B[target.id].h!==Infinity){const k=I(target.x,target.y,target.z);if(k!==mineKey){mineKey=k;mineT=0}mineT+=dt*heldTool()*(B[target.id].stone?1:1);const h=B[target.id].h/(B[target.id].stone?1:Math.max(1,heldTool()*.5));const pr=mineT/(B[target.id].h/ (B[target.id].stone?1:1)/(1));
   const need=B[target.id].h;const prog=Math.min(1,mineT/need);crack.visible=true;crack.position.set(target.x+.5,target.y+.5,target.z+.5);crack.material.map=crackTex[Math.min(7,Math.floor(prog*8))];swing=Math.max(swing,.6);
   if(prog>=1){breakBlock(target);mineKey=-1;mineT=0;crack.visible=false}}else{mineKey=-1;mineT=0;crack.visible=false}
  // validateurs
  const slot=Math.floor((Date.now()/1000-GENESIS)/12);if(slot>lastSlot){let own=0;for(const k of vals.keys())if(OWN.get(k)?.by===ME.id)own++;const n=own*Math.min(3,slot-lastSlot);lastSlot=slot;if(n){give(101,n,`récompense du slot ${slot.toLocaleString('fr-FR')}`)}}
 }
 camera.rotation.set(pitch,yaw,0);camera.position.set(P.x,P.y+EYE+Math.sin(bob)*.04,P.z);camera.updateMatrixWorld();
 sky.position.copy(camera.position);stars.position.copy(camera.position);clouds.position.x=camera.position.x;clouds.position.z=camera.position.z;cloudTex.offset.x+=dt*.0015;waterTex.offset.x+=dt*.03;waterTex.offset.y+=dt*.012;
 applyDay();
 if(playing){target=raycast(5.2);if(target){sel.visible=true;sel.position.set(target.x+.5,target.y+.5,target.z+.5);const k=I(target.x,target.y,target.z),ow=OWN.get(k),own=ow?ow.serial:0;const tg=$('target');tg.hidden=false;tg.classList.toggle('own',!!(ow&&ow.by===ME.id));
   const tid=B[target.id].drop!==undefined&&B[target.id].drop?B[target.id].drop:target.id;tg.innerHTML=`${B[target.id].n}<span>${own?`posé par ${ow&&ow.by!==ME.id?ow.name:'toi'} · bloc #${own}`:`naturel · donne le jeton #${tid===0?'—':tid}`}</span>`}else{sel.visible=false;$('target').hidden=true}}
 for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.t-=dt;p.v[1]-=14*dt;p.m.position.x+=p.v[0]*dt;p.m.position.y+=p.v[1]*dt;p.m.position.z+=p.v[2]*dt;p.m.scale.setScalar(Math.max(.05,p.t/.7));if(p.t<=0){scene.remove(p.m);parts.splice(i,1)}}
 for(const g of vals.values()){g.userData.d.rotation.y+=dt*1.5;g.userData.d.position.y=1.7+Math.sin(now/500)*.08}
 bigEth.rotation.y+=dt*.12;
 swing=Math.max(0,swing-dt*3);if(handMesh){const s=Math.sin((1-swing)*Math.PI)*swing;hand.rotation.set(-s*.9,0,0);hand.position.set(Math.sin(bob*.5)*.015,Math.abs(Math.cos(bob*.5))*.012-s*.08,0)}
 updateOthers(dt);renderer.clear();renderer.render(scene,camera);renderer.clearDepth();if(playing)renderer.render(handScene,handCam);
 requestAnimationFrame(frame)}

// ---------- joueurs en ligne, chat ----------
const GEN=1; // version du générateur : l'augmenter à chaque changement de terrain (les tronçons déjà figés ne bougent plus)
const frozen=new Set(),EDITS=new Map();
const ckey=(cx,cz)=>cx+','+cz,coordKey=(x,y,z)=>x+','+y+','+z;
const idxOf=(x,y,z)=>(x<0||y<0||z<0||x>=SX||y>=SY||z>=SZ)?-1:I(x,y,z);
const xyzOf=i=>[i%SX,Math.floor(i/(SX*SZ)),Math.floor(i/SX)%SZ];
function encodeChunk(cx,cz){const out=[];let last=-1,run=0;const push=()=>{if(run)out.push(run,last)};
 for(let y=0;y<SY;y++)for(let z=cz*CH;z<cz*CH+CH;z++)for(let x=cx*CH;x<cx*CH+CH;x++){const v=W[I(x,y,z)];if(v===last&&run<255)run++;else{push();last=v;run=1}}push();
 let b='';for(let i=0;i<out.length;i+=8192)b+=String.fromCharCode.apply(null,out.slice(i,i+8192));return btoa(b)}
function decodeChunk(cx,cz,data,sy){const bin=atob(data);let n=0;const total=CH*CH*sy;const vals=new Uint8Array(total);
 for(let i=0;i+1<bin.length&&n<total;i+=2){const r=bin.charCodeAt(i),v=bin.charCodeAt(i+1);for(let k=0;k<r&&n<total;k++)vals[n++]=v}
 n=0;for(let y=0;y<sy;y++)for(let z=cz*CH;z<cz*CH+CH;z++)for(let x=cx*CH;x<cx*CH+CH;x++){const v=vals[n++];if(y<SY)W[I(x,y,z)]=v}
 for(let y=sy;y<SY;y++)for(let z=cz*CH;z<cz*CH+CH;z++)for(let x=cx*CH;x<cx*CH+CH;x++)W[I(x,y,z)]=0}
function reapplyEdits(cx,cz){for(const[i,id]of EDITS){const[x,,z]=xyzOf(i);if(Math.floor(x/CH)===cx&&Math.floor(z/CH)===cz)W[i]=id}}
function refreshVals(cx,cz){for(const k of[...vals.keys()]){const[x,,z]=xyzOf(k);if(Math.floor(x/CH)===cx&&Math.floor(z/CH)===cz)delVal(k)}
 for(let y=0;y<SY;y++)for(let z=cz*CH;z<cz*CH+CH;z++)for(let x=cx*CH;x<cx*CH+CH;x++)if(W[I(x,y,z)]===13)addVal(x,y,z)}
// Fige le terrain d'origine d'un tronçon au premier contact : il ne dépendra plus jamais du générateur.
function freeze(cx,cz){const k=ckey(cx,cz);if(frozen.has(k))return;frozen.add(k);const data=encodeChunk(cx,cz);
 if(Net.online){Net.freezeChunk({cx,cz,gen:GEN,sy:SY,data}).then(row=>{if(row&&row.data!==data){decodeChunk(cx,cz,row.data,row.sy);reapplyEdits(cx,cz);refreshVals(cx,cz);buildChunk(cx,cz)}}).catch(e=>console.error(e))}
 else{S.chunks[k]=data;dirty=true}}
function commit(idx,id,own){const[x,y,z]=xyzOf(idx);freeze(Math.floor(x/CH),Math.floor(z/CH));
 W[idx]=id;EDITS.set(idx,id);if(own)OWN.set(idx,own);else OWN.delete(idx);
 if(Net.online)Net.setBlock({x,y,z,id,by:own?own.by:null,name:own?own.name:null,serial:own?own.serial:null});
 else{const k=coordKey(x,y,z);S.edits[k]=id;if(own)S.placed[k]=own.serial;else delete S.placed[k]}dirty=true}
function myBlocks(){let n=0;for(const o of OWN.values())if(o.by===ME.id)n++;return n}
function applyBlock(b){const i=idxOf(b.x,b.y,b.z);if(i<0)return;const cx=Math.floor(b.x/CH),cz=Math.floor(b.z/CH),k=ckey(cx,cz);
 EDITS.set(i,b.id);if(b.id&&b.by)OWN.set(i,{by:b.by,name:b.name,serial:b.serial});else OWN.delete(i);
 if(!frozen.has(k)){frozen.add(k);Net.fetchChunk(cx,cz).then(row=>{if(row){decodeChunk(cx,cz,row.data,row.sy);reapplyEdits(cx,cz);refreshVals(cx,cz);rebuildAt(b.x,b.z)}}).catch(e=>console.error(e))}
 W[i]=b.id;if(b.id===13)addVal(b.x,b.y,b.z);else delVal(i);rebuildAt(b.x,b.z);if(regView)buildRegView();
 if(isSolid(b.id)&&collides(P.x,P.y,P.z)){for(let q=0;q<4&&collides(P.x,P.y,P.z);q++)P.y+=1}}
const others=new Map();
function faceTex(hair){const c=document.createElement('canvas');c.width=c.height=8;const x=c.getContext('2d');x.fillStyle='#f6d3b8';x.fillRect(0,0,8,8);x.fillStyle=hair;x.fillRect(0,0,8,2);x.fillRect(0,2,1,2);x.fillRect(7,2,1,2);
 x.fillStyle='#1c163a';x.fillRect(2,4,1,1);x.fillRect(5,4,1,1);x.fillStyle='#ffb3cf';x.fillRect(1,5,1,1);x.fillRect(6,5,1,1);x.fillStyle='#c98a74';x.fillRect(3,6,2,1);
 const t=new THREE.CanvasTexture(c);t.magFilter=t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;return t}
function nameTag(name,color){const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.font='600 30px "Pixelify Sans", monospace';const w=Math.min(240,x.measureText(name).width+44);
 x.fillStyle='rgba(28,22,58,.72)';x.beginPath();x.roundRect?x.roundRect(128-w/2,10,w,44,12):x.rect(128-w/2,10,w,44);x.fill();x.fillStyle=color;x.beginPath();x.arc(128-w/2+18,32,6,0,Math.PI*2);x.fill();
 x.fillStyle='#f4f1ff';x.textBaseline='middle';x.fillText(name,128-w/2+32,33);const t=new THREE.CanvasTexture(c);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true}));s.scale.set(1.8,.45,1);s.renderOrder=10;return s}
function makeAvatar(name,color){
 const g=new THREE.Group(),M=c=>new THREE.MeshLambertMaterial({color:c}),col=new THREE.Color(color),dark=col.clone().multiplyScalar(.7);
 const skin=M(0xf6d3b8),hair=M(dark),face=new THREE.MeshLambertMaterial({map:faceTex('#'+dark.getHexString())});
 const head=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),[skin,skin,hair,skin,skin,face]);head.position.y=1.52;head.castShadow=true;g.add(head);
 const body=new THREE.Mesh(new THREE.BoxGeometry(.5,.66,.28),M(col));body.position.y=.94;body.castShadow=true;g.add(body);
 const limb=(w,h,d,m,x,y)=>{const p=new THREE.Group();p.position.set(x,y,0);const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);b.position.y=-h/2;b.castShadow=true;p.add(b);g.add(p);return p};
 const pants=M(0x6a58e0);const legs=[limb(.24,.62,.26,pants,-.13,.62),limb(.24,.62,.26,pants,.13,.62)],arms=[limb(.18,.62,.22,M(col),-.35,1.26),limb(.18,.62,.22,skin,.35,1.26)];
 const tag=nameTag(name,color);tag.position.y=2.1;g.add(tag);
 scene.add(g);return{g,head,legs,arms,tag,name,color,walk:0,t:null,seen:false}}
function removeOther(id){const o=others.get(id);if(!o)return;scene.remove(o.g);others.delete(id)}
function ensureOther(p){let o=others.get(p.id);if(!o&&p.id!==ME.id){o=makeAvatar(p.name||'Joueur',p.color||'#8a7bef');others.set(p.id,o)}return o}
Net.on('peers',list=>{const ids=new Set(list.map(p=>p.id));for(const id of[...others.keys()])if(!ids.has(id))removeOther(id);for(const p of list)ensureOther(p);
 const names=list.map(p=>p.id===ME.id?'toi':p.name);$('online').hidden=!Net.online;$('onlineTxt').textContent=`${list.length} en ligne · ${names.slice(0,5).join(', ')}${names.length>5?'…':''}`});
Net.on('pos',p=>{const o=ensureOther(p);if(!o)return;o.t=p;if(!o.seen){o.seen=true;o.g.position.set(p.x,p.y,p.z)}});
Net.on('block',b=>applyBlock(b));
Net.on('chat',m=>addChat(m.name,m.color,m.text));
Net.on('status',s=>{if(s==='SAVE_ERROR')logEv('burn','Sauvegarde refusée par le serveur','vérifie le schéma Supabase');if(s==='CLOSED'||s==='CHANNEL_ERROR')$('onlineTxt').textContent='Connexion perdue · reconnexion…'});
function updateOthers(dt){for(const o of others.values()){if(!o.t)continue;const g=o.g,k=Math.min(1,dt*10);const dx=o.t.x-g.position.x,dz=o.t.z-g.position.z;
 g.position.x+=dx*k;g.position.y+=(o.t.y-g.position.y)*k;g.position.z+=dz*k;let dr=o.t.yaw-g.rotation.y;dr=Math.atan2(Math.sin(dr),Math.cos(dr));g.rotation.y+=dr*k;o.head.rotation.x=-(o.t.pitch||0)*.6;
 const sp=Math.hypot(dx,dz)/Math.max(dt,.001);o.walk+=Math.min(sp,8)*dt*1.6;const a=Math.min(1,sp/2)*Math.sin(o.walk)*.7;o.legs[0].rotation.x=a;o.legs[1].rotation.x=-a;o.arms[0].rotation.x=-a;o.arms[1].rotation.x=o.t.m?-1.2+Math.sin(performance.now()/90)*.5:a}}
let lastSent='';setInterval(()=>{if(!Net.online||!playing)return;const p={id:ME.id,name:ME.name,color:ME.color,x:+P.x.toFixed(2),y:+P.y.toFixed(2),z:+P.z.toFixed(2),yaw:+yaw.toFixed(2),pitch:+pitch.toFixed(2),m:mining&&!!target};
 const key=`${p.x},${p.y},${p.z},${p.yaw},${p.pitch},${p.m}`;if(key===lastSent&&Math.random()>.1)return;lastSent=key;Net.sendPos(p)},100);
let chatOpen=false;
function addChat(name,color,text){const d=document.createElement('div');d.className='msg';const n=document.createElement('b');n.textContent=name;n.style.color=color;const t=document.createElement('span');t.textContent=' '+text;d.append(n,t);$('chatLog').appendChild(d);
 while($('chatLog').children.length>8)$('chatLog').firstChild.remove();setTimeout(()=>d.classList.add('old'),9000)}
function openChat(){if(!Net.online){logEv('nft','Le chat demande une connexion en ligne','');return}chatOpen=true;keys.clear();mining=false;$('chatForm').hidden=false;$('chatLog').classList.add('open');if(document.pointerLockElement)document.exitPointerLock();setTimeout(()=>$('chatIn').focus(),0)}
function closeChat(){chatOpen=false;$('chatForm').hidden=true;$('chatLog').classList.remove('open');$('chatIn').blur();if(playing)tryLock()}
$('chatForm').addEventListener('submit',e=>{e.preventDefault();const v=$('chatIn').value.trim().slice(0,140);$('chatIn').value='';if(v){Net.chat(v);addChat(ME.name,ME.color,v)}closeChat()});
$('chatIn').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeChat()}});
$('chatBtn').onclick=()=>chatOpen?closeChat():openChat();

// ---------- démarrage ----------
const PKEY='mines-ether:profil',COLORS=['#8a7bef','#ff9ab8','#7fe8ff','#9fe3c4','#ffd95e','#ffb37a','#b6a4ff'];
let profile;try{profile=JSON.parse(localStorage.getItem(PKEY)||'null')}catch(e){}
if(!profile||!profile.id)profile={id:(crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2)),name:'',color:COLORS[Math.floor(Math.random()*COLORS.length)]};
const qs=new URLSearchParams(location.search);$('pseudo').value=profile.name||'';$('monde').value=qs.get('monde')||'principal';
$('netStatus').textContent=Net.enabled?'Multijoueur prêt : invite tes amis avec le lien du monde.':'Mode solo : ajoute tes clés Supabase dans src/config.js pour jouer en ligne.';
function pause(){playing=false;mining=false;keys.clear();$('title').hidden=false;$('play').textContent='Reprendre';save()}
let booted=false;
$('play').onclick=async()=>{
 if(!booted){const name=$('pseudo').value.trim().slice(0,16);if(!name){$('pseudo').focus();$('netStatus').textContent='Choisis un pseudo pour que tes amis te reconnaissent.';return}
  const world=($('monde').value.trim()||'principal').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9-]+/g,'-').slice(0,32)||'principal';
  profile.name=name;try{localStorage.setItem(PKEY,JSON.stringify(profile))}catch(e){}ME={id:profile.id,name,color:profile.color};
  KEY='mines-ether:'+world;loadState();$('play').disabled=true;$('play').textContent=Net.enabled?'Connexion…':'Génération du monde…';$('pseudo').disabled=$('monde').disabled=true;
  try{history.replaceState(null,'','?monde='+world)}catch(e){}
  try{await boot(world)}catch(e){console.error(e);$('netStatus').textContent='Connexion impossible : '+(e.message||e)+'. Vérifie src/config.js et le schéma.';$('play').disabled=false;$('play').textContent='Réessayer';$('pseudo').disabled=$('monde').disabled=false;return}
  booted=true;$('play').disabled=false;$('shareRow').hidden=!Net.online;$('shareUrl').textContent=location.href}
 $('title').hidden=true;playing=true;tryLock();
 if(!S.seen.intro){S.seen.intro=1;logEv('nft','Bienvenue au sanctuaire du validateur','');setTimeout(()=>logEv('mint','Mine un bloc','il devient un jeton dans ton coffre'),900)}};
$('copyUrl').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('copyUrl').textContent='Lien copié'}catch(e){const r=document.createRange();r.selectNodeContents($('shareUrl'));const s=getSelection();s.removeAllRanges();s.addRange(r)}};
let arm=false;$('reset').onclick=()=>{if(!arm){arm=true;$('reset').textContent='Effacer ta progression locale ? Clique pour confirmer';return}try{localStorage.removeItem(KEY)}catch(e){}location.reload()};
async function boot(world){
 generate();
 let edits=[],rows=[];
 if(Net.enabled){({edits,chunks:rows}=await Net.join(world,ME))}
 else{rows=Object.entries(S.chunks||{}).map(([k,data])=>{const[cx,cz]=k.split(',').map(Number);return{cx,cz,sy:SY,data}});
  edits=Object.entries(S.edits).map(([k,id])=>{const[x,y,z]=k.split(',').map(Number),ser=S.placed[k];return{x,y,z,id,placed_by:ser?ME.id:null,placed_name:ser?ME.name:null,serial:ser||null}})}
 // 1. terrain figé  2. figer ce qui a des modifications sans terrain figé (anciens mondes)  3. modifications par-dessus
 for(const c of rows){if(c.cx<0||c.cz<0||c.cx>=NC||c.cz>=NC)continue;decodeChunk(c.cx,c.cz,c.data,c.sy);frozen.add(ckey(c.cx,c.cz))}
 const need=new Set();for(const e of edits)if(idxOf(e.x,e.y,e.z)>=0)need.add(ckey(Math.floor(e.x/CH),Math.floor(e.z/CH)));
 for(const k of need)if(!frozen.has(k)){const[cx,cz]=k.split(',').map(Number);frozen.add(k);const data=encodeChunk(cx,cz);
  if(Net.enabled){const row=await Net.freezeChunk({cx,cz,gen:GEN,sy:SY,data});if(row&&row.data!==data)decodeChunk(cx,cz,row.data,row.sy)}else S.chunks[k]=data}
 for(const e of edits){const i=idxOf(e.x,e.y,e.z);if(i<0)continue;W[i]=e.id;EDITS.set(i,e.id);if(e.id&&e.placed_by)OWN.set(i,{by:e.placed_by,name:e.placed_name,serial:e.serial})}
 if(S.pos){[P.x,P.y,P.z,yaw,pitch]=S.pos}else{P.x=SPAWN.x+.5+(Math.random()-.5)*2;P.y=SPAWN.y+.1;P.z=SPAWN.z+2.5}
 const total=NC*NC;let n=0;const order=[];for(let cz=0;cz<NC;cz++)for(let cx=0;cx<NC;cx++)order.push([cx,cz]);
 const pcx=Math.floor(P.x/CH),pcz=Math.floor(P.z/CH);order.sort((a,b)=>Math.hypot(a[0]-pcx,a[1]-pcz)-Math.hypot(b[0]-pcx,b[1]-pcz));
 for(const[cx,cz]of order){buildChunk(cx,cz);n++;$('progBar').style.width=(n/total*100)+'%';if(n%3===0)await new Promise(r=>setTimeout(r,0))}
 for(let i=0;i<W.length;i++)if(W[i]===13){const x=i%SX,z=Math.floor(i/SX)%SZ,y=Math.floor(i/(SX*SZ));addVal(x,y,z)}
 if(collides(P.x,P.y,P.z)){P.x=SPAWN.x+.5;P.y=SPAWN.y+.1;P.z=SPAWN.z+2.5}
 ui()}
requestAnimationFrame(frame);
// Outils de test : ouvrir index.html#debug expose window.mines dans la console.
if(location.hash==='#debug')window.mines={get,W,frozen,EDITS,encodeChunk,decodeChunk,get P(){return P},GEN};
})();
