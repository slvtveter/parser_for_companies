# LeadAnalytics

Веб-приложение на FastAPI: ищет локальный бизнес в OpenStreetMap, оценивает его «аналитический потенциал» и генерирует холодные письма. Помогает начинающему аналитику данных находить заведения для бесплатных проектов в портфолио.

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![CI](https://img.shields.io/badge/CI-ruff%20%2B%20pytest-informational)](.github/workflows/ci.yml)

## Возможности

- Поиск заведений по городу и категориям через Overpass API (OpenStreetMap), без ключей и прокси.
- Семь категорий: кофейни, пекарни, кондитерские, рестораны, фастфуд, салоны красоты, цветочные.
- Перебор зеркал Overpass с фолбэком POST → GET при недоступности части серверов.
- Кэширование повторных запросов в памяти: одинаковый поиск отдаётся мгновенно, без обращения к Overpass.
- Эвристическая оценка потенциала клиента (HIGH / MEDIUM / LOW) и определение сетей.
- Результаты на интерактивной карте Leaflet и в таблице с поиском и фильтрами.
- Генерация писем: шаблоны под тип бизнеса и персональные письма через нейросеть (OpenRouter).
- Экспорт лидов в CSV или XLSX.

## Скриншот

![Интерфейс LeadAnalytics](docs/screenshot.png)

## Стек

Бэкенд — FastAPI, Pydantic v2, pydantic-settings, Uvicorn. Данные — Pandas, OpenPyXL, Requests.
Фронтенд — ванильный JavaScript, Leaflet.js. Источник данных — OpenStreetMap Overpass API, генерация писем — OpenRouter.

## Структура

```
app/                 Бэкенд FastAPI
  main.py            Сборка приложения, CORS, отдача статики
  config.py          Настройки через переменные окружения
  constants.py       Города, категории, маппинг тегов OSM
  schemas.py         Pydantic-модели запросов и ответов
  api/routes.py      Маршруты REST API (/api/...)
  services/          Логика: osm, scoring, pitch, ai, export, cache
static/              Фронтенд (HTML, CSS, JS, карта Leaflet)
analysis/            EDA-ноутбук и выгрузки данных
tests/               Тесты на pytest (офлайн, без сети)
```

## Быстрый старт

Требуется Python 3.10+.

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Интерфейс — http://127.0.0.1:8000, документация API — http://127.0.0.1:8000/docs.
Через Docker: `docker compose up --build`.

## Конфигурация

Настройки читаются из переменных окружения или файла `.env` (шаблон — `.env.example`). Все необязательны.

| Переменная | Назначение | По умолчанию |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Серверный ключ OpenRouter для генерации писем | не задан |
| `OPENROUTER_DEFAULT_MODEL` | Модель по умолчанию | `openai/gpt-oss-20b:free` |
| `CORS_ORIGINS` | Разрешённые источники CORS | `["*"]` |

Ключ OpenRouter можно задать на сервере (`OPENROUTER_API_KEY`) или ввести в интерфейсе — тогда он хранится в `localStorage` браузера. Файл `.env` не коммитится.

## API

Все маршруты под префиксом `/api`.

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/health` | Проверка доступности и версии |
| GET | `/api/cities` | Список городов |
| GET | `/api/categories` | Список категорий |
| POST | `/api/search` | Поиск заведений и оценка потенциала |
| POST | `/api/pitch` | Шаблонное письмо под тип бизнеса |
| POST | `/api/pitch/ai` | Письмо через нейросеть (OpenRouter) |
| POST | `/api/export` | Выгрузка лидов в CSV/XLSX |

## Скоринг потенциала

Рассчитывается в `app/services/scoring.py`. Сначала определяется, сеть ли это (по тегу `brand` или списку известных сетей), затем выставляется оценка:

- **HIGH** — независимое заведение с сайтом и телефоном: вероятно, есть учётная система с данными, но нет штатного аналитика.
- **MEDIUM** — независимое, но доступен только один канал связи.
- **LOW** — крупная сеть либо отсутствие контактов на карте.

## Методология

Цель — набрать реальные кейсы. Ориентируйтесь на заведения HIGH: у них есть данные в кассовой системе (iiko, r-keeper, YClients, МойСклад), но нет аналитика. Свяжитесь онлайн (сгенерированное письмо) или офлайн (через управляющего) и предложите бесплатный анализ за отзыв. Достаточно обезличенной выгрузки чеков или журнала записей за 3–6 месяцев. Типовые кейсы: ABC/XYZ-анализ ассортимента, прогноз спроса, RFM-сегментация, дашборд с рекомендациями.

## Тестирование

Тесты на pytest не обращаются к сети (Overpass подменяется фикстурой).

```bash
pip install -r requirements-dev.txt
pytest
ruff check .
```

CI (`.github/workflows/ci.yml`) запускает ruff и pytest на push и pull request в `main`.

## Лицензия

MIT, см. [LICENSE](LICENSE).
