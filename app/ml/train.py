"""Скрипт обучения модели скоринга.

Запуск:
    python -m app.ml.train

Обучает пайплайн на синтетической выборке, печатает метрики (ROC-AUC, accuracy)
и сохраняет артефакт в app/ml/model.joblib.
"""

from __future__ import annotations

import joblib

from app.ml.model import MODEL_PATH, train_model


def main() -> None:
    model, metrics = train_model()
    joblib.dump(model, MODEL_PATH)
    print("Модель обучена и сохранена:", MODEL_PATH)
    print("Метрики на отложенной выборке:")
    for key, value in metrics.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
