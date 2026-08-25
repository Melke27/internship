import os
from pathlib import Path
from dotenv import load_dotenv
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-cbe-support-key-change-this-2026")
DEBUG = os.getenv("DJANGO_DEBUG", "True").lower() == "true"
ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")
if "testserver" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append("testserver")
INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "corsheaders", "rest_framework", "django_filters", "drf_spectacular",
    "rest_framework_simplejwt.token_blacklist",
    "apps.accounts", "apps.organization", "apps.assets", "apps.incidents",
    "apps.notifications", "apps.audit", "apps.reports",
]
MIDDLEWARE = ["corsheaders.middleware.CorsMiddleware", "django.middleware.security.SecurityMiddleware", "django.contrib.sessions.middleware.SessionMiddleware", "django.middleware.common.CommonMiddleware", "django.middleware.csrf.CsrfViewMiddleware", "django.contrib.auth.middleware.AuthenticationMiddleware", "django.contrib.messages.middleware.MessageMiddleware"]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{"BACKEND":"django.template.backends.django.DjangoTemplates","DIRS":[],"APP_DIRS":True,"OPTIONS":{"context_processors":["django.template.context_processors.request","django.contrib.auth.context_processors.auth","django.contrib.messages.context_processors.messages"]}}]
WSGI_APPLICATION = "config.wsgi.application"
import dj_database_url
DATABASES = {"default": dj_database_url.config(conn_require_ssl=False)}
if os.getenv("DATABASE_URL", "").startswith("sqlite") or DEBUG and os.getenv("USE_SQLITE", "true").lower() == "true":
    DATABASES = {"default": {"ENGINE":"django.db.backends.sqlite3","NAME":BASE_DIR / "db.sqlite3"}}
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validators.UserAttributeSimilarValidator"},
    {"NAME": "django.contrib.auth.password_validators.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validators.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validators.NumericPasswordValidator"},
]
LANGUAGE_CODE = "en-us"; TIME_ZONE = "Africa/Addis_Ababa"; USE_I18N = True; USE_TZ = True
STATIC_URL = "static/"; DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"
CORS_ALLOWED_ORIGINS = [x for x in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if x]
REST_FRAMEWORK = {"DEFAULT_AUTHENTICATION_CLASSES": ("rest_framework_simplejwt.authentication.JWTAuthentication",), "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",), "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend", "rest_framework.filters.SearchFilter", "rest_framework.filters.OrderingFilter"), "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination", "PAGE_SIZE": int(os.getenv("API_PAGE_SIZE", "50")), "DEFAULT_SCHEMA_CLASS":"drf_spectacular.openapi.AutoSchema"}
SIMPLE_JWT = {"ACCESS_TOKEN_LIFETIME":timedelta(minutes=30),"REFRESH_TOKEN_LIFETIME":timedelta(days=1),"AUTH_HEADER_TYPES":("Bearer",)}
SPECTACULAR_SETTINGS = {"TITLE":"CBE Enterprise ATM & ICT Support API","DESCRIPTION":"Scoped internal technical-support API. No customer or banking transaction data.","VERSION":"1.0.0"}
