set shell := ["bash", "-euo", "pipefail", "-c"]

default:
	@just --list

lint:
	npm run lint
	npm run typecheck

check:
	just lint
	just test all

coverage:
	npm run test:coverage

test mode="all":
	case "{{mode}}" in \
	  all) npm run test ;; \
	  watch) npm run test:watch ;; \
	  e2e) npm run test:e2e ;; \
	  full) npm run test && npm run test:e2e ;; \
	  *) echo "Unknown test mode: {{mode}} (expected: all|watch|e2e|full)" >&2; exit 2 ;; \
	esac

build:
	npm run build

hooks action="run":
	case "{{action}}" in \
	  install) npx --no-install prek install && npx --no-install prek install-hooks && npx --no-install prek install -t pre-push ;; \
	  run) npx --no-install prek run --all-files ;; \
	  prepush) npx --no-install prek run --all-files --stage pre-push ;; \
	  *) echo "Unknown hooks action: {{action}} (expected: install|run|prepush)" >&2; exit 2 ;; \
	esac

bootstrap-check:
	./scripts/dev/bootstrap_check.sh

deps-check:
	./scripts/verify/deps_check.sh

dev-install:
	./scripts/dev/install.sh

fmt:
	npm run check

changelog action="preview":
	case "{{action}}" in \
	  preview) node scripts/release/changelog_sync.mjs --dry-run ;; \
	  sync) node scripts/release/changelog_sync.mjs ;; \
	  *) echo "Unknown changelog action: {{action}} (expected: preview|sync)" >&2; exit 2 ;; \
	esac

release kind="patch":
	case "{{kind}}" in \
	  patch) npm run release:patch ;; \
	  minor) npm run release:minor ;; \
	  *) echo "Unknown release kind: {{kind}} (expected: patch|minor)" >&2; exit 2 ;; \
	esac
