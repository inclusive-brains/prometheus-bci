# Prometheus BCI - Makefile
# Requires: uv (https://docs.astral.sh/uv/)

VENV = .venv
VENV_PY = $(VENV)/bin/python
PYTHON_VERSION = 3.10
APP_CONFIG = app.yaml
PORT = 8002

# Detect uv once; empty if not on PATH.
UV := $(shell command -v uv 2>/dev/null)

.PHONY: help install setup run clean update logs config check-uv \
       docker-build docker-run docker-run-hw docker-stop docker-test docker-logs

help: ## Afficher l'aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

check-uv: ## Vérifier que uv est installé
ifeq ($(UV),)
	@echo "ERROR: 'uv' was not found on your PATH."
	@echo ""
	@echo "Prometheus BCI uses uv to manage Python $(PYTHON_VERSION) and dependencies."
	@echo "Please install uv, then re-run 'make setup':"
	@echo ""
	@echo "  macOS / Linux:"
	@echo "    curl -LsSf https://astral.sh/uv/install.sh | sh"
	@echo ""
	@echo "  macOS (Homebrew):"
	@echo "    brew install uv"
	@echo ""
	@echo "  With pipx:"
	@echo "    pipx install uv"
	@echo ""
	@echo "Then reopen your terminal (or 'source \$$HOME/.local/bin/env')."
	@echo ""
	@echo "Full instructions: https://docs.astral.sh/uv/getting-started/installation/"
	@exit 1
else
	@echo "uv found: $(UV)"
endif

setup: check-uv ## Créer l'environnement virtuel uv et installer les dépendances
	uv venv --python $(PYTHON_VERSION) $(VENV)
	$(MAKE) install

install: check-uv ## Installer les dépendances Python
	uv pip install --python $(VENV_PY) -r requirements.txt

update: check-uv ## Mettre à jour les dépendances
	uv pip install --python $(VENV_PY) -U -r requirements.txt

sync-ui: ## Synchroniser les assets UI partagés vers chaque route
	@for dir in ui/data_monitoring ui/real_time_detections/brain_metrics ui/real_time_detections/heart_metrics ui/real_time_detections/head_motions ui/real_time_detections/facial_expressions ui/real_time_detections/eeg_quality ui/real_time_detections/multimodal ui/real_time_detections/neurofeedback_art ui/mind_control/motor ui/mind_control/obi1 ui/mind_control/prometheus ui/mind_control/prometheus_2 ui/experiments/nback ui/experiments/stroop ui/robotic_arm; do \
		cp ui/common/assets/css/prometheus.css "$$dir/assets/css/shared.css"; \
		cp ui/common/assets/js/nav-sidebar.js "$$dir/assets/js/nav-sidebar.js"; \
	done
	@echo "UI assets synchronized."

config: ## Ouvrir l'interface de configuration .env
	@python3 scripts/setup_ui.py

run: check-uv config ## Configurer puis lancer l'application Timeflux
	@mkdir -p logs data
	@echo "  Launching Timeflux in 3s..."
	@sleep 3
	uv run --python $(VENV_PY) timeflux -d $(APP_CONFIG)

clean: ## Supprimer l'environnement virtuel
	rm -rf $(VENV)

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
