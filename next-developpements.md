# Next Features & Improvements

## Refactoring

### Factoriser les calculateurs PPG (`nodes/physio/ppg.py`)

`StressCalculator`, `CognitiveLoadCalculator`, `AwakenessCalculator` et `AttentionCalculator` sont quasi-identiques — seuls `min_rate`, `max_rate` et le nom de la colonne de sortie changent. Idem pour les métriques HRV (`ArousalMetric`, `AttentionMetric`, `CognitiveLoadMetric`, `StressMetric`) qui partagent la même logique de normalisation min-max pondérée. Une classe de base paramétrable éliminerait cette duplication.

### Unifier `bandpower()`

La fonction `bandpower()` existe en double dans `nodes/eeg/metrics.py` et `nodes/eeg/ratio.py`. Un test de non-régression vérifie leur identité, mais un seul module utilitaire partagé supprimerait le risque de divergence.

### Réduire `app.yaml` avec des boucles Jinja2

La section des gates (~300 lignes) répète le même bloc pour chaque data type. Un pattern `{% for topic in topics %}` réduirait drastiquement la taille du fichier et les risques d'oubli lors de l'ajout d'un nouveau flux.

## Tests

### Élargir la couverture de tests

Les modules `nodes/vision/`, `nodes/output/` et les estimateurs personnalisés ne sont pas testés unitairement. Ajouter au minimum des tests pour `camera.py`, `multimodal_metric.py` et `osc.py`.

### Ajouter des tests d'intégration pipeline

Les tests actuels couvrent les unités individuelles. Un test d'intégration qui instancie un mini-graphe (source dummy → filtre → métrique) validerait le câblage ZMQ et le passage de données entre nodes.

## UI

### Centraliser les dépendances JS/CSS tierces

Bootstrap, FontAwesome, Smoothie, Chart.js sont copiés manuellement dans chaque dossier UI. Seuls `shared.css` et `nav-sidebar.js` sont synchronisés par `make sync-ui`. Étendre le mécanisme de sync aux libs tierces ou les versionner dans `ui/common/` pour éviter les divergences entre routes.

## Qualité du code

### Ajouter les type hints Python

Aucun module Python n'a de type hints. Ajouter les annotations de types sur toutes les méthodes publiques des `nodes/`, `estimators/` et `scripts/` pour faciliter la relecture, le refactoring et l'analyse statique (mypy).

### Créer un `pyproject.toml` avec dépendances pinées

Les dépendances dans `requirements.txt` utilisent `>=` (sauf OpenCV). Migrer vers un `pyproject.toml` avec des versions pinées exactes et un lock file (`pip-compile` ou `poetry.lock`) pour garantir la reproductibilité entre machines.

### Configurer un linter/formatter (ruff + pre-commit)

Aucun linter ni formatter n'est configuré. Ajouter un `ruff.toml` minimal et un `.pre-commit-config.yaml` avec ruff (lint + format) pour maintenir un style cohérent et attraper les erreurs courantes (shadowing de builtins, imports inutilisés, etc.).

## Documentation

### Documenter les heuristiques PPG

Les métriques basées sur la fréquence respiratoire (stress, charge cognitive, attention, éveil) utilisent des seuils hardcodés et une relation linéaire. Documenter ces choix comme des approximations de recherche, avec les références qui les justifient et leurs limites connues.

### Créer un CONTRIBUTING.md

Le README invite à contribuer mais ne détaille pas la marche à suivre. Un `CONTRIBUTING.md` devrait couvrir : setup de l'environnement de dev, conventions de code, comment ajouter un nouveau classifieur ou un nouveau device, et le workflow de PR/review.
