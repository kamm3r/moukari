import json
import pytest
from fastapi.testclient import TestClient
import server.app as module


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(module, 'DATA', tmp_path)
    with TestClient(module.app) as client:
        yield client


def test_health_and_invalid_uploads(client):
    assert client.get('/api/health').json()['modelReady'] is True
    assert client.post('/api/analyses', files={'file': ('test.txt', b'hello')}).status_code == 415
    assert client.post('/api/analyses', files={'file': ('empty.mp4', b'')}).status_code == 400
    assert client.get('/api/analyses/invalid').status_code == 404


def test_upload_limit(client, monkeypatch):
    monkeypatch.setattr(module, 'MAX_BYTES', 8)
    assert client.post('/api/analyses', files={'file': ('clip.mp4', b'0123456789')}).status_code == 413
    assert list(module.DATA.iterdir()) == []


def test_restart_marks_interrupted_jobs_failed(tmp_path, monkeypatch):
    monkeypatch.setattr(module, 'DATA', tmp_path)
    path = tmp_path / ('a'*32)
    path.mkdir()
    (path/'status.json').write_text(json.dumps({'state':'processing','id':path.name}))
    with TestClient(module.app) as client:
        status = client.get('/api/analyses/' + path.name).json()
        assert status['state'] == 'failed'
        assert 'restarted' in status['message']


def test_video_is_not_served_before_result(client):
    path = module.DATA / ('b'*32)
    path.mkdir()
    (path/'status.json').write_text(json.dumps({'state':'processing'}))
    (path/'video.mp4').write_bytes(b'incomplete')
    assert client.get(f'/api/analyses/{path.name}/video').status_code == 409
