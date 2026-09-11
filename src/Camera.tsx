import {useEffect, useRef, useState} from 'react'

export function Camera({onVideo,onClose}:{onVideo:(file:File)=>void;onClose:()=>void}) {
  const video=useRef<HTMLVideoElement>(null)
  const stream=useRef<MediaStream|null>(null)
  const recorder=useRef<MediaRecorder|null>(null)
  const timer=useRef<ReturnType<typeof setInterval>|null>(null)
  const [ready,setReady]=useState(false)
  const [recording,setRecording]=useState(false)
  const [seconds,setSeconds]=useState(0)
  const [error,setError]=useState('')
  useEffect(()=>{
    let live=true
    async function open(){
      try {
        if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined') throw new Error('Camera recording needs HTTPS or localhost and a browser with recording support. Upload an original video instead.')
        const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:60}}})
        if(!live){camera.getTracks().forEach(t=>t.stop());return}
        stream.current=camera
        if(video.current)video.current.srcObject=camera
        setReady(true)
      }catch(e){if(live)setError(e instanceof Error?e.message:'Could not open the camera.')}
    }
    void open()
    return ()=>{
      live=false
      if(timer.current)clearInterval(timer.current)
      if(recorder.current){recorder.current.onstop=null;recorder.current.ondataavailable=null;recorder.current.onerror=null;if(recorder.current.state!=='inactive')recorder.current.stop()}
      stream.current?.getTracks().forEach(t=>t.stop())
    }
  },[])
  function stop(){if(recorder.current?.state==='recording')recorder.current.stop()}
  function start(){
    if(!stream.current)return
    try {
      const type=['video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))
      const capture=new MediaRecorder(stream.current,type?{mimeType:type}:{})
      let chunks:Blob[]=[];let size=0;let failed=false
      recorder.current=capture
      capture.ondataavailable=e=>{size+=e.data.size;if(size>250*1024*1024){failed=true;setError('Recording exceeded 250 MB. Record a shorter clip.');stop()}else chunks.push(e.data)}
      capture.onerror=()=>{failed=true;setError('Recording was interrupted. Try again.');stop()}
      capture.onstop=()=>{
        if(timer.current)clearInterval(timer.current)
        setRecording(false);setReady(false)
        stream.current?.getTracks().forEach(t=>t.stop())
        if(failed)return
        const mime=capture.mimeType || chunks[0]?.type || 'video/webm'
        const blob=new Blob(chunks,{type:mime});chunks=[]
        if(!blob.size){setError('Recording was empty. Try again.');return}
        onVideo(new File([blob],`hammer-${Date.now()}.${mime.includes('mp4')?'mp4':'webm'}`,{type:mime}))
      }
      capture.start(1000);setRecording(true)
      const started=Date.now()
      timer.current=setInterval(()=>{const elapsed=Math.floor((Date.now()-started)/1000);setSeconds(elapsed);if(elapsed>=59)stop()},250)
    }catch(e){setError(e instanceof Error?e.message:'Recording could not start.')}
  }
  return <section className="camera-panel" aria-label="Camera recording">
    <video ref={video} autoPlay muted playsInline aria-label="Live camera"/>
    <div className="camera-actions">
      <span role="status">{recording?`Recording ${seconds}s / 60s`:ready?'Camera ready':'Opening camera'}</span>
      {recording?<button className="primary" onClick={stop}>Stop and analyze</button>:<button className="primary" disabled={!ready} onClick={start}>Start recording</button>}
      <button onClick={onClose}>Cancel</button>
    </div>
    {error&&<p role="alert" className="error">{error}</p>}
  </section>
}
