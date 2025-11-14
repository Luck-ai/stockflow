import os
from functools import lru_cache
from pydantic import BaseModel, Field


class Settings(BaseModel):

    db_url: str | None = Field(default=None, description="Full SQLAlchemy database URL")
    db_user: str = Field(default="admin2")
    db_password: str = Field(default="admin2")
    db_host: str = Field(default="postgres2")
    db_port: int = Field(default=5432)
    db_name: str = Field(default="postgres")

    @property
    def sqlalchemy_url(self) -> str:
        if self.db_url:
            return self.db_url
        return (
            f"postgresql://{self.db_user}:{self.db_password}@"
            f"{self.db_host}:{self.db_port}/{self.db_name}"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings instance."""

    return Settings(
        db_url=os.getenv("DB_URL"),
        db_user=os.getenv("DB_USER", "admin2"),
        db_password=os.getenv("DB_PASSWORD", "admin2"),
        db_host=os.getenv("DB_HOST", "postgres2"),
        db_port=int(os.getenv("DB_PORT", "5432")),
        db_name=os.getenv("DB_NAME", "postgres"),
    )

"""
to switch to the first db, user = admin, password = admin, db = db
to switch to the second db, user = admin2, password = admin2, db =postgres
to switch to local development, change host = localhost"""

