import math
import numpy as np
import pytest
from server.analysis import rotation_segments, before_hand_separation


def make_samples(t, phase):
    return [{'t': float(time), 'angle': float(math.atan2(math.sin(angle), math.cos(angle)))} for time, angle in zip(t, phase)]


@pytest.mark.parametrize('direction', [1, -1])
def test_full_rotations_with_irregular_timestamps(direction):
    rng = np.random.default_rng(2)
    t = np.cumsum(rng.uniform(.025, .045, 120))
    samples = make_samples(t, direction * 2*math.pi*t/.6)
    turns = rotation_segments(samples)
    assert len(turns) >= 4
    for turn in turns:
        assert turn['duration'] == pytest.approx(.6, abs=.003)
        assert turn['rps'] == pytest.approx(1/.6, abs=.005)


def test_static_and_partial_motion_have_no_turns():
    t = np.arange(0, 2, 1/30)
    assert rotation_segments(make_samples(t, np.ones(len(t)))) == []
    assert rotation_segments(make_samples(t, np.linspace(0, math.pi, len(t)))) == []


def test_tracking_gap_cannot_create_a_full_turn():
    t = np.arange(0, .7, 1/30)
    samples = make_samples(t, 2*math.pi*t/.6)
    for sample in samples:
        if .2 < sample['t'] < .45:
            sample['angle'] = None
    assert rotation_segments(samples) == []


def test_oscillation_does_not_count_as_turn():
    t = np.arange(0, 4, 1/30)
    assert rotation_segments(make_samples(t, 1.5*np.sin(2*math.pi*t))) == []


def test_no_hand_points_does_not_invent_release():
    samples = [{'t': 0, 'angle': 0, 'points': None}]
    assert before_hand_separation(samples) == (samples, None)
