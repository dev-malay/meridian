.PHONY: up down dev

up:
	docker compose up --build
down:
	docker compose down
dev:
	npx tsx src/index.ts
mock-provider:
	npx tsx src/mock-provider.ts
