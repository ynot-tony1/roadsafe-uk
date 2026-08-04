"""Runtime configuration, read from environment variables.

Connection strings are only ever held in memory as pydantic SecretStr and
are never included in __repr__, logs, or exceptions raised by this module.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]
CONFIG_DIR = REPO_ROOT / "config"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    ingest_database_url: SecretStr = Field(default=SecretStr(""))
    log_level: str = Field(default="INFO")
    provisional_data_enabled: bool = Field(default=False)
    data_dir: Path = Field(default=REPO_ROOT / "data")

    source_config_path: Path = Field(default=CONFIG_DIR / "source-config.yml")
    code_lists_path: Path = Field(default=CONFIG_DIR / "stats19-code-lists" / "code-lists.json")
    map_layers_path: Path = Field(default=CONFIG_DIR / "map-layers.yml")


def get_settings() -> Settings:
    return Settings()
