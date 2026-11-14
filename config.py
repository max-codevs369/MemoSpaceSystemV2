import os
from datetime import timedelta

from dotenv import load_dotenv
from sqlalchemy.engine import URL

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


def _bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def build_database_uri() -> str:
    explicit = os.environ.get("DATABASE_URL")
    if explicit:
        return explicit
    return URL.create(
        drivername="mysql+pymysql",
        username=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", ""),
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", "3306")),
        database=os.environ.get("DB_NAME", "memospace"),
        query={"charset": "utf8mb4"},
    ).render_as_string(hide_password=False)


def ssl_connect_args() -> dict:
    if not _bool(os.environ.get("DB_SSL"), False):
        return {}
    args = {"ssl_verify_cert": True, "ssl_verify_identity": True}
    ca_path = os.environ.get("DB_SSL_CA")
    if ca_path:
        args["ssl_ca"] = ca_path
    return args


class Config:
    APP_ENV = os.environ.get("APP_ENV", "development").lower()
    IS_PRODUCTION = APP_ENV == "production"
    DEBUG = not IS_PRODUCTION

    SECRET_KEY = os.environ.get("SECRET_KEY")

    SQLALCHEMY_DATABASE_URI = build_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
        **({"connect_args": ssl_connect_args()} if ssl_connect_args() else {}),
    }

    PROXY_HOPS = int(os.environ.get("PROXY_HOPS") or (1 if IS_PRODUCTION else 0))
    APP_TIMEZONE = os.environ.get("APP_TIMEZONE", "Asia/Jakarta")
    TRASH_RETENTION_DAYS = int(os.environ.get("TRASH_RETENTION_DAYS", "30"))
    AUTO_CREATE_TABLES = _bool(os.environ.get("AUTO_CREATE_TABLES"), True)

    SESSION_COOKIE_NAME = "memospace_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _bool(os.environ.get("SESSION_COOKIE_SECURE"), IS_PRODUCTION)
    PERMANENT_SESSION_LIFETIME = timedelta(days=365 * 5)