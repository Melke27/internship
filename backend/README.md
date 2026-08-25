# CBE Support API

## Local setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements/base.txt
cp .env.example .env
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

API documentation is available at `/api/docs/`; JWT endpoints are `/api/auth/token/` and `/api/auth/token/refresh/`.

The API stores only operational metadata. Customer data, PINs, credentials, private keys, and banking transactions are intentionally outside the data model.

