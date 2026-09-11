"""Timestamp-based pelvis rotation analysis. No inferred metric scale."""
from __future__ import annotations

import math
import subprocess
from pathlib import Path
from typing import Callable

import av
import mediapipe as mp
import numpy as np
from scipy.ndimage import median_filter

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / 'models/pose_landmarker_full.task'
MAX_SECONDS = 60


def rotation_segments(samples: list[dict]) -> list[dict]:
    """Find sustained complete pelvis revolutions, never bridge missing poses.

    Times are presentation timestamps. Boundaries interpolate crossings of the
    same camera-relative orientation, avoiding partial-turn rate extrapolation.
    This is a pose-model estimate, not a calibrated 3D angular measurement.
    """
    groups: list[list[dict]] = []
    for s in samples:
        if s['angle'] is None:
            continue
        if not groups or s['t'] - groups[-1][-1]['t'] > .15:
            groups.append([])
        groups[-1].append(s)
    turns = []
    for group in groups:
        if len(group) < 15:
            continue
        t = np.array([s['t'] for s in group])
        raw = np.unwrap([s['angle'] for s in group])
        a = median_filter(raw, size=5, mode='nearest')
        for direction in (1, -1):
            phase = direction * a
            # Every complete crossing pair is a full revolution; initial and
            # final partial turns are deliberately omitted.
            for level in np.arange(math.ceil((phase.min()-math.pi) / (2*math.pi)),
                                   math.floor((phase.max()-math.pi) / (2*math.pi))):
                start_level = math.pi + level * 2 * math.pi
                starts = np.where((phase[:-1] <= start_level) & (phase[1:] > start_level))[0]
                for i in starts:
                    ends = np.where((phase[i+1:-1] <= start_level + 2*math.pi) &
                                    (phase[i+2:] > start_level + 2*math.pi))[0]
                    if not len(ends):
                        continue
                    j = int(ends[0]) + i + 1
                    def crossing(k, value):
                        return float(t[k] + (value-phase[k]) / (phase[k+1]-phase[k]) * (t[k+1]-t[k]))
                    start, end = crossing(i, start_level), crossing(j, start_level + 2*math.pi)
                    duration = end - start
                    if not .25 <= duration <= 2.0:
                        continue
                    delta = np.diff(phase[i:j+2])
                    if np.abs(delta).max() > 2.5 or np.maximum(-delta, 0).sum() > .8:
                        continue
                    if any(start < old['end'] - .02 and end > old['start'] + .02 for old in turns):
                        continue
                    turns.append({'start': round(start, 3), 'end': round(end, 3),
                                  'duration': round(duration, 3),
                                  'rps': round(1 / duration, 3),
                                  'degreesPerSecond': round(360 / duration, 1),
                                  'method': 'Pelvis orientation estimated from body pose'})
    turns.sort(key=lambda turn: turn['start'])
    return [dict(turn, number=i+1) for i, turn in enumerate(turns)]


def before_hand_separation(samples: list[dict]) -> tuple[list[dict], float | None]:
    """Conservative body cue to omit recovery. Never equate this with release."""
    together_since = None
    armed = False
    apart_since = None
    for s in samples:
        p = s.get('points')
        if p is None or min(p[15][2], p[16][2]) < .5:
            apart_since = None
            continue
        p = np.asarray(p)
        torso = np.linalg.norm((p[11,:2]+p[12,:2]-p[23,:2]-p[24,:2])/2)
        if torso < .02:
            continue
        distance = np.linalg.norm(p[15,:2]-p[16,:2]) / torso
        if distance < .4:
            apart_since = None
            if together_since is None:
                together_since = s['t']
            if s['t'] - together_since > .5:
                armed = True
        elif distance > .75 and armed:
            if apart_since is None:
                apart_since = s['t']
            if s['t'] - apart_since >= .15:
                return [x for x in samples if x['t'] < apart_since], apart_since
        else:
            apart_since = None
            together_since = None
    return samples, None


def prepare_video(source: Path, dest: Path):
    # No forced frame rate: presentation timestamps retain variable-rate timing.
    result = subprocess.run([
        'ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', str(source),
        '-map', '0:v:0', '-t', str(MAX_SECONDS + 1),
        '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast',
        '-crf', '20', '-pix_fmt', 'yuv420p', '-fps_mode', 'vfr',
        '-movflags', '+faststart', '-an', str(dest),
    ], capture_output=True, timeout=180)
    if result.returncode:
        raise ValueError('This file could not be decoded. Use an original MP4, MOV or WebM video.')


def analyze(source: Path, directory: Path, progress: Callable[[int, str], None]) -> dict:
    if not MODEL.is_file():
        raise RuntimeError('Pose model missing. Run ./scripts/setup.sh and restart.')
    progress(5, 'Preparing video')
    playback = directory / 'video.mp4'
    prepare_video(source, playback)
    samples = []
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(MODEL)),
        running_mode=mp.tasks.vision.RunningMode.VIDEO, num_poses=2,
        min_pose_detection_confidence=.6, min_pose_presence_confidence=.6,
        min_tracking_confidence=.6,
    )
    last_time, first_time = -1., None
    multiple = 0
    with av.open(str(playback)) as video, mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
        stream = video.streams.video[0]
        duration = float(stream.duration * stream.time_base) if stream.duration else 0
        if duration > MAX_SECONDS + .1:
            raise ValueError('Use a clip of 60 seconds or less, containing one throw.')
        fps = float(stream.average_rate) if stream.average_rate else None
        for frame in video.decode(stream):
            if frame.time is None:
                raise ValueError('Video has no usable frame timestamps.')
            if first_time is None:
                first_time = frame.time
            t = float(frame.time - first_time)
            if t > MAX_SECONDS:
                raise ValueError('Use a clip of 60 seconds or less.')
            if t - last_time < 1/30 - .001:
                continue
            last_time = t
            rgb = frame.to_ndarray(format='rgb24')
            prediction = detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), round(t*1000))
            sample = {'t': round(t, 4), 'angle': None, 'points': None}
            if len(prediction.pose_landmarks) > 1:
                multiple += 1
            elif prediction.pose_landmarks:
                pose, world = prediction.pose_landmarks[0], prediction.pose_world_landmarks[0]
                # Require visible shoulders and pelvis; do not fill occluded spans.
                visible = min(pose[i].visibility for i in (11, 12, 23, 24))
                if visible >= .65:
                    left, right = world[23], world[24]
                    sample['angle'] = math.atan2(right.z-left.z, right.x-left.x)
                    sample['points'] = [[round(p.x, 5), round(p.y, 5), round(p.visibility, 3)] for p in pose]
            samples.append(sample)
            if len(samples) % 15 == 0:
                progress(min(90, 10 + round(t / max(duration, 1) * 80)), 'Tracking athlete')
    if len(samples) < 15:
        raise ValueError('Video is too short. Include the setup, turns and release.')
    progress(95, 'Checking complete rotations')
    rotation_samples, separation = before_hand_separation(samples)
    turns = rotation_segments(rotation_samples)
    tracked = sum(s['angle'] is not None for s in samples)
    coverage = round(tracked / len(samples) * 100)
    notes = ['Turn timings use video playback time. Slow-motion exports cannot provide real-time speed unless their capture timing is known.',
             'Detected rotations are pelvis revolutions estimated from pose. Their accuracy and correspondence to competition turns have not been validated.']
    if separation is not None:
        notes.append(f'Rotations after sustained hand separation at {separation:.2f}s were excluded. Hand separation is a body cue, not a measured hammer release.')
    else:
        notes.append('No sustained hand separation was identified. Recovery rotations may be included.')
    if multiple:
        notes.append('Frames containing multiple people were excluded. Film one athlete at a time.')
    if coverage < 75:
        notes.append('Body tracking is incomplete. Keep the whole athlete visible and avoid obstructions.')
    if not turns:
        notes.append('No complete, consistently tracked rotation was found. No turn speed has been guessed.')
    return {
        'version': 1, 'handSeparation': separation, 'duration': round(last_time, 3), 'fps': round(fps, 2) if fps else None,
        'coverage': coverage, 'sampleCount': len(samples), 'turns': turns,
        'samples': samples, 'notes': notes,
        'predictedDistance': {'value': None, 'reason': 'Needs validated 3D hammer tracking and release geometry. Body pose alone cannot measure release speed.'},
        'landingDistance': {'value': None, 'reason': 'Needs a visible first ground impact and calibrated field geometry. An indoor net impact is not a landing distance.'},
        'hammerSpeed': {'value': None, 'reason': 'A calibrated hammer tracking model is not implemented. Athlete rotation rate is not hammer speed.'},
    }
