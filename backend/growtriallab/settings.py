import os
from pathlib import Path

import dj_database_url

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-secret-key-change-me")

DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() in {"1", "true", "yes"}


def _is_placeholder(value: str) -> bool:
    normalized = (value or "").strip().lower()
    return normalized in {"", "replace_me", "your-team.cloudflareaccess.com"}

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get(
        "DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,host.docker.internal"
    ).split(",")
    if host.strip()
]
if DEBUG and "*" not in ALLOWED_HOSTS:
    # Local/LAN development should not fail on host-IP access.
    ALLOWED_HOSTS.append("*")


# Application definition

INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",
    "api",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "api.middleware.CloudflareAccessMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "growtriallab.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "growtriallab.wsgi.application"


DATABASES = {
    "default": dj_database_url.parse(
        os.environ.get("DATABASE_URL", f"sqlite:///{BASE_DIR / 'db.sqlite3'}"),
        conn_max_age=600,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


STATIC_URL = "static/"
MEDIA_URL = "/media/"
MEDIA_ROOT = Path("/data/uploads")

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://host.docker.internal:3000"
    ).split(",")
    if origin.strip()
]

CF_ACCESS_TEAM_DOMAIN = os.environ.get("CF_ACCESS_TEAM_DOMAIN", "").strip()
CF_ACCESS_AUD = os.environ.get("CF_ACCESS_AUD", "").strip()
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com").strip().lower()
AUTH_MODE = os.environ.get("AUTH_MODE", "invite_only").strip().lower()
DEV_EMAIL = os.environ.get("DEV_EMAIL", ADMIN_EMAIL).strip().lower()
NODE_ENV = os.environ.get("NODE_ENV", "").strip().lower()
ENABLE_DEV_AUTH_BYPASS = os.environ.get("ENABLE_DEV_AUTH_BYPASS", "").strip().lower() in {
    "1",
    "true",
    "yes",
}
CF_ACCESS_CONFIGURED = not _is_placeholder(CF_ACCESS_TEAM_DOMAIN) and not _is_placeholder(
    CF_ACCESS_AUD
)
DEV_AUTH_BYPASS_ENABLED = (
    NODE_ENV == "development"
    and DEBUG
    and ENABLE_DEV_AUTH_BYPASS
    and not CF_ACCESS_CONFIGURED
)
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").strip()

REST_FRAMEWORK = {
    "DEFAULT_PAGINATION_CLASS": "api.pagination.EnvelopePageNumberPagination",
    "PAGE_SIZE": 25,
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
