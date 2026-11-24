"""客厅料理只接收意图；进度、制作人、成果与领取由服务器确认。"""
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Cookie, Request
from pydantic import Field, field_validator, model_validator

from ..cocoa_runtime import cocoa_runtime
from .rooms import RoomIn, check_source

router = APIRouter(prefix="/api/rooms/interior/cocoa", tags=["cocoa"])


class LeaseAction(RoomIn):
    lease_id: UUID


class MembershipAction(LeaseAction):
    activity_seq: int = Field(strict=True, ge=1)


class Start(MembershipAction):
    action: Literal["start"]
    request_id: UUID


class RunAction(LeaseAction):
    run_id: int = Field(strict=True, ge=1)


class Station(RunAction):
    action: Literal["station"]
    station: Literal["heat", "stir"]
    activity_seq: int = Field(strict=True, ge=1)


class Leave(MembershipAction):
    action: Literal["leave"]


class VersionAction(RunAction):
    version: int = Field(strict=True, ge=1)


class Choice(VersionAction):
    action: Literal["choice"]
    cup_type: Literal["cream", "teal"]
    ingredients: list[Literal["marshmallow", "cocoa", "cinnamon"]] = Field(max_length=3)

    @field_validator("ingredients")
    @classmethod
    def unique_ingredients(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("每种配料只需选择一次")
        return value


class Stage(VersionAction):
    action: Literal["begin", "pause", "resume"]


class Input(RunAction):
    action: Literal["input"]
    seq: int = Field(strict=True, ge=0)
    mode: Literal["gentle", "heat", "stir", "stop"]


class Finish(VersionAction):
    action: Literal["finish"]
    name: str = Field(min_length=1, max_length=40)

    @field_validator("name")
    @classmethod
    def readable_name(cls, value):
        value = value.strip()
        if not value or any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise ValueError("配方名字需要1–40个可读字符")
        return value


class Claim(LeaseAction):
    action: Literal["claim"]
    cup_id: int = Field(strict=True, ge=1)


class Offer(RunAction):
    action: Literal["offer"]
    kind: Literal["swap", "pass", "cheers"]
    cup_id: int | None = Field(default=None, strict=True, ge=1)

    @model_validator(mode="after")
    def pass_cup_only(self):
        if (self.kind == "pass") != (self.cup_id is not None):
            raise ValueError("只有递杯需要指定杯子")
        return self


class Respond(LeaseAction):
    action: Literal["respond"]
    offer_id: UUID
    accept: bool = Field(strict=True)


class Cancel(LeaseAction):
    action: Literal["cancel"]
    offer_id: UUID


CocoaAction = Annotated[Start | Station | Leave | Choice | Stage | Input | Finish | Claim | Offer | Respond | Cancel,
                        Field(discriminator="action")]


@router.get("/recipes")
def list_recipes(request: Request, iland_session: str | None = Cookie(default=None)):
    check_source(request)
    return cocoa_runtime.recipes(iland_session)


@router.get("/recipes/{run_id}")
def get_recipe(run_id: int, request: Request, iland_session: str | None = Cookie(default=None)):
    check_source(request)
    return cocoa_runtime.recipes(iland_session, run_id)


@router.put("/action")
def act(body: CocoaAction, request: Request, iland_session: str | None = Cookie(default=None)):
    check_source(request)
    return cocoa_runtime.action(iland_session, body.model_dump())
