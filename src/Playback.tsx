import {useEffect,useRef,useState} from 'react'
import type {Result,Turn} from './types'
const edges=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]]
export function Playback({src,result,selection}:{src:string;result:Result|null;selection:Turn|null}) {
  const video=useRef<HTMLVideoElement>(null)
  const canvas=useRef<HTMLCanvasElement>(null)
  const [overlay,setOverlay]=useState(true)
  useEffect(()=>{
    if(selection&&video.current){video.current.currentTime=selection.start;void video.current.play().catch(()=>{})}
  },[selection])
  useEffect(()=>{
    let id=0
    function draw(){
      const v=video.current,c=canvas.current
      if(v&&c){
        c.width=v.videoWidth||1280;c.height=v.videoHeight||720
        const ctx=c.getContext('2d')
        if(ctx){
          ctx.clearRect(0,0,c.width,c.height)
          if(result&&overlay){
            // Binary search the nearest timestamp, with no overlay across gaps.
            let low=0,high=result.samples.length-1
            while(low<high){const mid=Math.floor((low+high)/2);if(result.samples[mid].t<v.currentTime)low=mid+1;else high=mid}
            let sample=result.samples[low]
            if(low>0&&Math.abs(result.samples[low-1].t-v.currentTime)<Math.abs(sample.t-v.currentTime))sample=result.samples[low-1]
            if(sample?.points&&Math.abs(sample.t-v.currentTime)<.08){
              const p=sample.points
              ctx.lineWidth=Math.max(3,c.width/350);ctx.strokeStyle='#79ffff';ctx.fillStyle='#fff'
              for(const [a,b] of edges){if(p[a][2]<.65||p[b][2]<.65)continue;ctx.beginPath();ctx.moveTo(p[a][0]*c.width,p[a][1]*c.height);ctx.lineTo(p[b][0]*c.width,p[b][1]*c.height);ctx.stroke()}
              for(const point of p){if(point[2]<.65)continue;ctx.beginPath();ctx.arc(point[0]*c.width,point[1]*c.height,c.width/250,0,Math.PI*2);ctx.fill()}
            }
          }
        }
        if(selection&&!v.paused&&v.currentTime>=selection.end)v.pause()
      }
      id=requestAnimationFrame(draw)
    }
    id=requestAnimationFrame(draw)
    return ()=>cancelAnimationFrame(id)
  },[result,overlay,selection])
  return <><div className="playback"><video ref={video} src={src} controls playsInline preload="metadata" aria-label="Throw video"/><canvas ref={canvas} aria-hidden="true"/></div>
    {result&&<label className="overlay-toggle"><input type="checkbox" checked={overlay} onChange={e=>setOverlay(e.target.checked)}/> Show tracked body</label>}</>
}
