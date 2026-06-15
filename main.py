from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import io
import os
import requests
from typing import List, Optional

# Import parser functions
from parser import query_osm_businesses, process_osm_data

app = FastAPI(title="Lead Analytics Parser for Moscow")

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_headers=["*"],
    allow_methods=["*"],
)

# Static files directory
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

class SearchRequest(BaseModel):
    city: str
    categories: List[str]

class ExportRequest(BaseModel):
    leads: List[dict]
    format: str  # "csv" or "xlsx"

class PitchRequest(BaseModel):
    business_name: str
    category_key: str
    website: Optional[str] = None
    phone: Optional[str] = None
    pitch_type: Optional[str] = "analytics"  # "analytics" or "startup"

class AIPitchRequest(BaseModel):
    business_name: str
    category_label: str
    website: Optional[str] = None
    phone: Optional[str] = None
    api_key: str
    model: str = "google/gemma-4-31b-it:free"

@app.get("/api/cities")
def get_cities():
    return [
        {"name": "Москва", "latin": "Moscow"},
        {"name": "Санкт-Петербург", "latin": "Saint Petersburg"},
        {"name": "Новосибирск", "latin": "Novosibirsk"},
        {"name": "Екатеринбург", "latin": "Yekaterinburg"},
        {"name": "Казань", "latin": "Kazan"},
        {"name": "Нижний Новгород", "latin": "Nizhny Novgorod"},
        {"name": "Краснодар", "latin": "Krasnodar"},
        {"name": "Сочи", "latin": "Sochi"},
        {"name": "Владивосток", "latin": "Vladivostok"}
    ]

@app.get("/api/categories")
def get_categories():
    return [
        {"id": "cafe", "name": "☕️ Кофейни и Кафе"},
        {"id": "bakery", "name": "🥐 Пекарни"},
        {"id": "confectionery", "name": "🍰 Кондитерские"},
        {"id": "restaurant", "name": "🍽️ Рестораны"},
        {"id": "fast_food", "name": "🍔 Фаст-фуд и Бистро"},
        {"id": "beauty", "name": "💅 Салоны красоты"},
        {"id": "florist", "name": "💐 Цветочные магазины"}
    ]

@app.post("/api/search")
def search_leads(req: SearchRequest):
    try:
        raw_data = query_osm_businesses(req.city, req.categories)
        processed_leads = process_osm_data(raw_data)
        return {"status": "success", "total": len(processed_leads), "leads": processed_leads}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pitch")
def generate_pitch(req: PitchRequest):
    name = req.business_name
    cat = req.category_key
    
    if req.pitch_type == "startup":
        subject = f"Разработка FastAPI бэкенда / ML MVP для {name} (бесплатно, за кейс в портфолио)"
        body = f"""Здравствуйте!

Меня зовут [Ваше Имя], я начинающий бэкенд-разработчик и специалист по анализу данных (Python/FastAPI/ML).

Я наткнулся на ваш проект "{name}" и он мне очень понравился! Я вижу, что вы строите крутой продукт и активно развиваетесь. Я понимаю, что на ранней стадии (Pre-seed/Seed) перед стартапом стоит огромное количество технических задач, а ресурсы всегда ограничены.

В рамках расширения своего практического портфолио я ищу интересные технологические проекты, которым готов **совершенно бесплатно** помочь с бэкенд-разработкой, написанием парсеров или внедрением простых ML-решений.

**Чем конкретно я могу помочь вашему стартапу "{name}":**

1. **Разработка API и бэкенда на FastAPI:** Создание быстрых асинхронных эндпоинтов, интеграция со сторонними сервисами (платежные шлюзы, SMS, мессенджеры) и работа с базами данных (PostgreSQL/MongoDB via SQLAlchemy/Beanie).
2. **Сбор и парсинг данных (Web Scraping):** Написание надежных парсеров для мониторинга цен конкурентов, автоматического наполнения контентом или агрегации данных.
3. **Простой ML-функционал и работа с LLM:** Интеграция API OpenAI/Claude, настройка текстовых классификаторов, рекомендательных алгоритмов или парсеров неструктурированного текста (например, резюме или отзывов).
4. **Проектирование и оптимизация БД:** Оптимизация медленных SQL-запросов, построение схем данных и миграции (Alembic).

**Что мне потребуется от вас для работы:**
Четкое описание задачи (ТЗ, User Story или тикеты в трекере) и короткий созвон на 15 минут для обсуждения архитектурных требований.

**Что вы получите в результате:**
Чистый, протестированный код (по стандарту PEP8/Black), покрытый тестами и упакованный в Docker, готовый к деплою на сервер.

**Почему бесплатно?**
Мой главный интерес — получить сложную и интересную боевую задачу в портфолио и рекомендательное письмо от вашего фаундера или СТО по завершении проекта.

Если вам интересен такой формат сотрудничества, напишите мне в ответ на это письмо или в Telegram [Ваш Telegram], и мы обсудим, какие задачи я могу взять в работу!

С уважением,
[Ваше Имя]
GitHub: [Ссылка на ваш профиль]
Email: [Ваш Email]
Телефон/Telegram: [Контакты]"""
        return {"subject": subject, "body": body}

    # Custom pitch template generator based on business type (Analytics pitch)
    if cat in ["cafe", "bakery", "confectionery", "restaurant", "fast_food"]:
        pos_systems = "iiko, r-keeper, Poster или Quick Resto"
        analytics_topics = (
            "1. **Анализ меню (ABC/XYZ-анализ):** Выявление позиций, которые приносят максимальную прибыль, и тех, которые просто занимают место на складе и списываются.\n"
            "2. **Прогнозирование спроса:** Построение модели прогнозирования продаж (по дням недели, с учетом погоды или праздников), чтобы минимизировать списания выпечки и оптимизировать закупки ингредиентов/молока.\n"
            "3. **Анализ программы лояльности:** Сегментация ваших гостей по RFM (Recency, Frequency, Monetary). Мы определим, кто ваши постоянные клиенты, кто 'засыпает' и как их вернуть, а также посчитаем средний LTV (Lifetime Value).\n"
            "4. **Анализ чеков (Market Basket Analysis):** Понимание, какие товары чаще всего покупают вместе, для создания более эффективных комбо-предложений и допродаж."
        )
        data_needed = "выгрузка продаж по чекам в формате Excel/CSV (анонимизированная, без персональных данных гостей) за последние 3-6 месяцев из вашей кассовой системы."
    elif cat == "beauty":
        pos_systems = "YClients или Altegio"
        analytics_topics = (
            "1. **Прогнозирование оттока клиентов:** Анализ визитов для выявления клиентов, которые перестали ходить к вам, и определение оптимального времени для напоминания о себе.\n"
            "2. **Анализ загрузки мастеров:** Определение пиковых часов и недозагруженных окон для оптимизации графиков работы сотрудников и запуска точечных акций.\n"
            "3. **RFM-анализ клиентской базы:** Разделение клиентов на группы (VIP, лояльные, новые, уходящие) для персонализированных рассылок.\n"
            "4. **Эффективность услуг:** Выявление самых маржинальных и популярных услуг, а также анализ возвращаемости клиентов после конкретных процедур или к конкретным мастерам."
        )
        data_needed = "выгрузка журнала записей и истории визитов клиентов за последние несколько месяцев из YClients/Altegio (без конфиденциальных личных данных)."
    elif cat == "florist":
        pos_systems = "1С, МойСклад или специализированные CRM"
        analytics_topics = (
            "1. **Оптимизация остатков к праздникам:** Анализ исторических данных продаж на 8 Марта, 14 Февраля и День матери для точного прогноза объемов закупки цветов (чтобы избежать увядания излишков и дефицита).\n"
            "2. **Анализ списаний:** Выявление причин и паттернов порчи цветов для оптимизации складских запасов.\n"
            "3. **Анализ маржинальности букетов:** Расчет реальной прибыльности различных цветочных композиций с учетом стоимости сборки и упаковки.\n"
            "4. **Анализ работы флористов:** Сравнение конверсии продаж и среднего чека у разных сотрудников."
        )
        data_needed = "история продаж и списаний товаров из вашей учетной системы за последние 6-12 месяцев."
    else:
        pos_systems = "кассовые или учетные системы"
        analytics_topics = (
            "1. **Анализ структуры продаж:** Выявление ключевых драйверов вашей выручки.\n"
            "2. **Сегментация клиентов:** Определение профилей ваших наиболее прибыльных покупателей.\n"
            "3. **Прогнозирование спроса:** Помощь в планировании закупок и оптимизации складских запасов."
        )
        data_needed = "выгрузка транзакций или чеков за последние несколько месяцев."

    subject = f"Предложение по бесплатной аналитике данных для {name}"
    
    body = f"""Здравствуйте!

Меня зовут [Ваше Имя], я начинающий аналитик данных (Data Analyst). 

Я обратил внимание на ваше заведение "{name}" и хотел бы предложить вам сотрудничество. В рамках создания своего портфеля проектов я ищу интересные локальные бизнесы, которым готов **совершенно бесплатно** помочь настроить и проанализировать их бизнес-показатели.

У вас, скорее всего, установлена одна из систем учета (например, {pos_systems}). В ней накапливается огромный массив данных, который можно превратить в дополнительную прибыль для вашего бизнеса. 

**Чем конкретно я могу помочь "{name}":**

{analytics_topics}

**Что мне потребуется от вас для работы:**
Мне не нужен доступ к вашей CRM или кассе. Достаточно будет просто сделать {data_needed}

**Что вы получите в результате:**
Красивый интерактивный дашборд (в BI-системе или Excel) с ключевыми метриками вашего бизнеса, а также текстовый отчет с конкретными выводами и рекомендациями: какие позиции убрать из меню/прайса, как сократить списания и какие сегменты клиентов запустить в рассылку для увеличения выручки.

**Почему бесплатно?**
Мой главный интерес — получить реальный кейс в портфолио, практический опыт и ваш отзыв по окончании работы.

Если вам это интересно, напишите мне в ответном сообщении или в Telegram [Ваш Telegram], и мы обсудим детали!

С уважением,
[Ваше Имя]
Email: [Ваш Email]
Телефон/Telegram: [Контакты]"""

    return {"subject": subject, "body": body}

@app.post("/api/pitch/ai")
def generate_ai_pitch(req: AIPitchRequest):
    # Construct the strict student prompt as specified by the user
    prompt = (
        f"Ты — студент-разработчик 3 курса. Твоя задача — написать короткое холодное предложение "
        f"о бесплатной аналитике данных для компании {req.business_name} (сфера: {req.category_label}).\n"
        f"Сайт заведения: {req.website or 'не указан'}.\n"
        f"Телефон: {req.phone or 'не указан'}.\n\n"
        f"СТРОГИЕ ПРАВИЛА:\n"
        f"1. Пиши на русском языке, просто и без пафоса. Словно пишешь знакомому предпринимателю в Телеграм.\n"
        f"2. Запрещено использовать клише: \"Надеюсь, это письмо застанет вас в здравии\", \"Уникальное предложение\", "
        f"\"Революционный подход\", \"Уважаемые господа\".\n"
        f"3. Никаких списков со смайликами. Максимум 3–4 коротких абзаца. Начни сразу с сути: кто ты и чем конкретно "
        f"можешь помочь их бизнесу бесплатно за отзыв."
    )

    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {req.api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "LeadAnalytics"
    }
    
    payload = {
        "model": req.model,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }
    
    try:
        res = requests.post(url, headers=headers, json=payload, timeout=40)
        if res.status_code == 200:
            data = res.json()
            choices = data.get("choices", [])
            if choices:
                text = choices[0].get("message", {}).get("content", "")
                subject = f"Предложение по аналитике для {req.business_name}"
                return {"subject": subject, "body": text}
            raise Exception("No response choices returned from OpenRouter API.")
        else:
            raise Exception(f"OpenRouter returned error: {res.status_code} - {res.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/export")
def export_leads(req: ExportRequest):
    if not req.leads:
        raise HTTPException(status_code=400, detail="No leads provided for export")
        
    df = pd.DataFrame(req.leads)
    
    # Select and rename columns for Russian export
    columns_mapping = {
        "name": "Название",
        "category_label": "Категория",
        "address": "Адрес",
        "phone": "Телефон",
        "website": "Сайт/Соцсеть",
        "brand": "Сеть/Бренд",
        "potential_score": "Потенциал аналитики",
        "potential_reason": "Обоснование оценки",
        "lat": "Широта",
        "lon": "Долгота",
        "opening_hours": "Режим работы"
    }
    
    # Filter columns that actually exist in the dataframe
    cols_to_keep = [col for col in columns_mapping.keys() if col in df.columns]
    df_export = df[cols_to_keep].rename(columns={c: columns_mapping[c] for c in cols_to_keep})
    
    if req.format.lower() == "xlsx":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df_export.to_excel(writer, index=False, sheet_name="Лиды")
        output.seek(0)
        
        headers = {
            'Content-Disposition': 'attachment; filename="analytics_leads.xlsx"'
        }
        return Response(
            content=output.getvalue(),
            headers=headers,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    else:  # csv
        output = io.StringIO()
        df_export.to_csv(output, index=False, encoding="utf-8-sig")
        
        headers = {
            'Content-Disposition': 'attachment; filename="analytics_leads.csv"'
        }
        return Response(
            content=output.getvalue().encode("utf-8-sig"),
            headers=headers,
            media_type="text/csv"
        )

# Serve static files (including index.html, style.css, app.js)
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
