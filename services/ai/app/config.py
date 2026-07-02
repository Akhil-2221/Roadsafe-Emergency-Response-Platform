from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ENV: str = "development"
    ANTHROPIC_API_KEY: str
    AI_SERVICE_KEY: str = ""
    MODEL: str = "claude-opus-4-5"  # Use vision-capable model

    class Config:
        env_file = ".env"


settings = Settings()
