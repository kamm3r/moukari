import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'

test('upload page, mobile layout and invalid upload feedback', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'A closer look at your throw.'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await page.locator('input[type=file]').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not video')})
  await expect(page.getByRole('alert')).toContainText('Choose an MP4')
  await page.screenshot({path:'test-results/mobile.png',fullPage:true})
})

test('malformed video reports a processing failure', async ({page})=>{
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({name:'bad.mp4',mimeType:'video/mp4',buffer:Buffer.from('not a valid video')})
  await expect(page.getByText('This file could not be decoded.',{exact:false})).toBeVisible({timeout:20000})
  await expect(page.getByRole('button',{name:'Try another video'})).toBeEnabled()
})

test('record in browser, stop, submit and receive result', async ({page})=>{
  await page.goto('/')
  await page.getByRole('button',{name:'Record a throw'}).click()
  await expect(page.getByText('Camera ready',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Start recording'}).click()
  await expect(page.getByRole('status')).toContainText('Recording 1s',{timeout:10000})
  await page.getByRole('button',{name:'Stop and analyze'}).click()
  await expect(page.getByRole('heading',{name:'Detected rotations'})).toBeVisible({timeout:60000})
  await expect(page.getByText('No complete rotation could be tracked reliably',{exact:false})).toBeVisible()
})

test('reference clip, playable intervals, persisted result and video range requests', async ({page,request})=>{
  test.skip(!existsSync('Hammer-Throw-Training-75m.mp4'),'Local reference video not present')
  const errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles('Hammer-Throw-Training-75m.mp4')
  await expect(page.getByRole('heading',{name:'Detected rotations'})).toBeVisible({timeout:100000})
  await expect(page.getByRole('button',{name:/Play rotation/})).toHaveCount(4)
  await page.getByRole('button',{name:'Play rotation 2'}).click()
  await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(8.7)
  await page.screenshot({path:'test-results/reference.png',fullPage:true})
  const id=new URL(page.url()).hash.slice(1)
  const video=await request.get(`/api/analyses/${id}/video`,{headers:{Range:'bytes=0-99'}})
  expect(video.status()).toBe(206)
  expect((await video.body()).length).toBe(100)
  await page.reload()
  await expect(page.getByRole('button',{name:/Play rotation/})).toHaveCount(4)
  expect(errors).toEqual([])
})
