"""暖饮定向检查：真实 Cookie/API，所有数据库和时钟均隔离。"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from uuid import uuid4

import pytest
from sqlalchemy import delete
from sqlmodel import Session, select

from app.config import SESSION_COOKIE
from app.cocoa_runtime import CocoaRuntime, cocoa_runtime
from app.db import engine
from app.models import CocoaCup, CocoaRecipe, CocoaRun
from app.room_runtime import RoomRuntime, home_runtime, room_runtime
from .conftest import current_login

ROOT = '/api/rooms/interior'
ACTION = ROOT + '/cocoa/action'
MEMBERSHIP_SEQUENCES = {}


def login(client, account):
    client.cookies.clear()
    assert client.post('/api/auth/login', json={'name': current_login(client, account), 'password': '123456'}).status_code == 200
    result = client.post(ROOT + '/join', json={'client_id': str(uuid4()), 'expected_account': account})
    assert result.status_code == 200
    return result.json()['lease_id']


def act(client, lease, action, **fields):
    if action in ('start','station','leave') and 'activity_seq' not in fields:
        MEMBERSHIP_SEQUENCES[lease] = MEMBERSHIP_SEQUENCES.get(lease, 0) + 1
        fields['activity_seq'] = MEMBERSHIP_SEQUENCES[lease]
    return client.put(ACTION, json={'lease_id': lease, 'action': action, **fields})


def state(client):
    return client.get(ROOT).json()['cocoa']


def start(client, lease, **fields):
    response = act(client, lease, 'start', request_id=fields.get('request_id', str(uuid4())))
    assert response.status_code == 200, response.text
    return response.json()['snapshot']['cocoa']['run']


@pytest.fixture(autouse=True)
def clean_cocoa(client, second_client):
    original = home_runtime.monotonic_seconds
    clock = [100.0]
    home_runtime.monotonic_seconds = lambda: clock[0]
    with home_runtime.lock, Session(engine) as db:
        cocoa_runtime.running = False; cocoa_runtime.inputs.clear(); cocoa_runtime.sequences.clear()
        cocoa_runtime.offers.clear(); cocoa_runtime.answered.clear(); cocoa_runtime.cheers = None; cocoa_runtime.receiving.clear()
        cocoa_runtime.last_tick = cocoa_runtime.last_activity = clock[0]
        for room in (home_runtime, room_runtime):
            room.members.clear(); room.retired.clear(); room.retired_leases.clear()
        home_runtime.coordinator.entries.clear()
        for model in (CocoaCup, CocoaRecipe, CocoaRun): db.exec(delete(model))
        db.commit()
    yield clock
    with home_runtime.lock, Session(engine) as db:
        cocoa_runtime.running = False; cocoa_runtime.inputs.clear(); cocoa_runtime.offers.clear(); cocoa_runtime.sequences.clear()
        for room in (home_runtime, room_runtime): room.members.clear()
        for model in (CocoaCup, CocoaRecipe, CocoaRun): db.exec(delete(model))
        db.commit()
    home_runtime.monotonic_seconds = original


class Pot:
    def __init__(self, client, lease, clock):
        self.client, self.lease, self.clock = client, lease, clock
        self.run = start(client, lease)
        self.seq = {}

    def command(self, action, **fields):
        run = state(self.client)['run']
        return act(self.client, self.lease, action, run_id=run['id'], version=run['version'], **fields)

    def station(self, client, lease, station):
        response = act(client, lease, 'station', run_id=self.run['id'], station=station)
        assert response.status_code == 200, response.text

    def input(self, client, lease, mode):
        self.seq[lease] = self.seq.get(lease, 0) + 1
        response = act(client, lease, 'input', run_id=self.run['id'], seq=self.seq[lease], mode=mode)
        assert response.status_code == 200, response.text

    def advance(self, seconds, inputs=()):
        for _ in range(round(seconds * 4)):
            for client, lease, mode in inputs: self.input(client, lease, mode)
            self.clock[0] += .25
            cocoa_runtime.tick()

    def solo(self):
        assert self.command('begin').status_code == 200
        self.advance(10, [(self.client, self.lease, 'heat')])
        self.station(self.client, self.lease, 'stir')
        self.advance(12.5, [(self.client, self.lease, 'stir')])
        assert state(self.client)['run']['phase'] == 'pouring'

    def duo(self, partner, partner_lease):
        self.station(partner, partner_lease, 'stir')
        assert self.command('begin').status_code == 200
        for _ in range(120):
            run = state(self.client)['run']
            if run['phase'] == 'pouring': return
            heat = 'gentle' if run['temperature'] >= 60 else 'heat'
            self.advance(.25, [(self.client, self.lease, heat), (partner, partner_lease, 'stir')])
        pytest.fail('duo did not finish in the expected relaxed interval')

    def finish(self, name='壁炉边的第一杯'):
        response = self.command('finish', name=name)
        assert response.status_code == 200, response.text
        return response.json()['recipe']


def test_start_is_idempotent_and_active_pot_is_shared(client, second_client):
    a, b = login(client, 'bear'), login(second_client, 'her')
    request_id = str(uuid4())
    one = start(client, a, request_id=request_id)
    assert start(client, a, request_id=request_id)['id'] == one['id']
    assert start(second_client, b)['id'] == one['id']
    assert {m['station'] for m in client.get(ROOT).json()['members']} == {'heat', 'stir'}
    with Session(engine) as db: assert len(db.exec(select(CocoaRun)).all()) == 1


def test_sofa_and_cooking_are_mutually_exclusive(client):
    lease = login(client, 'bear')
    assert client.put(ROOT + '/seat', json={'lease_id': lease, 'seat': 0}).status_code == 200
    assert act(client, lease, 'start', request_id=str(uuid4())).status_code == 409
    with Session(engine) as db: assert not db.exec(select(CocoaRun)).all()
    client.put(ROOT + '/seat', json={'lease_id': lease, 'seat': None})
    start(client, lease)
    assert client.put(ROOT + '/seat', json={'lease_id': lease, 'seat': 1}).status_code == 409
    assert act(client, lease, 'leave').status_code == 200
    assert client.put(ROOT + '/seat', json={'lease_id': lease, 'seat': 1}).status_code == 200


def test_options_only_edit_the_current_identity_and_keep_partner_fields(client, second_client):
    a, b = login(client, 'bear'), login(second_client, 'her')
    run = start(client, a); act(second_client, b, 'station', run_id=run['id'], station='stir')
    body = dict(run_id=run['id'], version=run['version'], cup_type='teal', ingredients=['cocoa','cinnamon'])
    assert act(client, a, 'choice', **body, owner='her').status_code == 422
    assert act(client, a, 'choice', **body).status_code == 200
    run = state(client)['run']
    assert run['choices']['bear'] == {'cup_type':'teal','ingredients':['cocoa','cinnamon']}
    assert run['choices']['her'] == {'cup_type':'cream','ingredients':[]}
    assert act(second_client, b, 'choice', **body).status_code == 409
    assert act(second_client, b, 'choice', **{**body,'version':run['version'],'ingredients':['marshmallow']}).status_code == 200
    assert state(client)['run']['choices']['bear']['ingredients'] == ['cocoa','cinnamon']


def test_heat_and_stir_really_interact_and_cold_stir_does_not_score(client, second_client, clean_cocoa):
    a, b = login(client,'bear'), login(second_client,'her')
    pot = Pot(client,a,clean_cocoa); pot.station(second_client,b,'stir'); pot.command('begin')
    pot.advance(.5, [(client,a,'heat')])
    warm = state(client)['run']; assert warm['temperature'] == 26 and warm['progress'] == 0
    pot.advance(.5, [(client,a,'heat'),(second_client,b,'stir')])
    mixed = state(client)['run']; assert mixed['temperature'] == pytest.approx(27.35) and mixed['progress'] == 0
    assert set(mixed['maker_accounts']) == {'bear','her'}


def test_input_timeout_stop_sequence_and_duplicate_renewal_cannot_keep_heating(client, clean_cocoa):
    a = login(client,'bear'); pot=Pot(client,a,clean_cocoa);pot.command('begin')
    assert act(client,a,'input',run_id=pot.run['id'],seq=1,mode='heat').status_code==200
    for _ in range(16):
        act(client,a,'input',run_id=pot.run['id'],seq=1,mode='heat')
        pot.advance(.25)
    assert state(client)['run']['temperature'] < 30
    act(client,a,'input',run_id=pot.run['id'],seq=3,mode='stop')
    act(client,a,'input',run_id=pot.run['id'],seq=2,mode='heat')
    assert state(client)['operators'][0]['intent'] is None
    before=state(client)['run']['temperature'];pot.advance(.5)
    assert state(client)['run']['temperature'] < before


def test_long_tick_gap_pauses_without_offline_progress(client, clean_cocoa):
    a=login(client,'bear');pot=Pot(client,a,clean_cocoa);pot.command('begin');pot.input(client,a,'heat')
    before=state(client)['run'];clean_cocoa[0]+=10;cocoa_runtime.tick();after=state(client)['run']
    assert after['phase']=='paused' and after['progress']==before['progress'] and after['temperature']==before['temperature']
    assert not cocoa_runtime.inputs


def test_pause_stops_both_inputs_and_resume_needs_fresh_intent(client, second_client, clean_cocoa):
    a,b=login(client,'bear'),login(second_client,'her');pot=Pot(client,a,clean_cocoa);pot.station(second_client,b,'stir');pot.command('begin')
    pot.advance(4,[(client,a,'heat'),(second_client,b,'stir')]);pot.command('pause')
    paused=state(client)['run'];pot.advance(20)
    assert state(client)['run']==paused
    assert pot.command('resume').status_code==200
    assert not cocoa_runtime.inputs
    before=state(client)['run']['progress'];pot.advance(.5)
    assert state(client)['run']['progress']==before


def test_single_player_finishes_without_inventing_partner_and_result_retries_are_unique(client, clean_cocoa):
    a=login(client,'bear');pot=Pot(client,a,clean_cocoa);pot.solo()
    assert state(client)['run']['maker_accounts']==['bear']
    before=datetime.utcnow();recipe=pot.finish();after=datetime.utcnow()
    assert [m['account'] for m in recipe['makers']]==['bear']
    assert {c['recipient_account'] for c in recipe['cups']}=={'bear','her'}
    assert before <= datetime.fromisoformat(recipe['created_at'].removesuffix('Z')) <= after
    again=act(client,a,'finish',run_id=pot.run['id'],version=1,name='不能覆盖原名').json()['recipe']
    assert again==recipe
    with Session(engine) as db:
        assert len(db.exec(select(CocoaRecipe)).all())==1
        assert len(db.exec(select(CocoaCup)).all())==2


def test_dual_finish_race_creates_exactly_one_recipe_and_two_cups(client, second_client, clean_cocoa):
    a,b=login(client,'bear'),login(second_client,'her');pot=Pot(client,a,clean_cocoa);pot.duo(second_client,b)
    run=state(client)['run']
    with ThreadPoolExecutor(max_workers=2) as pool:
        one=pool.submit(act,client,a,'finish',run_id=run['id'],version=run['version'],name='共同的一锅')
        two=pool.submit(act,second_client,b,'finish',run_id=run['id'],version=run['version'],name='迟到的名字')
        results=[one.result(),two.result()]
    assert [r.status_code for r in results]==[200,200]
    recipes=[r.json()['recipe'] for r in results]
    assert recipes[0]==recipes[1] and {m['account'] for m in recipes[0]['makers']}=={'bear','her'}
    with Session(engine) as db: assert len(db.exec(select(CocoaCup)).all())==2


def test_leaving_or_replacing_lease_pauses_and_clears_station(client, clean_cocoa):
    a=login(client,'bear');pot=Pot(client,a,clean_cocoa);pot.command('begin');pot.input(client,a,'heat')
    newer=client.post(ROOT+'/join',json={'client_id':str(uuid4())}).json()['lease_id']
    assert state(client)['run']['phase']=='paused'
    assert client.get(ROOT).json()['members'][0]['station'] is None
    assert act(client,a,'input',run_id=pot.run['id'],seq=99,mode='heat').status_code==409
    assert client.post(ROOT+'/heartbeat',json={'lease_id':newer}).status_code==200


def test_service_restart_restores_safe_step_without_members_or_inputs(client, clean_cocoa):
    a=login(client,'bear');pot=Pot(client,a,clean_cocoa);pot.command('begin');pot.advance(4,[(client,a,'heat')])
    before=state(client)['run'];clean_cocoa[0]+=86400
    room=RoomRuntime(room='interior',monotonic_seconds=lambda:clean_cocoa[0]);fresh=CocoaRuntime(room);fresh.start()
    snapshot=room.snapshot(client.cookies.get(SESSION_COOKIE))
    after=snapshot['cocoa']['run']
    assert snapshot['members']==[] and not fresh.inputs
    assert after['phase']=='paused' and after['temperature']==before['temperature'] and after['progress']==before['progress']
    fresh.stop()


def test_station_swap_requires_partner_acceptance_and_stops_old_inputs(client, second_client, clean_cocoa):
    a,b=login(client,'bear'),login(second_client,'her');pot=Pot(client,a,clean_cocoa);pot.station(second_client,b,'stir');pot.command('begin');pot.input(client,a,'heat');pot.input(second_client,b,'stir')
    offered=act(client,a,'offer',run_id=pot.run['id'],kind='swap').json()['snapshot']['cocoa']['offers'][0]
    assert {m['account']:m['station'] for m in client.get(ROOT).json()['members']}=={'bear':'heat','her':'stir'}
    assert act(client,a,'respond',offer_id=offered['id'],accept=True).status_code==409
    assert act(second_client,b,'respond',offer_id=offered['id'],accept=True).status_code==200
    assert not cocoa_runtime.inputs
    assert {m['account']:m['station'] for m in client.get(ROOT).json()['members']}=={'bear':'stir','her':'heat'}
    assert act(second_client,b,'respond',offer_id=offered['id'],accept=True).status_code==200
    assert {m['account']:m['station'] for m in client.get(ROOT).json()['members']}=={'bear':'stir','her':'heat'}
    assert act(client,a,'input',run_id=pot.run['id'],seq=100,mode='heat').status_code==409


def complete_pair(client,second_client,clock):
    a,b=login(client,'bear'),login(second_client,'her');pot=Pot(client,a,clock);pot.solo()
    pot.station(second_client,b,'heat');recipe=pot.finish()
    cups={c['recipient_account']:c for c in recipe['cups']}
    return pot,a,b,cups


def test_pass_cancel_leave_and_accept_never_consume_or_duplicate_reserved_cup(client, second_client, clean_cocoa):
    pot,a,b,cups=complete_pair(client,second_client,clean_cocoa)
    assert act(client,a,'claim',cup_id=cups['her']['id']).status_code==403
    offered=act(client,a,'offer',run_id=pot.run['id'],kind='pass',cup_id=cups['her']['id']).json()['snapshot']['cocoa']['offers'][0]
    assert act(client,a,'cancel',offer_id=offered['id']).status_code==200
    assert act(second_client,b,'respond',offer_id=offered['id'],accept=True).status_code==409
    with Session(engine) as db: assert db.get(CocoaCup,cups['her']['id']).claimed is False
    offered=act(client,a,'offer',run_id=pot.run['id'],kind='pass',cup_id=cups['her']['id']).json()['snapshot']['cocoa']['offers'][0]
    client.post(ROOT+'/leave',json={'lease_id':a})
    assert state(second_client)['offers']==[]
    assert act(second_client,b,'claim',cup_id=cups['her']['id']).status_code==200
    assert act(second_client,b,'claim',cup_id=cups['her']['id']).status_code==200
    with Session(engine) as db:
        assert len(db.exec(select(CocoaCup)).all())==2
        assert db.get(CocoaCup,cups['her']['id']).claimed


def test_accept_pass_and_claim_race_still_returns_same_owned_cup(client, second_client, clean_cocoa):
    pot,a,b,cups=complete_pair(client,second_client,clean_cocoa)
    offered=act(client,a,'offer',run_id=pot.run['id'],kind='pass',cup_id=cups['her']['id']).json()['snapshot']['cocoa']['offers'][0]
    with ThreadPoolExecutor(max_workers=2) as pool:
        one=pool.submit(act,second_client,b,'respond',offer_id=offered['id'],accept=True)
        two=pool.submit(act,second_client,b,'claim',cup_id=cups['her']['id'])
        results=[one.result(),two.result()]
    assert all(r.status_code in (200,409) for r in results) and any(r.status_code==200 for r in results)
    with Session(engine) as db:
        assert len(db.exec(select(CocoaCup)).all())==2 and db.get(CocoaCup,cups['her']['id']).claimed
    assert next(m for m in second_client.get(ROOT).json()['members'] if m['account']=='her')['held_cup_id']==cups['her']['id']


def test_cheers_needs_two_real_holders_and_explicit_response(client, second_client, clean_cocoa):
    pot,a,b,cups=complete_pair(client,second_client,clean_cocoa)
    assert act(client,a,'offer',run_id=pot.run['id'],kind='cheers').status_code==409
    act(client,a,'claim',cup_id=cups['bear']['id']);act(second_client,b,'claim',cup_id=cups['her']['id'])
    offered=act(client,a,'offer',run_id=pot.run['id'],kind='cheers').json()['snapshot']['cocoa']['offers'][0]
    assert state(client)['cheers'] is None
    assert act(second_client,b,'respond',offer_id=offered['id'],accept=True).status_code==200
    cheers=state(client)['cheers'];assert cheers['run_id']==pot.run['id']
    first=state(client)['recipe']['cheered_at'];assert first
    assert act(second_client,b,'respond',offer_id=offered['id'],accept=True).status_code==200
    assert state(client)['recipe']['cheered_at']==first
    act(second_client,b,'leave')
    assert act(client,a,'offer',run_id=pot.run['id'],kind='cheers').status_code==409


def test_completed_cups_survive_next_round_and_partner_must_explicitly_join(client, second_client, clean_cocoa):
    pot,a,b,cups=complete_pair(client,second_client,clean_cocoa);act(client,a,'claim',cup_id=cups['bear']['id'])
    newer=start(client,a)
    assert newer['id']!=pot.run['id']
    members=client.get(ROOT).json()['members']
    assert next(m for m in members if m['account']=='her')['station'] is None
    assert all(m['held_cup_id'] is None for m in members)
    older=client.get(ROOT+f'/cocoa/recipes/{pot.run["id"]}').json()['recipe']
    assert next(c for c in older['cups'] if c['recipient_account']=='bear')['claimed']
    assert act(client,a,'claim',cup_id=cups['bear']['id']).status_code==200


def test_rename_keeps_recipe_and_recipient_identity(client, second_client, clean_cocoa):
    pot,a,b,cups=complete_pair(client,second_client,clean_cocoa)
    names=client.get('/api/meta').json()['names']
    try:
        assert client.put('/api/settings/names',json={'bear':'暖饮小熊','her':'暖饮同伴'}).status_code==200
        recipe=client.get(ROOT+f'/cocoa/recipes/{pot.run["id"]}').json()['recipe']
        assert recipe['makers'][0]['account']=='bear' and recipe['makers'][0]['display']=='暖饮小熊'
        assert {c['id'] for c in recipe['cups']}=={c['id'] for c in cups.values()}
        assert act(second_client,b,'claim',cup_id=cups['her']['id']).status_code==200
    finally:
        client.put('/api/settings/names',json=names)


@pytest.mark.parametrize('extra',[{'dt':999},{'progress':100},{'temperature':50},{'makers':['her']}])
def test_client_cannot_report_progress_time_or_makers(client,extra):
    a=login(client,'bear');run=start(client,a)
    assert act(client,a,'input',run_id=run['id'],seq=1,mode='heat',**extra).status_code==422
    assert state(client)['run']['progress']==0


def test_cookie_origin_and_foreign_lease_are_required(client, second_client):
    client.cookies.clear();assert client.get(ROOT+'/cocoa/recipes').status_code==401
    a,b=login(client,'bear'),login(second_client,'her');run=start(client,a)
    assert act(second_client,a,'station',run_id=run['id'],station='stir').status_code==403
    assert client.put(ACTION,json={'lease_id':a,'action':'start','request_id':str(uuid4()),'activity_seq':99},headers={'origin':'https://evil.invalid'}).status_code==403
    assert act(client,a,'finish',run_id=run['id'],version=run['version'],name='不能提前领奖').status_code==409
    assert act(client,a,'choice',run_id=run['id'],version=run['version'],cup_type='teal',ingredients=['cocoa','cocoa']).status_code==422


def test_completion_failure_rolls_back_recipe_and_first_cup(client, clean_cocoa):
    from sqlalchemy import event
    a=login(client,'bear');pot=Pot(client,a,clean_cocoa);pot.solo()
    count=[0]
    def fail_second_cup(conn,cursor,statement,parameters,context,executemany):
        if statement.lstrip().upper().startswith('INSERT INTO COCOACUP'):
            count[0]+=1
            if count[0]==2:
                raise RuntimeError('injected second cup write failure')
    event.listen(engine,'before_cursor_execute',fail_second_cup)
    try:
        with pytest.raises(RuntimeError,match='second cup'):
            pot.finish()
    finally:
        event.remove(engine,'before_cursor_execute',fail_second_cup)
    assert count[0]==2
    with Session(engine) as db:
        assert not db.exec(select(CocoaRecipe)).all()
        assert not db.exec(select(CocoaCup)).all()
        assert db.get(CocoaRun,pot.run['id']).phase=='pouring'
    assert len(pot.finish()['cups'])==2


def test_overheating_keeps_progress_and_can_recover_with_stirring(client, second_client, clean_cocoa):
    a,b=login(client,'bear'),login(second_client,'her');pot=Pot(client,a,clean_cocoa);pot.station(second_client,b,'stir');pot.command('begin')
    pot.advance(12,[(client,a,'heat')])
    hot=state(client)['run'];assert hot['temperature']>68 and hot['progress']==0
    pot.input(client,a,'stop')
    pot.advance(4,[(second_client,b,'stir')])
    after=state(client)['run'];assert after['temperature']<hot['temperature'] and after['progress']>0
    assert after['phase']=='brewing'


def test_late_activity_entry_cannot_undo_a_newer_leave(client):
    lease=login(client,'bear');run=start(client,lease)
    assert act(client,lease,'leave',activity_seq=10).status_code==200
    assert act(client,lease,'station',run_id=run['id'],station='heat',activity_seq=9).status_code==200
    assert client.get(ROOT).json()['members'][0]['station'] is None
    assert act(client,lease,'station',run_id=run['id'],station='stir',activity_seq=11).status_code==200
    assert act(client,lease,'leave',activity_seq=10).status_code==200
    assert client.get(ROOT).json()['members'][0]['station']=='stir'
