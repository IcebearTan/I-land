"""声音偏好：鉴权、独立账号、局部更新、改名/重登和旧库兼容。"""

import pytest
from sqlalchemy import text
from sqlmodel import Session, create_engine, delete

from app.db import engine
from app.models import UserPreference
from .test_settings import login


DEFAULT = {"music_enabled": True, "ambience_enabled": True, "muted": False,
           "music_volume": .35, "ambience_volume": .55}


@pytest.fixture(autouse=True)
def clean_preferences():
    # conftest 建的是临时库；不访问真实 iland.db。
    with Session(engine) as db:
        db.exec(delete(UserPreference))
        db.commit()
    yield
    with Session(engine) as db:
        db.exec(delete(UserPreference))
        db.commit()


def test_audio_requires_login(client):
    client.cookies.clear()
    assert client.get('/api/settings/audio').status_code == 401
    assert client.put('/api/settings/audio', json={'muted': False}).status_code == 401


def test_new_user_defaults_are_enabled_and_get_does_not_write(client):
    login(client)
    assert client.get('/api/settings/audio').json() == {'settings': DEFAULT}
    assert client.put('/api/settings/audio', json={}).json() == {'settings': DEFAULT}
    with Session(engine) as db:
        assert db.get(UserPreference, client.get('/api/auth/me').json()['user']['id']) is None


def test_audio_is_personal_and_partial_updates_preserve_other_fields(client, second_client):
    login(client, 'bear'); login(second_client, 'her')
    updated = {**DEFAULT, 'muted': False, 'music_volume': .21}
    assert client.put('/api/settings/audio', json={'muted': False, 'music_volume': .21}).json()['settings'] == updated
    assert second_client.get('/api/settings/audio').json()['settings'] == DEFAULT
    updated['ambience_enabled'] = False
    assert client.put('/api/settings/audio', json={'ambience_enabled': False}).json()['settings'] == updated
    assert client.put('/api/settings/audio', json={'ambience_enabled': False}).json()['settings'] == updated
    assert second_client.put('/api/settings/audio', json={'ambience_volume': 1}).json()['settings'] == {**DEFAULT, 'ambience_volume': 1}
    assert client.get('/api/settings/audio').json()['settings'] == updated


@pytest.mark.parametrize('patch', [
    {'music_volume': -.01}, {'music_volume': 1.01}, {'ambience_volume': None},
    {'music_volume': 'NaN'}, {'ambience_volume': 'Infinity'}, {'music_volume': True},
    {'music_enabled': 'false'}, {'ambience_enabled': 0}, {'muted': None},
    {'user_id': 2, 'muted': False}, {'unknown': True},
])
def test_invalid_audio_patch_cannot_change_preferences(client, patch):
    login(client)
    response = client.put('/api/settings/audio', json=patch)
    assert response.status_code == 422, response.text
    assert client.get('/api/settings/audio').json()['settings'] == DEFAULT


def test_zero_and_max_volume_are_valid(client):
    login(client)
    assert client.put('/api/settings/audio', json={'music_volume': 0, 'ambience_volume': 1}).json()['settings'] == {
        **DEFAULT, 'music_volume': 0, 'ambience_volume': 1,
    }


@pytest.mark.parametrize('number', ['NaN', 'Infinity', '-Infinity', '9e999'])
def test_nonfinite_json_volume_returns_validation_error(client, number):
    login(client)
    response = client.put('/api/settings/audio', content='{"music_volume":' + number + '}', headers={'Content-Type': 'application/json'})
    assert response.status_code == 422, response.text
    assert client.get('/api/settings/audio').json()['settings'] == DEFAULT


def test_audio_survives_logout_and_rename(client):
    login(client)
    client.put('/api/settings/audio', json={'music_enabled': False, 'muted': False})
    names = client.get('/api/settings/names').json()['names']
    try:
        assert client.put('/api/settings/names', json={**names, 'bear': '听海的小熊'}).status_code == 200
        client.post('/api/auth/logout')
        login(client)
        assert client.get('/api/settings/audio').json()['settings'] == {**DEFAULT, 'music_enabled': False, 'muted': False}
    finally:
        client.put('/api/settings/names', json=names)


def test_startup_adds_preference_table_without_changing_legacy_data(monkeypatch):
    import app.db as module
    legacy = create_engine('sqlite://')
    with legacy.begin() as conn:
        conn.execute(text('CREATE TABLE user (id INTEGER PRIMARY KEY, name VARCHAR UNIQUE, display VARCHAR, pass_hash VARCHAR, sprite VARCHAR)'))
        conn.execute(text("INSERT INTO user VALUES (1, 'bear', '小熊', '旧密码散列', 'bear')"))
        conn.execute(text('CREATE TABLE letter (id INTEGER PRIMARY KEY, author VARCHAR)'))
        conn.execute(text("INSERT INTO letter VALUES (7, 'bear')"))
    monkeypatch.setattr(module, 'engine', legacy)
    module.init_db(); module.init_db()
    with legacy.connect() as conn:
        assert conn.execute(text('SELECT pass_hash FROM user WHERE id=1')).scalar() == '旧密码散列'
        assert conn.execute(text('SELECT author FROM letter WHERE id=7')).scalar() == 'bear'
        assert conn.execute(text('SELECT COUNT(*) FROM userpreference')).scalar() == 0
    legacy.dispose()
