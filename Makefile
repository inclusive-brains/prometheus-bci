# Prometheus BCI - Makefile
# Requires: conda (Miniconda or Anaconda)

ENV_NAME = timeflux
PYTHON_VERSION = 3.10
APP_CONFIG = app.yaml
PORT = 8002

.PHONY: help install setup run clean update logs config \
       docker-build docker-run docker-run-hw docker-stop docker-test docker-logs

help: ## Afficher l'aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: ## Créer l'environnement conda et installer les dépendances
	conda create -y --name $(ENV_NAME) python=$(PYTHON_VERSION) pytables
	$(MAKE) install

install: ## Installer les dépendances Python
	conda run -n $(ENV_NAME) pip install -r requirements.txt

update: ## Mettre à jour les dépendances
	conda run -n $(ENV_NAME) pip install -U -r requirements.txt

sync-ui: ## Synchroniser les assets UI partagés vers chaque route
	@for dir in ui/data_monitoring ui/real_time_detections/brain_metrics ui/real_time_detections/heart_metrics ui/real_time_detections/head_motions ui/real_time_detections/facial_expressions ui/real_time_detections/eeg_quality ui/real_time_detections/multimodal ui/real_time_detections/neurofeedback_art ui/mind_control/motor ui/mind_control/obi1 ui/mind_control/prometheus ui/mind_control/prometheus_2 ui/experiments/nback ui/experiments/stroop ui/robotic_arm; do \
		cp ui/common/assets/css/prometheus.css "$$dir/assets/css/shared.css"; \
		cp ui/common/assets/js/nav-sidebar.js "$$dir/assets/js/nav-sidebar.js"; \
	done
	@echo "UI assets synchronized."

config: ## Ouvrir l'interface de configuration .env
	@python3 scripts/setup_ui.py

run: config ## Configurer puis lancer l'application Timeflux
	@mkdir -p logs data
	@echo "  Launching Timeflux in 3s..."
	@sleep 3
	conda run -n $(ENV_NAME) timeflux -d $(APP_CONFIG)

clean: ## Supprimer l'environnement conda
	conda env remove -y --name $(ENV_NAME)

logs: ## Afficher le dernier fichier de log
	@ls -t logs/*.log 2>/dev/null | head -1 | xargs cat 2>/dev/null || echo "Aucun log trouvé"

# ── Docker (config in deploy/) ──────────────────────────────────────────────

COMPOSE = docker compose -f deploy/docker-compose.yml

docker-build: ## Construire l'image Docker
	$(COMPOSE) build prometheus

docker-run: ## Lancer en mode simulation (dummy EEG, fake PPG)
	@mkdir -p data logs models
	$(COMPOSE) up -d prometheus

docker-run-hw: ## Lancer avec accès au matériel (EEG USB/BT, caméra, BITalino)
	@mkdir -p data logs models
	$(COMPOSE) --profile hardware up -d prometheus-hw

docker-stop: ## Arrêter le conteneur
	$(COMPOSE) --profile hardware down

docker-test: ## Lancer les tests dans Docker
	$(COMPOSE) build tests
	$(COMPOSE) run --rm tests

docker-logs: ## Afficher les logs du conteneur
	$(COMPOSE) logs -f prometheus
