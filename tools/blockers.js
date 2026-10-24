// Why is each stub still a stub? Groups by the first sentence shape the compiler cannot place.
//   node tools/blockers.js [top=60] [spell|monster]
const L=require('../LocalCards'),CS=require('../CardScripts');CS.loadAll();
const norm=t=>t.replace(/"[^"]+"/g,'Q').replace(/\d[\d,]*/g,'N').replace(/\b(DARK|LIGHT|EARTH|WATER|FIRE|WIND)\b/g,'ATTR');
const top=+process.argv[2]||60,which=process.argv[3]||'';const g=new Map();let n=0;
for(const r of L.all()){const c=L.toApiShape(r);if(CS.cardStatus(c).status!=='stub')continue;const isM=/Monster/.test(c.type);
 if(which==='spell'&&isM||which==='monster'&&!isM)continue;n++;
 const t=(c.desc||'').replace(/\* The above[^\n]*/gi,'').replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();
 const k=(isM?'M ':'S ')+norm(t.split(/(?<=[.])\s+/)[0]).slice(0,95);(g.get(k)||g.set(k,[]).get(k)).push(c.name);}
console.log('stubs',n);[...g].sort((a,b)=>b[1].length-a[1].length).slice(0,top).forEach(([k,v])=>console.log(String(v.length).padStart(3)+'x '+k+'  e.g. '+v[0]));
