import { spawn } from 'node:child_process'
const srv = spawn('node', ['src/index.ts'], { cwd: new URL('..', import.meta.url).pathname, stdio: ['pipe','pipe','pipe'] })
let buf=''; const w=new Map(); let id=0
srv.stdout.on('data', d => { buf += d.toString(); let i
  while ((i=buf.indexOf('\n'))>=0){ const l=buf.slice(0,i).trim(); buf=buf.slice(i+1); if(!l)continue
    let m; try{m=JSON.parse(l)}catch{continue}; if(m.id!=null&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id)} } })
srv.stderr.on('data', d => { const s=d.toString(); if(!s.includes('initialize ok')) process.stderr.write('[srv] '+s) })
const rpc=(method,params)=>new Promise((res,rej)=>{ const i=++id; w.set(i,res)
  srv.stdin.write(JSON.stringify({jsonrpc:'2.0',id:i,method,params})+'\n'); setTimeout(()=>rej(new Error('timeout '+method)),240000) })
await rpc('initialize',{protocolVersion:'2025-06-18',clientCapabilities:{}})
const call = async (label, args) => {
  const t=Date.now(); const r=await rpc('tools/call',{name:'agy_turn',arguments:args})
  const txt=r.result.content[0].text; const meta=txt.split('agy-mcp: ')[1]||''
  let j={}; try{j=JSON.parse(meta)}catch{}
  console.log(`${label.padEnd(22)} wall=${Date.now()-t}ms  in=${j.usage?.input_tokens} cache=${j.usage?.cache_read_input_tokens} out=${j.usage?.output_tokens} tools=${j.toolUses} reused=${j.reusedProcess}`)
  return j.conversationId
}
const cid = await call('1 new session (cold)', { prompt:'Reply with ONLY the word PONG' })
await call('2 same session (warm)',    { prompt:'Reply with ONLY the word PONG', conversationId: cid })
await call('3 same session + tool call',  { prompt:'Run this exact shell command with run_command: echo hi — then reply ONLY DONE.', conversationId: cid })
await call('4 same session (warm again)',  { prompt:'Reply with ONLY the word PONG', conversationId: cid })
srv.kill('SIGKILL')
