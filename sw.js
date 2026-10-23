// SoundPath service worker. The app opens from the copy on the device straight away, on any connection,
// then checks for a newer copy quietly in the background. Nothing waits on the network.
const SHELL='soundpath-shell-v3',KEEP=[SHELL,'soundpath-lib-v2'];
const CORE=['./','index.html','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png','jspdf.umd.min.js'];
const sig=r=>r?['etag','last-modified','content-length'].map(h=>r.headers.get(h)||'').join('|'):'';
self.addEventListener('install',e=>{self.skipWaiting();
 e.waitUntil(caches.open(SHELL).then(c=>Promise.all(CORE.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})))))});
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 for(const k of await caches.keys())if(/^soundpath/i.test(k)&&!KEEP.includes(k))await caches.delete(k);
 await self.clients.claim()})()));
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url);
 // the app's own update check (HEAD, or a no-store GET) must reach the network, so let those through untouched
 if(r.method!=='GET'||u.origin!==location.origin||r.cache==='no-store'||(r.headers&&r.headers.has('range')))return;
 const nav=r.mode==='navigate',home=new URL('index.html',self.registration.scope).href,key=nav?home:r.url;
 e.respondWith((async()=>{
  const hit=await caches.match(key,{ignoreSearch:true});
  const refresh=fetch(r).then(async res=>{
   if(res&&res.ok&&res.type==='basic'){await(await caches.open(SHELL)).put(key,res.clone());
    if(hit&&(nav||u.pathname.endsWith('/index.html'))&&sig(res)&&sig(res)!==sig(hit))
     for(const c of await self.clients.matchAll())c.postMessage('sp-update')}
   return res}).catch(()=>null);
  if(hit){e.waitUntil(refresh);return hit}
  const res=await refresh;
  return res||(nav?await caches.match(home):Response.error())})())});
