PYTHON ?= .venv/bin/python
PIP ?= .venv/bin/pip

.PHONY: install python-install demo-install demo-dev demo-dev-local demo-dev-http demo-lint demo-test demo-build mock-api-dev mock-api-test \
	ontology-validate shapes-validate mappings-validate contracts-validate competency-test \
	alignment-audit ontology-artifacts ontology-artifacts-check validate test build release clean

install: demo-install python-install

python-install:
	python3 -m venv .venv
	$(PIP) install -e .

demo-install:
	npm install

demo-dev:
	npm run dev

demo-dev-local:
	npm run dev:local

demo-dev-http:
	npm run dev:http

demo-lint:
	npm run lint

demo-test:
	npm run typecheck
	npm run test

demo-build:
	npm run build

mock-api-dev:
	npm run api:dev

mock-api-test:
	npm run api:test

ontology-validate:
	$(PYTHON) scripts/validate_ontology.py

shapes-validate:
	$(PYTHON) scripts/validate_shapes.py

mappings-validate:
	$(PYTHON) scripts/validate_mappings.py

alignment-audit:
	$(PYTHON) scripts/generate_explorer_alignment_audit.py

ontology-artifacts:
	$(PYTHON) scripts/build_ontology_artifacts.py

ontology-artifacts-check:
	$(PYTHON) scripts/build_ontology_artifacts.py --check

contracts-validate:
	$(PYTHON) scripts/validate_demo_contracts.py
	$(PYTHON) scripts/generate_explorer_alignment_audit.py --check

competency-test:
	$(PYTHON) scripts/run_competency_queries.py

validate: ontology-validate shapes-validate mappings-validate contracts-validate competency-test ontology-artifacts-check

test: demo-lint demo-test competency-test

release:
	$(PYTHON) scripts/build_release.py

build: validate test demo-build release

clean:
	rm -rf dist coverage playwright-report test-results .cache
