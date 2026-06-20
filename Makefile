.PHONY: install dev run test lint fmt docker clean

install:  ## Установить зависимости приложения
	pip install -r requirements.txt

dev:  ## Установить зависимости для разработки (тесты, линтер)
	pip install -r requirements-dev.txt

run:  ## Запустить сервер разработки с автоперезагрузкой
	uvicorn app.main:app --reload

test:  ## Прогнать тесты
	pytest

lint:  ## Проверить код линтером
	ruff check .

fmt:  ## Отформатировать код
	ruff format .

docker:  ## Собрать и запустить через Docker Compose
	docker compose up --build

clean:  ## Удалить кэш и временные файлы
	rm -rf __pycache__ .pytest_cache .ruff_cache
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
