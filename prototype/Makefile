# Thin wrapper around ./dev.sh so `make <target>` also works.
# See ./dev.sh --help for the full, authoritative command list.

.DEFAULT_GOAL := help
.PHONY: help setup up dev backend frontend stop status test test-fe test-all reset clean doctor

help:        ## Show the dev CLI help
	@./dev.sh help

setup:       ## Install backend (venv) + frontend dependencies
	@./dev.sh setup

up dev:      ## Run backend + frontend together (Ctrl-C stops both)
	@./dev.sh up

backend:     ## Run only the FastAPI backend
	@./dev.sh backend

frontend:    ## Run only the Vite frontend
	@./dev.sh frontend

stop:        ## Stop services on the dev ports
	@./dev.sh stop

status:      ## Show what's running on the dev ports
	@./dev.sh status

doctor:      ## Check prerequisites and dependency status
	@./dev.sh doctor

test:        ## Run backend tests
	@./dev.sh test backend

test-fe:     ## Run frontend lint + build
	@./dev.sh test frontend

test-all:    ## Run backend tests + frontend lint/build
	@./dev.sh test all

reset:       ## Delete the dev SQLite DB (re-seeds next start)
	@./dev.sh reset-db

clean:       ## Remove venv, node_modules, and dev DB
	@./dev.sh clean
