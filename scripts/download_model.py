from pathlib import Path
from urllib.request import urlopen
import hashlib
ROOT = Path(__file__).resolve().parent.parent
path = ROOT / 'models/pose_landmarker_full.task'
expected = '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1'
if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == expected:
    print('Pose model verified')
else:
    url = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
    with urlopen(url, timeout=60) as response:
        payload = response.read()
    if hashlib.sha256(payload).hexdigest() != expected:
        raise RuntimeError('Pose model checksum mismatch')
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(payload)
    print('Pose model downloaded and verified')
