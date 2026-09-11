from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from server.analysis import analyze, MODEL

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get('MOUKARI_DATA', str(ROOT / 'data')))
MAX_BYTES = 250 * 1024 * 1024
log = logging.getLogger(__name__)


def write_json(path: Path, payload):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(payload, allow_nan=False))
    temp.replace(path)


def job_path(job_id: str):
    if len(job_id) != 32 or any(c not in '0123456789abcdef' for c in job_id):
        raise HTTPException(404, 'Analysis not found')
    path = DATA / job_id
    if not (path / 'status.json').exists():
        raise HTTPException(404, 'Analysis not found')
    return path


async def process(app, path):
    async with app.state.worker:
        def progress(value, message):
            write_json(path / 'status.json', {'id': path.name, 'state': 'processing', 'progress': value, 'message': message})
        try:
            result = await asyncio.to_thread(analyze, path / 'source', path, progress)
            write_json(path / 'result.json', result)
            write_json(path / 'status.json', {'id': path.name, 'state': 'complete', 'progress': 100, 'message': 'Analysis ready'})
            (path / 'source').unlink(missing_ok=True)
        except Exception as error:
            log.exception('Analysis failed: %s', path.name)
            message = str(error) if isinstance(error, (ValueError, RuntimeError)) else 'Analysis failed. Try a shorter original video with one visible athlete.'
            write_json(path / 'status.json', {'id': path.name, 'state': 'failed', 'progress': 0, 'message': message})


@asynccontextmanager
async def lifespan(app):
    DATA.mkdir(parents=True, exist_ok=True)
    app.state.worker = asyncio.Semaphore(1)
    app.state.tasks = set()
    app.state.uploads = 0
    for file in DATA.glob('*/status.json'):
        status = json.loads(file.read_text())
        if status['state'] in ('queued', 'processing'):
            status.update(state='failed', message='Server restarted during analysis. Please upload again.', progress=0)
            write_json(file, status)
    yield
    if app.state.tasks:
        await asyncio.gather(*app.state.tasks, return_exceptions=True)


app = FastAPI(title='Moukari', lifespan=lifespan)


@app.get('/api/health')
def health():
    return {'status': 'ok' if MODEL.exists() else 'model_missing', 'modelReady': MODEL.exists()}


@app.post('/api/analyses', status_code=202)
async def create(file: UploadFile = File(...)):
    if not MODEL.exists():
        raise HTTPException(503, 'Pose model missing. Run setup and restart the server.')
    if len(app.state.tasks) + app.state.uploads >= 4:
        raise HTTPException(429, 'The analysis queue is full. Try again after a current analysis finishes.')
    if Path(file.filename or '').suffix.lower() not in ('.mp4', '.mov', '.webm', '.m4v'):
        raise HTTPException(415, 'Choose an MP4, MOV or WebM video.')
    app.state.uploads += 1
    path = DATA / secrets.token_hex(16)
    path.mkdir(parents=True)
    try:
        size = 0
        with (path / 'source').open('wb') as output:
            while chunk := await file.read(1024*1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, 'Video exceeds 250 MB. Use a shorter clip.')
                output.write(chunk)
        if not size:
            raise HTTPException(400, 'Video is empty.')
        status = {'id': path.name, 'state': 'queued', 'progress': 0, 'message': 'Waiting to analyze'}
        write_json(path / 'status.json', status)
        task = asyncio.create_task(process(app, path))
        app.state.tasks.add(task)
        task.add_done_callback(app.state.tasks.discard)
        return status
    except BaseException:
        shutil.rmtree(path, ignore_errors=True)
        raise
    finally:
        app.state.uploads -= 1
        await file.close()


@app.get('/api/analyses/{job_id}')
def status(job_id: str):
    return json.loads((job_path(job_id) / 'status.json').read_text())


@app.get('/api/analyses/{job_id}/result')
def result(job_id: str):
    path = job_path(job_id) / 'result.json'
    if not path.exists():
        raise HTTPException(409, 'Analysis is not ready.')
    return FileResponse(path, media_type='application/json')


@app.get('/api/analyses/{job_id}/video')
def video(job_id: str):
    path = job_path(job_id)
    if not (path / 'result.json').exists():
        raise HTTPException(409, 'Video is not ready.')
    return FileResponse(path / 'video.mp4', media_type='video/mp4')


@app.get('/analyze', include_in_schema=False)
def old_analyze_url():
    return RedirectResponse('/')


if (ROOT / 'dist').exists():
    app.mount('/', StaticFiles(directory=ROOT / 'dist', html=True), name='web')
