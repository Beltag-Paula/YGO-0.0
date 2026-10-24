// Which clause stops each stub card from compiling? Groups by normalised failing clause so the next grammar rule is obvious.
//   node tools/diagnose.js [top=40] [spell|monster]
const L=require('../LocalCards'),CS=require('../CardScripts');CS.loadAll();
const C=require('../scripts/96_text_compiler');
const norm=t=>t.replace(/"[^"]+"/g,'"Q"').replace(/\d[\d,]*/g,'N').trim();
const top=+process.argv[2]||40, which=process.argv[3]||'';
const g=new Map();
for(const r of L.all()){const c=L.toApiShape(r);if(CS.cardStatus(c).status!=='stub')continue;
 const isM=/Monster/.test(c.type); if(which==='spell'&&isM||which==='monster'&&!isM)continue;
 const text=(c.desc||'').replace(/\* The above text[^\n]*/gi,'').replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();
 const bad=C.firstUnknown(text,isM);
 const k=norm(bad);(g.get(k)||g.set(k,[]).get(k)).push(c.name);}
[...g].sort((a,b)=>b[1].length-a[1].length).slice(0,top).forEach(([k,v])=>console.log(String(v.length).padStart(3)+'x '+k.slice(0,150)+'   e.g. '+v.slice(0,2).join(' / ')));
