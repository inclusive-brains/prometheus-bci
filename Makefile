# Prometheus BCI - Makefile
# Requires: conda (Miniconda or Anaconda)

ENV_NAME = timeflux
PYTHON_VERSION = 3.10
APP_CONFIG = app.yaml
PORT = 8002

.PHONY: help install setup run clean update logs

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

run: ## Lancer l'application Timeflux
	@mkdir -p logs data
	conda run -n $(ENV_NAME) timeflux -d $(APP_CONFIG)

clean: ## Supprimer l'environnement conda
	conda env remove -y --name $(ENV_NAME)

logs: ## Afficher le dernier fichier de log
	@ls -t logs/*.log 2>/dev/null | head -1 | xargs cat 2>/dev/null || echo "Aucun log trouvé"
