# Аким на 5 часов

Командный хакатон-проект Datalicious: AI-симулятор распределения городского
бюджета и оценки Astana Quality of Life Score на синтетических данных.

**Состояние: доменное ядро готово, приложение пока каркас.** Есть исходный
датасет, валидатор сценариев, детерминированный расчёт Score, общие контракты,
стартовая страница и серверная фабрика OpenAI SDK. Интерфейс выбора решений,
графики и AI-анализ предстоит реализовать.
`POST /api/analyze` сейчас возвращает HTTP 501 `NOT_IMPLEMENTED`.

## Запуск

Node.js ≥22.12 (рекомендуется Node.js 24) и npm.

```sh
npm ci
npm run dev
```

Открыть http://localhost:3000. Секреты для каркаса не нужны.
В Windows PowerShell с запретом `.ps1` используйте `npm.cmd` и `npx.cmd`.

Для будущей интеграции скопируйте `.env.example` в `.env.local`, заполните
`OPENAI_API_KEY` и доступную вашему проекту `OPENAI_MODEL`. Не коммитьте ключ.
Ключ используется только на сервере, реальных AI-запросов в каркасе нет.

## Проверки

```sh
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:smoke
```

`typecheck` сначала генерирует типы Next.js и работает на чистом клоне.
Smoke запускает production-сервер на 127.0.0.1:3100; build обязателен заранее.
Единственный smoke проверяет страницу и заглушку API, без API-ключа.
Production-запуск после сборки: `npm start`.

## Документация и команда

- [Кейс и критерии оценки](docs/CASE.md).
- [Датасет, каталог и формула](docs/DATASET.md).
- [Архитектура и HTTP-контракт](docs/ARCHITECTURE.md).
- [План трёх участников и создание веток](docs/PLAN.md).
- [Правила разработки](AGENTS.md).
- [Общие интерфейсы](src/domain/types.ts).

Стек: Next.js App Router, TypeScript, Tailwind CSS, Recharts, Zod,
Vitest + React Testing Library, Playwright, серверный OpenAI SDK.
Версии зафиксированы в `package-lock.json`.
Конфигурация Next.js следует [официальной инструкции](https://nextjs.org/docs/app/getting-started/installation),
серверный SDK — [OpenAI quickstart](https://developers.openai.com/api/docs/quickstart).

Контрольный сценарий: M7, M8, M10 в Нуре; M12 по городу; M5 в Сарыарке.
Стоимость 95; ожидаемый Score 56.54307 против базы 52.55768.
Эти значения проверяются тестами доменного движка.
