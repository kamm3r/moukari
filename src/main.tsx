import {useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Camera as CameraIcon, Upload, CircleHelp, ArrowUpRight, Check, RotateCcw} from 'lucide-react'
import {Camera} from './Camera'
import {Playback} from './Playback'
import type {Job,Result,Turn} from './types'
import './style.css'

async function request<T>(url:string):Promise<T>{
  const r=await fetch(url)
  if(!r.ok){const error=await r.json().catch(()=>({detail:`Server returned ${r.status}`}));throw new Error(error.detail)}
  return r.json()
}
function initialId(){const hash=location.hash.slice(1);return /^[a-f0-9]{32}$/.test(hash)?hash:null}
function App(){
  const [jobId,setJobId]=useState<string|null>(initialId)
  const [job,setJob]=useState<Job|null>(null)
  const [result,setResult]=useState<Result|null>(null)
  const [error,setError]=useState('')
  const [connection,setConnection]=useState('')
  const [uploading,setUploading]=useState<number|null>(null)
  const [camera,setCamera]=useState(false)
  const [preview,setPreview]=useState('')
  const [filename,setFilename]=useState('Your throw')
  const [selected,setSelected]=useState<Turn|null>(null)
  const [drag,setDrag]=useState(false)
  const [help,setHelp]=useState(false)
  const input=useRef<HTMLInputElement>(null)
  const upload=useRef<XMLHttpRequest|null>(null)
  const busy=uploading!==null||!!jobId&&(!job||job.state==='queued'||job.state==='processing')
  useEffect(()=>()=>{upload.current?.abort()},[])
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview])
  useEffect(()=>{
    if(!jobId)return
    let alive=true,timer:ReturnType<typeof setTimeout>
    async function poll(){
      try{
        const next=await request<Job>(`/api/analyses/${jobId}`)
        if(!alive)return
        setJob(next);setConnection('')
        if(next.state==='complete'){
          const data=await request<Result>(`/api/analyses/${jobId}/result`)
          if(alive)setResult(data)
          return
        }
        if(next.state==='failed')return
      }catch(e){if(alive)setConnection(`Cannot retrieve analysis. ${e instanceof Error?e.message:''} Retrying…`)}
      if(alive)timer=setTimeout(poll,1500)
    }
    void poll()
    return ()=>{alive=false;clearTimeout(timer)}
  },[jobId])
  function analyze(file:File){
    setCamera(false)
    if(!/\.(mp4|mov|webm|m4v)$/i.test(file.name)){setError('Choose an MP4, MOV or WebM video.');return}
    if(!file.size||file.size>250*1024*1024){setError('Choose a nonempty video smaller than 250 MB.');return}
    setError('');setConnection('');setResult(null);setJob(null);setJobId(null);setSelected(null);location.hash=''
    setFilename(file.name);setPreview(URL.createObjectURL(file));setUploading(0)
    const form=new FormData();form.append('file',file)
    const xhr=new XMLHttpRequest();upload.current=xhr
    xhr.open('POST','/api/analyses');xhr.timeout=180000
    xhr.upload.onprogress=e=>{if(e.lengthComputable)setUploading(Math.round(e.loaded/e.total*100))}
    xhr.onload=()=>{
      setUploading(null)
      try{
        const response=JSON.parse(xhr.responseText)
        if(xhr.status<200||xhr.status>=300)throw new Error(response.detail||'Upload failed.')
        setJob(response);setJobId(response.id);location.hash=response.id
      }catch(e){setError(e instanceof Error?e.message:'Unexpected server response.')}
    }
    xhr.onerror=()=>{setUploading(null);setError('Cannot reach the server. Check that Moukari is running and try again.')}
    xhr.ontimeout=()=>{setUploading(null);setError('Upload timed out. Try a shorter video.')}
    xhr.onabort=()=>setUploading(null)
    xhr.send(form)
  }
  function reset(){setJobId(null);setJob(null);setResult(null);setPreview('');setSelected(null);setError('');setConnection('');location.hash=''}
  const source=result&&jobId?`/api/analyses/${jobId}/video`:preview
  return <div className="app">
    <header><a href="/" className="brand" aria-label="Moukari home"><svg width="35" height="35" viewBox="0 0 35 35" aria-hidden="true"><circle cx="15" cy="21" r="9" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M15 21L29 5" stroke="currentColor" strokeWidth="2"/><circle cx="29" cy="5" r="4" fill="currentColor"/></svg>Moukari</a><span className="event">Hammer training</span><button className="quiet" onClick={()=>setHelp(!help)} aria-expanded={help}><CircleHelp size={17}/> Filming guide</button></header>
    <main>
      <div className="intro"><div><h1>A closer look at your throw.</h1><p>Record or upload. Inspect your movement, one rotation at a time.</p></div><span className="build-label">Development build · measurements unvalidated</span></div>
      {help&&<section className="guide"><h2>Give the camera a clear view</h2><p>Use a steady camera outside the throwing area. Keep the entire athlete, feet, circle and hammer in frame. Film one throw at normal speed, preferably 60 fps or higher. Avoid zooming or panning during the turns.</p><p>Indoor net throws can support body analysis. Actual landing measurement needs the first ground contact and known field geometry. Distance and hammer-speed measurement are not implemented in this build.</p><button onClick={()=>setHelp(false)}>Got it</button></section>}
      <div className="workspace">
        <section className="video-column" aria-label="Throw workspace">
          <div className="section-heading"><h2>{source?filename:'Your next throw'}</h2>{result&&<button className="quiet" onClick={reset}><RotateCcw size={15}/> New video</button>}</div>
          {camera?<Camera onVideo={analyze} onClose={()=>setCamera(false)}/>:source?<Playback src={source} result={result} selection={selected}/>:<div className={`dropzone ${drag?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(!busy&&e.dataTransfer.files[0])analyze(e.dataTransfer.files[0])}}>
            <svg className="field" viewBox="0 0 480 245" fill="none" aria-hidden="true"><path d="M194 153L59 8M286 153L421 8" stroke="#b9c8e8" strokeWidth="2"/><ellipse cx="240" cy="167" rx="89" ry="36" stroke="#91a8d3" strokeWidth="3"/><ellipse cx="240" cy="167" rx="100" ry="44" stroke="#d4def0"/><path d="M241 160L322 77" stroke="#244cba" strokeWidth="2"/><circle cx="322" cy="77" r="11" fill="#244cba"/><circle cx="241" cy="160" r="5" fill="#244cba"/><path d="M293 56C337 60 363 85 365 113" stroke="#91a8d3" strokeWidth="2" strokeDasharray="5 6"/></svg>
            <h2>Bring a throw into focus</h2><p>Drop your video here, or choose a recording below.</p><div className="input-actions"><button className="primary" disabled={busy} onClick={()=>input.current?.click()}><Upload size={18}/> Upload video</button><button disabled={busy} onClick={()=>setCamera(true)}><CameraIcon size={18}/> Record a throw</button></div><small>MP4, MOV or WebM. Up to 60 seconds and 250 MB.</small>
          </div>}
          <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" hidden onChange={e=>{const f=e.target.files?.[0];if(f)analyze(f);e.target.value=''}}/>
          {error&&<div className="error" role="alert">{error}<button onClick={()=>input.current?.click()}>Choose another video</button></div>}
          {connection&&<div className="error" role="status">{connection}<button onClick={reset}>Start a new analysis</button></div>}
          {(busy||job?.state==='failed')&&<section className="progress-panel" aria-live="polite"><div><strong>{uploading!==null?`Uploading ${uploading}%`:job?.message||'Connecting to analysis'}</strong><span>{uploading!==null?uploading:job?.progress||0}%</span></div><progress max="100" value={uploading!==null?uploading:job?.progress||0}/>{job?.state==='failed'&&<button onClick={()=>input.current?.click()}>Try another video</button>}</section>}
          {result&&<><div className="result-heading"><h2>Detected rotations</h2><a href={`/api/analyses/${jobId}/result`} download="analysis.json">Download analysis <ArrowUpRight size={15}/></a></div><p className="muted">Complete pelvis revolutions estimated from body pose. Select a row to inspect the interval.</p>
            {result.turns.length?<div className="table-scroll"><table><thead><tr><th>Rotation</th><th>Video interval</th><th>Duration</th><th>Rotation rate</th></tr></thead><tbody>{result.turns.map(turn=><tr key={turn.number} className={selected?.number===turn.number?'selected':''}><td><button className="turn-button" onClick={()=>setSelected({...turn})}>Play rotation {turn.number}</button></td><td>{turn.start.toFixed(2)}–{turn.end.toFixed(2)} s</td><td>{turn.duration.toFixed(3)} s</td><td>{turn.rps.toFixed(2)} rev/s <small>{turn.degreesPerSecond.toFixed(0)}°/s</small></td></tr>)}</tbody></table></div>:<div className="no-turns">No complete rotation could be tracked reliably in this clip. Try a clear, steady view of the entire athlete.</div>}
            <details className="notes"><summary>Tracking details and limitations</summary><p>Body tracked in {result.coverage}% of sampled frames. {result.sampleCount} samples, up to 30 per second. Source playback rate {result.fps??'unknown'} fps.</p>{result.notes.map(note=><p key={note}>{note}</p>)}</details></>}
          {!source&&!camera&&<div className="capture-tip"><Check size={19}/><p>Keep the camera steady and the whole athlete in view. <button className="text-button" onClick={()=>setHelp(true)}>See filming guide</button></p></div>}
        </section>
        <aside><section className="analysis-panel"><h2>Throw analysis</h2><p className="muted">{result?'What this video supports.':'Your results will appear here after processing.'}</p>
          <div className="metric"><span>Athlete rotations</span><strong>{result?result.turns.length:'—'}</strong><small>{result?'Detected complete pelvis revolutions':'Automatic body tracking'}</small></div>
          <div className="metric"><span>Hammer speed</span><strong>Unavailable</strong><small>{result?result.hammerSpeed.reason:'Requires calibrated tracking of the hammer itself.'}</small></div>
          <div className="metric"><span>Predicted distance</span><strong>Unavailable</strong><small>{result?result.predictedDistance.reason:'Requires validated release speed, angle and height.'}</small></div>
          <div className="metric"><span>Actual landing distance</span><strong>Unavailable</strong><small>{result?result.landingDistance.reason:'Requires ground impact and calibrated field geometry.'}</small></div>
          <p className="measurement-note">Distance and hammer speed are not implemented. This build measures video rotation intervals; it is not yet a validated throwing measurement tool.</p>
        </section><p className="storage-note">Videos stay on the machine running Moukari. No video is sent to an external AI service.</p></aside>
      </div>
    </main><footer><span>Moukari</span><span>Local video analysis</span></footer>
  </div>
}
createRoot(document.getElementById('root')!).render(<App/> )
