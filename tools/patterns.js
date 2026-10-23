// Groups the still-unscripted cards by the shape of their text, so one strict implementation can cover many cards.
const L=require('../LocalCards'),CS=require('../CardScripts');CS.loadAll();
const norm=t=>t.replace(/"[^"]+"/g,'"Q"').replace(/\d[\d,]*/g,'N').replace(/\s+/g,' ').trim();
const rows=L.all().map(r=>({r,c:L.toApiShape(r)})).filter(x=>CS.cardStatus(x.c).status==='stub');
const groups=new Map();
for(const {c} of rows){ const k=(/Monster/.test(c.type)?'M':'S')+'|'+norm(c.desc||''); (groups.get(k)||groups.set(k,[]).get(k)).push(c.name); }
const arr=[...groups].sort((a,b)=>b[1].length-a[1].length);
console.log('stubs',rows.length,'distinct texts',arr.length);
const top=+process.argv[2]||30;
arr.slice(0,top).forEach(([k,v])=>console.log(v.length+'x '+k.slice(0,170)+'  e.g. '+v.slice(0,2).join(' / ')));
// sentence-level frequency
const sent=new Map();
for(const {c} of rows) for(const s of (c.desc||'').split(/(?<=[.;])\s+/)){const n=norm(s); if(n.length>12) sent.set(n,(sent.get(n)||0)+1)}
console.log('\n--- most common sentences');
[...sent].sort((a,b)=>b[1]-a[1]).slice(0,+process.argv[3]||40).forEach(([s,n])=>console.log(n+'x '+s.slice(0,160)));
