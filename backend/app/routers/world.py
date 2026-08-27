from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import User, WorldState, jdump, jload

router = APIRouter(prefix="/api/world", tags=["world"])


@router.get("")
def get_world(db: Session = Depends(get_db)):
    world = db.get(WorldState, 1)
    if world is None:
        return {"version": 0, "data": {}}
    return {"version": world.version, "data": jload(world.data_json, {})}


class WorldPut(BaseModel):
    version: int
    data: dict


@router.put("")
def put_world(
    body: WorldPut,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    world = db.get(WorldState, 1)
    if world is None:
        world = WorldState(id=1)
    if body.version != world.version:
        raise HTTPException(409, "世界刚被对方更新过，刷新看看她的改动再试")
    world.version += 1
    world.data_json = jdump(body.data)
    db.add(world)
    db.commit()
    return {"version": world.version}
