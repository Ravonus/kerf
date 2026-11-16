// Let the server-rendered priority artwork paint before hydration competes for its frame.
import { esc, json } from './text'
/** Keep ordinary pages eager; media pages prefetch code and start after paint or user intent. */
export function entryScript(entry: string, media: boolean, streaming = false) {
  if (!media)
    return `<script type="module"${streaming ? ' async' : ''} src="${esc(entry)}"></script>\n`
  return `<script type="module"${streaming ? ' async' : ''}>let started=false;const run=()=>{if(started)return;started=true;clearTimeout(deadline);events.forEach(e=>window.removeEventListener(e,run));import(${json(entry)})},events=['pointerdown','keydown','scroll','wheel'],deadline=setTimeout(run,5000);events.forEach(e=>window.addEventListener(e,run,{once:true,passive:true}));if(window.__wq){window.__wq.w=run;if(window.__wq.q.length)run()};Promise.all([...document.images].filter(i=>i.fetchPriority==='high').map(i=>i.decode().catch(()=>{}))).then(()=>requestAnimationFrame(()=>requestAnimationFrame(run)));</script>\n`
}
