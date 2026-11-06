"""ROOM-02/HOME-02：临时数据库、独立 Cookie 与跨房间交接。"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from sqlalchemy import delete
from sqlmodel import Session
from starlette.websockets import WebSocketDisconnect
from app.config import SESSION_COOKIE
from app.db import engine
from app.models import RoomTelevision, RoomClock
from app.room_runtime import RoomRuntime, home_runtime, room_runtime, room_runtimes
from .conftest import current_login

HOME, SEA = '/api/rooms/interior', '/api/rooms/seaside'
ORIGIN = {'origin': 'http://testserver'}


def login(client, account):
    result = client.post('/api/auth/login', json={'name': current_login(client, account), 'password': '123456'})
    assert result.status_code == 200


def join(client, root=HOME, **body):
    result = client.post(root + '/join', json={'client_id': str(uuid4()), **body})
    assert result.status_code == 200, result.text
    return result.json()


def seat(client, lease, value):
    return client.put(HOME + '/seat', json={'lease_id': lease, 'seat': value})


def tv(client, lease, version, action='toggle'):
    return client.put(HOME + '/television', json={'lease_id': lease, 'version': version, 'action': action})


@pytest.fixture(autouse=True)
def reset_rooms(client, second_client):
    old_times = [(r, r.utc_ms, r.monotonic_seconds) for r in room_runtimes.values()]
    with room_runtime.lock, Session(engine) as db:
        room_runtime.coordinator.entries.clear()
        for r in room_runtimes.values():
            r.members.clear(); r.retired.clear(); r.retired_leases.clear()
        db.exec(delete(RoomTelevision)); db.exec(delete(RoomClock)); db.commit()
    yield
    with room_runtime.lock:
        room_runtime.coordinator.entries.clear()
        for r, utc, mono in old_times:
            r.members.clear(); r.retired.clear(); r.retired_leases.clear()
            r.utc_ms, r.monotonic_seconds = utc, mono


def test_entry_standing_seat_release_and_room_leave_are_distinct(client, second_client):
    login(client, 'bear'); login(second_client, 'her')
    one, two = join(client), join(second_client)
    assert one['snapshot']['room'] == 'interior' and 'clock' not in one['snapshot']
    assert [(m['pose'], m['seat']) for m in two['snapshot']['members']] == [('standing', None)] * 2
    first = seat(client, one['lease_id'], 1).json()['snapshot']
    repeated = seat(client, one['lease_id'], 1).json()['snapshot']
    assert first['revision'] == repeated['revision']
    seat(second_client, two['lease_id'], 0)
    assert seat(client, one['lease_id'], 0).status_code == 409
    assert [(m['account'], m['seat']) for m in client.get(HOME).json()['members']] == [('her', 0), ('bear', 1)]
    stood = seat(client, one['lease_id'], None).json()['snapshot']
    assert len(stood['members']) == 2
    assert next(m for m in stood['members'] if m['account'] == 'bear')['seat'] is None
    gone = client.post(HOME + '/leave', json={'lease_id': one['lease_id']}).json()['snapshot']
    assert [m['account'] for m in gone['members']] == ['her']


def test_simultaneous_same_seat_has_single_winner(client, second_client):
    login(client, 'bear'); login(second_client, 'her')
    one, two = join(client), join(second_client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(seat, client, one['lease_id'], 0)
        b = pool.submit(seat, second_client, two['lease_id'], 0)
        results = [a.result(), b.result()]
    assert sorted(r.status_code for r in results) == [200, 409]
    assert next(r for r in results if r.status_code == 409).json()['detail']['code'] == 'seat_occupied'
    assert sorted(m['pose'] for m in client.get(HOME).json()['members']) == ['seated', 'standing']


def test_shared_tv_pause_resume_next_and_reentry(client, second_client):
    login(client, 'bear'); login(second_client, 'her')
    now = [1_800_000_000_000]; home_runtime.utc_ms = lambda: now[0]
    one, two = join(client), join(second_client)
    state = one['snapshot']['television']
    assert not state['powered'] and state['position_ms'] == 0
    assert tv(client, one['lease_id'], state['version'], 'next').status_code == 409
    state = tv(client, one['lease_id'], state['version']).json()['snapshot']['television']
    now[0] += 9500
    state = tv(second_client, two['lease_id'], state['version']).json()['snapshot']['television']
    assert state['position_ms'] == 9500 and not state['powered'] and state['changed_by'] == 'her'
    now[0] += 50000
    state = tv(client, one['lease_id'], state['version']).json()['snapshot']['television']
    assert state['position_ms'] == 9500 and state['powered']
    state = tv(second_client, two['lease_id'], state['version'], 'next').json()['snapshot']['television']
    assert state['position_ms'] == 0 and state['channel'] == 1 and state['anchor_utc_ms'] == now[0]
    assert join(client)['snapshot']['television'] == state


def test_tv_concurrent_cas_accepts_one_and_snapshot_conflict(client, second_client):
    login(client, 'bear'); login(second_client, 'her')
    one, two = join(client), join(second_client)
    version = one['snapshot']['television']['version']
    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(tv, client, one['lease_id'], version)
        b = pool.submit(tv, second_client, two['lease_id'], version)
        results = [a.result(), b.result()]
    assert sorted(r.status_code for r in results) == [200, 409]
    conflict = next(r for r in results if r.status_code == 409).json()['detail']
    assert conflict['code'] == 'television_conflict'
    assert conflict['snapshot']['television'] == client.get(HOME).json()['television']
    assert conflict['snapshot']['television']['version'] == version + 1


def test_cross_room_transfer_rejects_old_and_late_first_join(client, second_client):
    login(client, 'bear'); login(second_client, 'her')
    page, old_client = str(uuid4()), str(uuid4())
    one = join(client, SEA, client_id=old_client, page_id=page, entry_generation=1)
    two = join(second_client, SEA)
    second_client.put(SEA + '/pose', json={'lease_id': two['lease_id'], 'pose': 'leaning'})
    home = join(client, page_id=page, entry_generation=2)
    assert [m['account'] for m in home['snapshot']['members']] == ['bear']
    assert [(m['account'], m['pose']) for m in second_client.get(SEA).json()['members']] == [('her', 'seated')]
    for body in [{'client_id': old_client}, {'client_id': str(uuid4()), 'page_id': page, 'entry_generation': 1}]:
        assert client.post(SEA + '/join', json=body).status_code == 409
    client.post(SEA + '/leave', json={'lease_id': one['lease_id']})
    assert client.post(HOME + '/heartbeat', json={'lease_id': home['lease_id']}).status_code == 200
    back = join(client, SEA, page_id=page, entry_generation=3)
    assert len(back['snapshot']['members']) == 2 and client.get(HOME).json()['members'] == []
    client.post(HOME + '/leave', json={'lease_id': home['lease_id']})
    assert len(client.get(SEA).json()['members']) == 2


def test_rejected_identity_or_entry_keeps_current_room(client):
    login(client, 'bear'); page = str(uuid4())
    home = join(client, page_id=page, entry_generation=4)
    for extra in ({'expected_account': 'her'}, {'page_id': page, 'entry_generation': 3}):
        assert client.post(SEA + '/join', json={'client_id': str(uuid4()), **extra}).status_code in (401, 409)
    assert client.post(HOME + '/heartbeat', json={'lease_id': home['lease_id']}).status_code == 200


def test_restart_keeps_tv_without_members_or_sea_clock(client):
    login(client, 'bear'); one = join(client); seat(client, one['lease_id'], 0)
    saved = tv(client, one['lease_id'], 1).json()['snapshot']
    result = RoomRuntime(room='interior').snapshot(client.cookies.get(SESSION_COOKIE))
    assert result['members'] == [] and result['epoch'] != saved['epoch']
    assert result['television'] == saved['television'] and 'clock' not in result


def test_home_expiry_and_logout_clear_members(client, second_client):
    login(client, 'bear'); login(second_client, 'her')
    now = [100.0]; home_runtime.monotonic_seconds = lambda: now[0]
    one, two = join(client), join(second_client)
    seat(client, one['lease_id'], 0); seat(second_client, two['lease_id'], 1)
    now[0] += 29; client.post(HOME + '/heartbeat', json={'lease_id': one['lease_id']})
    now[0] += 2; home_runtime.sweep()
    assert [m['account'] for m in client.get(HOME).json()['members']] == ['bear']
    client.post('/api/auth/logout'); assert home_runtime.members == {}


def test_takeover_starts_unseated_stale_actions_blocked(client):
    login(client, 'bear'); first_client = str(uuid4())
    one = join(client, client_id=first_client); seat(client, one['lease_id'], 0)
    two = join(client); assert two['snapshot']['members'][0]['seat'] is None
    assert seat(client, one['lease_id'], 1).status_code == 409
    assert tv(client, one['lease_id'], 1).status_code == 409
    assert client.post(HOME + '/join', json={'client_id': first_client}).status_code == 409
    client.post(HOME + '/leave', json={'lease_id': one['lease_id']})
    assert client.post(HOME + '/heartbeat', json={'lease_id': two['lease_id']}).status_code == 200


def test_ws_frames_and_cross_room_close_protect_new_lease(client, second_client):
    login(client, 'bear'); login(second_client, 'her'); one = join(client)
    with client.websocket_connect(HOME + '/events?lease_id=' + one['lease_id'], headers=ORIGIN) as ws:
        assert ws.receive_json()['room'] == 'interior'
        two = join(second_client); assert len(ws.receive_json()['members']) == 2
        seat(second_client, two['lease_id'], 1); assert ws.receive_json()['members'][0]['seat'] == 1
        tv(second_client, two['lease_id'], 1); assert ws.receive_json()['television']['powered']
        sea = join(client, SEA)
        with pytest.raises(WebSocketDisconnect) as error: ws.receive_json()
        assert error.value.code == 4409
    assert client.post(SEA + '/heartbeat', json={'lease_id': sea['lease_id']}).status_code == 200
    assert [m['account'] for m in second_client.get(HOME).json()['members']] == ['her']


def test_old_socket_finally_cannot_release_new_home_lease(client):
    login(client, 'bear'); page = str(uuid4())
    first = join(client, client_id=page, connection_generation=1); seat(client, first['lease_id'], 1)
    token = client.cookies.get(SESSION_COOKIE)
    async def replay():
        binding = home_runtime.connect(token, first['lease_id'], asyncio.get_running_loop())
        second = home_runtime.join(token, page, 3)
        home_runtime.disconnect(token, first['lease_id'], binding)
        assert second['lease_id'] != first['lease_id']
        assert home_runtime.heartbeat(token, second['lease_id'])['snapshot']['members'][0]['seat'] == 1
    asyncio.run(replay())


@pytest.mark.parametrize('invalid', [-1, 2, True, '0', 0.0])
def test_seat_strict_input(client, invalid):
    login(client, 'bear'); one = join(client)
    assert seat(client, one['lease_id'], invalid).status_code == 422


def test_auth_origin_foreign_lease_and_entry_validation(client, second_client):
    client.cookies.clear(); assert client.get(HOME).status_code == 401
    login(client, 'tester'); assert client.get(HOME).status_code == 403
    login(client, 'bear'); login(second_client, 'her'); one, two = join(client), join(second_client)
    assert seat(client, two['lease_id'], 1).status_code == 403
    assert tv(client, two['lease_id'], 1).status_code == 403
    assert client.post(HOME + '/join', json={'client_id': str(uuid4())}, headers={'origin': 'https://evil.invalid'}).status_code == 403
    for body in ({'page_id': str(uuid4())}, {'entry_generation': 1}, {'entry_generation': True, 'page_id': str(uuid4())}):
        assert client.post(HOME + '/join', json={'client_id': str(uuid4()), **body}).status_code == 422
    with pytest.raises(WebSocketDisconnect) as error:
        with second_client.websocket_connect(HOME + '/events?lease_id=' + one['lease_id'], headers=ORIGIN): pass
    assert error.value.code == 4403
