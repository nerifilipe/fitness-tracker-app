from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.core.errors import ErrorResponse
from app.db.session import DatabaseSession
from app.modules.auth.dependencies import CurrentUser
from app.modules.templates import service
from app.modules.templates.schemas import (
    TemplateInput,
    TemplatePage,
    TemplateResponse,
    TemplateUpdate,
)

router = APIRouter(
    prefix="/workout-templates",
    tags=["workout-templates"],
    responses={code: {"model": ErrorResponse} for code in (401, 404, 409, 422)},
)


@router.get("", response_model=TemplatePage)
def listing(
    user: CurrentUser,
    db: DatabaseSession,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> TemplatePage:
    return service.list_templates(db, user.id, offset, limit)


@router.post("", response_model=TemplateResponse, status_code=201)
def create(data: TemplateInput, user: CurrentUser, db: DatabaseSession) -> TemplateResponse:
    return service.create(db, user.id, data)


@router.get("/{template_id}", response_model=TemplateResponse)
def detail(template_id: UUID, user: CurrentUser, db: DatabaseSession) -> TemplateResponse:
    return service.response(service.get_owned(db, user.id, template_id))


@router.put("/{template_id}", response_model=TemplateResponse)
def edit(
    template_id: UUID, data: TemplateUpdate, user: CurrentUser, db: DatabaseSession
) -> TemplateResponse:
    return service.update(db, user.id, template_id, data)


@router.post("/{template_id}/duplicate", response_model=TemplateResponse, status_code=201)
def duplicate(template_id: UUID, user: CurrentUser, db: DatabaseSession) -> TemplateResponse:
    return service.duplicate(db, user.id, template_id)


@router.delete("/{template_id}", status_code=204)
def archive(
    template_id: UUID, user: CurrentUser, db: DatabaseSession, version: Annotated[int, Query(ge=1)]
) -> Response:
    service.archive(db, user.id, template_id, version)
    return Response(status_code=204)
