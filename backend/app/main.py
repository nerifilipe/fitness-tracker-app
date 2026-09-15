from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings
from app.core.errors import register_error_handlers
from app.core.rate_limit import AuthLimiter
from app.db.session import build_engine
from app.modules.auth.router import router as auth_router
from app.modules.exercises.router import router as exercises_router
from app.modules.health.router import router as health_router
from app.modules.nutrition.provider import FoodProvider
from app.modules.nutrition.router import router as nutrition_router
from app.modules.templates.router import router as templates_router
from app.modules.users.router import router as users_router
from app.modules.workouts.router import router as workouts_router


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = build_engine(config)
        app.state.engine = engine
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="Fitness Tracker API", version="0.1.0", lifespan=lifespan)
    app.state.settings = config
    app.state.auth_limiter = AuthLimiter(config.auth_rate_limit)
    app.state.food_provider = FoodProvider(config.food_user_agent)
    register_error_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
    )
    app.include_router(health_router, prefix="/api/v1")
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(users_router, prefix="/api/v1")
    app.include_router(exercises_router, prefix="/api/v1")
    app.include_router(templates_router, prefix="/api/v1")
    app.include_router(workouts_router, prefix="/api/v1")
    app.include_router(nutrition_router, prefix="/api/v1")

    @app.middleware("http")
    async def private_responses(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith(
            (
                "/api/v1/auth",
                "/api/v1/users",
                "/api/v1/exercises",
                "/api/v1/workout-templates",
                "/api/v1/workouts",
                "/api/v1/nutrition",
            )
        ):
            response.headers["Cache-Control"] = "no-store"
        return response

    return app


app = create_app()
