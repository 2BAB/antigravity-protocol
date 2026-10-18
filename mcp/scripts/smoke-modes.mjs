import { spawn } from 'node:child_process'
const srv = spawn('node', ['src/index.ts'], { cwd: new URL('..', import.meta.url).pathname, stdio: ['pipe','pipe','pipe'] })
let buf=''; const w=new Map(); let id=0
srv.stdout.on('data', d => { buf += d.toString(); let i
  while ((i=buf.indexOf('\n'))>=0){ const l=buf.slice(0,i).trim(); buf=buf.slice(i+1); if(!l)continue
    let m; try{m=JSON.parse(l)}catch{continue}; if(m.id!=null&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id)} } })
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d.toString()))
const rpc=(method,params)=>new Promise((res,rej)=>{ const i=++id; w.set(i,res)
  srv.stdin.write(JSON.stringify({jsonrpc:'2.0',id:i,method,params})+'\n'); setTimeout(()=>rej(new Error('timeout '+method)),240000) })
await rpc('initialize',{protocolVersion:'2025-06-18',clientCapabilities:{}})
const turn = async (label, args) => {
  const t=Date.now(); const r=await rpc('tools/call',{name:'agy_turn',arguments:args})
  const txt=r.result.content[0].text
  let meta={}; try{ meta=JSON.parse(txt.split('agy-mcp: ')[1]) }catch{}
  console.log(`${label.padEnd(26)} wall=${((Date.now()-t)/1000).toFixed(1)}s mode=${meta.mode} in=${meta.usage?.input_tokens} conv=${String(meta.conversationId).slice(0,8)}`)
  return meta.conversationId
}
const cid = await turn('1 default (persistent,new)', { prompt:'Reply with ONLY the word ONE' })
await turn('2 same cid (persistent warm)', { prompt:'Reply with ONLY the word TWO', conversationId: cid })
await turn('3 stateless (one process)',    { prompt:'Reply with ONLY the word THREE', stateless:true })
await turn('4 stateless + continue',       { prompt:'Reply with ONLY the word FOUR', stateless:true, continueSession:true })
srv.kill('SIGKILL')
