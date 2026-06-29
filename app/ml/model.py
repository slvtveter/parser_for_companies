"""Модель оценки потенциала лида (scikit-learn) с объяснимым вкладом признаков.

Размеченных данных «клиент согласился» в открытом доступе нет, поэтому модель
обучается методом weak supervision: на синтетической выборке, сгенерированной из
доменных правил с реалистичным шумом и взаимодействиями признаков. Модель не просто
повторяет правило — она обобщает зашумлённую зависимость, а линейные коэффициенты
дают честное объяснение вклада каждого признака для конкретного лида.

Если scikit-learn недоступен, вызывающий код переходит на эвристику.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).resolve().parent / "model.joblib"
RANDOM_SEED = 42
DATASET_SIZE = 2000

_model = None  # ленивый синглтон обученного пайплайна
_unavailable = False  # True, если sklearn не установлен


def _build_dataset(n: int = DATASET_SIZE, seed: int = RANDOM_SEED):
    """Генерирует синтетическую выборку признаков и меток (weak supervision)."""
    import numpy as np

    rng = np.random.default_rng(seed)

    independent = rng.binomial(1, 0.70, n)
    phone = rng.binomial(1, 0.60, n)
    website = rng.binomial(1, 0.32, n)
    social = rng.binomial(1, 0.42, n)
    email = rng.binomial(1, 0.18, n)
    hours = rng.binomial(1, 0.50, n)
    profile = rng.binomial(1, 0.45, n)
    mini_chain = rng.binomial(1, 0.08, n) * independent  # мини-сеть только у независимых
    competition = np.minimum(rng.poisson(2.2, n), 12)

    # Латентная «полезность» лида: доменные веса + взаимодействия.
    utility = (
        1.7 * independent
        + 1.1 * phone
        + 1.0 * website
        + 0.8 * social
        + 0.6 * email
        + 0.5 * hours
        + 0.4 * profile
        + 1.3 * mini_chain
        + 0.12 * competition
        + 0.7 * (independent * phone)
        + 0.5 * (website * social)
        + 0.25 * (independent * competition)
        - 1.6 * (1 - independent)
    )
    utility = utility - utility.mean()
    noise = rng.normal(0, 1.0, n)
    prob = 1.0 / (1.0 + np.exp(-(utility + noise)))
    labels = rng.binomial(1, prob)

    matrix = np.column_stack(
        [independent, phone, website, social, email, hours, profile, mini_chain, competition]
    ).astype(float)
    return matrix, labels


def train_model(seed: int = RANDOM_SEED):
    """Обучает пайплайн (StandardScaler + LogisticRegression). Возвращает (модель, метрики)."""
    import numpy as np  # noqa: F401
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, roc_auc_score
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    x, y = _build_dataset(seed=seed)
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.25, random_state=seed)

    pipeline = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000, C=1.0)),
        ]
    )
    pipeline.fit(x_train, y_train)

    proba = pipeline.predict_proba(x_test)[:, 1]
    metrics = {
        "roc_auc": round(float(roc_auc_score(y_test, proba)), 4),
        "accuracy": round(float(accuracy_score(y_test, pipeline.predict(x_test))), 4),
        "n_train": int(len(y_train)),
        "n_test": int(len(y_test)),
    }

    # Финальная модель — на всех данных.
    pipeline.fit(x, y)
    return pipeline, metrics


def get_model():
    """Ленивая загрузка модели: из файла, иначе обучение «на лету» (и попытка сохранить).

    Возвращает None, если scikit-learn не установлен — тогда используется эвристика.
    """
    global _model, _unavailable
    if _model is not None:
        return _model
    if _unavailable:
        return None

    try:
        import joblib  # noqa: F401
    except ImportError:
        logger.warning("scikit-learn/joblib не установлены — скоринг работает на эвристике")
        _unavailable = True
        return None

    import joblib

    if MODEL_PATH.exists():
        try:
            _model = joblib.load(MODEL_PATH)
            return _model
        except Exception as exc:  # noqa: BLE001 - несовместимый артефакт -> переобучим
            logger.warning("Не удалось загрузить модель (%s), переобучаю", exc)

    # Обучаем «на лету» под установленную версию sklearn (детерминированно, ~1 c).
    # Артефакт намеренно не сохраняем, чтобы не ловить несовместимость версий;
    # для явного сохранения и метрик есть `python -m app.ml.train`.
    try:
        _model, metrics = train_model()
        logger.info("ML-модель обучена на лету: %s", metrics)
        return _model
    except ImportError:
        logger.warning("scikit-learn не установлен — скоринг работает на эвристике")
        _unavailable = True
        return None


def predict(features: list[float]) -> tuple[float, list[tuple[str, float]]]:
    """Возвращает вероятность 0..1 и список вкладов (имя признака, вклад в логит).

    Вклад = стандартизованное значение признака * коэффициент логистической регрессии.
    """
    from app.ml.features import FEATURES

    model = get_model()
    if model is None:
        raise RuntimeError("ML-модель недоступна")

    import numpy as np

    x = np.array(features, dtype=float).reshape(1, -1)
    proba = float(model.predict_proba(x)[0, 1])

    scaler = model.named_steps["scaler"]
    clf = model.named_steps["clf"]
    standardized = (x[0] - scaler.mean_) / scaler.scale_
    coefs = clf.coef_[0]
    contributions = [(FEATURES[i], float(standardized[i] * coefs[i])) for i in range(len(FEATURES))]
    return proba, contributions
