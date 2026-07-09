# Root wrapper around ./pipeline.sh (production) so `make <target>` works too.
# The dev workflow lives in prototype/ (see prototype/dev.sh or prototype/Makefile).
# Run ./pipeline.sh --help for the authoritative production command list.

.DEFAULT_GOAL := help
.PHONY: help doctor update-production diff build-production deploy release \
        migrate status logs verify config down

help:                ## Show the production pipeline help
	@./pipeline.sh help

doctor:              ## Check prerequisites, production/, and .env.production
	@./pipeline.sh doctor

update-production:   ## Promote prototype/ -> production/ (test-gated)
	@./pipeline.sh update-production

diff:                ## Show what update-production would change
	@./pipeline.sh diff

build-production:    ## Build tagged production images
	@./pipeline.sh build-production

deploy:              ## Build (if needed) + start the prod stack + verify
	@./pipeline.sh deploy

release:             ## update-production -> build-production -> deploy
	@./pipeline.sh release

migrate:             ## Run alembic upgrade head in the backend container
	@./pipeline.sh migrate

status:              ## docker compose ps for the prod stack
	@./pipeline.sh status

logs:                ## Follow prod stack logs
	@./pipeline.sh logs

verify:              ## Health-check the running stack
	@./pipeline.sh verify

config:              ## Validate the compose + env
	@./pipeline.sh config

down:                ## Stop the stack (keeps data volumes)
	@./pipeline.sh down
