// Sons génératifs : tout est synthétisé avec Web Audio, aucun fichier audio.
// window.Sound : init() au premier clic (exigence des navigateurs), puis des bruitages par matière
// et une ambiance qui suit le jour, la nuit et la profondeur.
(function(){
const KEY='ether-mines:son';
let ctx=null,master=null,sfx=null,amb=null,noiseBuf=null,on=true;
try{on=localStorage.getItem(KEY)!=='0'}catch(e){}

function init(){
 if(ctx){if(ctx.state==='suspended')ctx.resume();return}
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
 ctx=new AC();master=ctx.createGain();master.gain.value=on?1:0;
 const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;master.connect(comp);comp.connect(ctx.destination);
 sfx=ctx.createGain();sfx.gain.value=.55;sfx.connect(master);
 amb=ctx.createGain();amb.gain.value=.0;amb.connect(master);
 // bruit blanc réutilisé par tous les bruitages
 noiseBuf=ctx.createBuffer(1,ctx.sampleRate*1.5,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
 startPad()}

const now=()=>ctx.currentTime;
function env(g,t,a,peak,dec){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0005,t+a+dec)}
// souffle filtré : la base des pas, coups et cassures
function noise(type,freq,q,peak,dec,t=now(),dest=sfx,rate=1){
 const s=ctx.createBufferSource();s.buffer=noiseBuf;s.playbackRate.value=rate;const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;
 const g=ctx.createGain();env(g,t,.004,peak,dec);s.connect(f);f.connect(g);g.connect(dest);s.start(t,Math.random()*1.2);s.stop(t+dec+.05)}
function tone(freq,type,peak,dec,t=now(),dest=sfx,slide=0,a=.005){
 const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(freq*slide,t+dec);
 const g=ctx.createGain();env(g,t,a,peak,dec);o.connect(g);g.connect(dest);o.start(t);o.stop(t+a+dec+.05)}

// chaque matière a sa couleur de bruit : [filtre, fréquence, Q, décroissance]
const MAT={herbe:['bandpass',900,.8,.09],sable:['highpass',2400,.5,.1],neige:['highpass',3200,.7,.12],bois:['bandpass',520,3,.08],verre:['bandpass',3800,6,.07],pierre:['bandpass',1500,1.6,.06]};
const m=k=>MAT[k]||MAT.pierre;
const jitter=v=>v*(.85+Math.random()*.3);

const Sound={
 init,get on(){return on},
 toggle(){on=!on;try{localStorage.setItem(KEY,on?'1':'0')}catch(e){}if(master)master.gain.setTargetAtTime(on?1:0,now(),.05);return on},
 step(k){if(!ctx)return;const[t,f,q,d]=m(k);noise(t,jitter(f),q,.22,d);if(k==='bois')tone(jitter(130),'sine',.08,.06)},
 hit(k){if(!ctx)return;const[t,f,q,d]=m(k);noise(t,jitter(f*1.3),q+1,.3,d*.8);if(k==='pierre'||k==='verre')tone(jitter(k==='verre'?2200:900),'triangle',.05,.05)},
 brk(k){if(!ctx)return;const[t,f,q,d]=m(k),T=now();noise(t,f,q,.45,d*2.6,T);noise('lowpass',f*.5,1,.3,d*3,T+.02,sfx,.7);
  if(k==='verre')for(let i=0;i<5;i++)tone(2000+Math.random()*2500,'sine',.06,.18,T+i*.025);
  if(k==='pierre')tone(95,'sine',.18,.15,T,sfx,.6)},
 place(k){if(!ctx)return;const[t,f,q,d]=m(k),T=now();noise(t,f*.8,q,.35,d*1.4,T);tone(k==='verre'?1400:k==='bois'?180:220,'sine',.16,.1,T,sfx,.7)},
 // éclat d'éther pur, cristal : arpège pentatonique
 chime(){if(!ctx)return;const T=now();[0,4,7,11,14].forEach((s,i)=>tone(880*Math.pow(2,s/12),'sine',.09,.9,T+i*.06,sfx,1,.01))},
 click(){if(!ctx)return;const T=now();tone(1800,'square',.05,.02,T);noise('bandpass',3000,4,.25,.03,T);tone(420,'triangle',.08,.06,T+.03)},
 plate(){if(!ctx)return;const T=now();noise('lowpass',400,1,.4,.08,T);tone(160,'sine',.15,.1,T,sfx,.8)},
 door(){if(!ctx)return;const T=now();noise('bandpass',380,2.5,.35,.22,T,sfx,.8);tone(110,'sawtooth',.03,.25,T,sfx,1.3,.03);noise('lowpass',250,1,.4,.08,T+.22)},
 // appelé chaque image : fondu de l'ambiance + petits évènements (oiseaux, grillons, gouttes)
 tick(dt,night,under,water){if(!ctx||!on)return;const T=now();
  amb.gain.setTargetAtTime(.9,T,1.5);padLP.frequency.setTargetAtTime(water?380:under?600:900+(1-night)*900,T,.8);
  birdT-=dt;if(birdT<=0){birdT=1.5+Math.random()*5;
   if(under)drip(T);else if(night<.4&&Math.random()<.8)bird(T);else if(night>.6)cricket(T)}}
};
// ambiance : nappe en ré lydien, accords qui glissent lentement
let padLP=null,birdT=3;
const ROOT=146.83,LYD=[0,2,4,6,7,9,11];
function startPad(){
 padLP=ctx.createBiquadFilter();padLP.type='lowpass';padLP.frequency.value=1200;padLP.Q.value=.4;
 const pg=ctx.createGain();pg.gain.value=.05;padLP.connect(pg);pg.connect(amb);
 // écho léger pour l'espace
 const dl=ctx.createDelay(1);dl.delayTime.value=.42;const fb=ctx.createGain();fb.gain.value=.35;pg.connect(dl);dl.connect(fb);fb.connect(dl);const wet=ctx.createGain();wet.gain.value=.5;dl.connect(wet);wet.connect(amb);
 const voices=[0,1,2,3].map(i=>{const o=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';o2.type='sine';o2.detune.value=7;g.gain.value=.0;o.connect(g);o2.connect(g);g.connect(padLP);o.start();o2.start();return{o,o2,g}});
 const chords=[[0,4,7,11],[2,6,9,14],[4,7,11,16],[-3,2,6,9],[0,4,9,13]];let ci=0;
 const next=()=>{const T=now(),c=chords[ci++%chords.length];voices.forEach((v,i)=>{const f=ROOT*Math.pow(2,c[i]/12);v.o.frequency.setTargetAtTime(f,T,1.2);v.o2.frequency.setTargetAtTime(f*2,T,1.2);v.g.gain.setTargetAtTime(i===0?.5:.28,T,2)});
  // une note de mélodie de temps en temps
  if(Math.random()<.6){const deg=LYD[Math.floor(Math.random()*LYD.length)];tone(ROOT*4*Math.pow(2,deg/12),'sine',.035,2.4,T+Math.random()*3,amb,1,.4)}
  setTimeout(next,9000+Math.random()*4000)};
 next()}
function bird(T){const n=2+Math.floor(Math.random()*4),base=2200+Math.random()*1400;for(let i=0;i<n;i++){tone(base*(1+Math.random()*.25),'sine',.03,.07,T+i*.11,amb,1.4+Math.random()*.4,.01)}}
function cricket(T){const f=4200+Math.random()*600;for(let i=0;i<3;i++)for(let j=0;j<4;j++)tone(f,'square',.006,.012,T+i*.18+j*.024,amb)}
function drip(T){tone(900+Math.random()*900,'sine',.05,.18,T,amb,.55,.002)}
window.Sound=Sound;
})();
