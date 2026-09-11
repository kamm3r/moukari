import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', timeout:120000, workers:1,
  use:{baseURL:'http://127.0.0.1:3001',browserName:'chromium',launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},permissions:['camera']},
  webServer:{command:'MOUKARI_DATA=/tmp/moukari-browser-tests .venv/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port 3001',url:'http://127.0.0.1:3001/api/health',reuseExistingServer:false,timeout:30000},
})
