# Архитектура и контракты

## Стек и состояние

Next.js App Router, TypeScript strict, Tailwind CSS, Recharts, Zod,
Vitest + React Testing Library, Playwright, официальный OpenAI SDK.
Сейчас есть инфраструктура, данные, контракты и стартовая страница.
Движок, рабочая форма и AI-анализ ещё не реализованы. Recharts установлен
для будущих графиков; `POST /api/analyze` возвращает 501.

## Границы

| Модуль | Ответственность | Зависимости | Владелец |
| --- | --- | --- | --- |
| `src/data` | Исходные данные, параметры модели, каталог | Только типы домена | 1 |
| `src/domain` | Zod-валидация, бизнес-правила, детерминированный Score | Данные, Zod, чистый TypeScript | 1 |
| `src/components` | Выбор решений, бюджет, ошибки, результаты, Recharts | Типы, данные, публичный домен, React | 2 |
| `src/app/page.tsx`, layout, CSS | Сборка интерфейса | Компоненты | 2 |
| `src/server` | Серверный AI-адаптер и проверка ответа | Типы, Zod, OpenAI, server-only | 3 |
| `src/app/api/analyze` | HTTP, проверка запроса, повторный расчёт, вызов AI | Домен и серверный адаптер | 3 |

Runtime-зависимость `domain → data` допустима: обратный импорт `data → domain/types`
содержит только типы и исчезает при сборке. UI не импортирует `src/server`.
Каждый исполняемый серверный модуль защищён `import "server-only"`.
ESLint запрещает импорт SDK вне `src/server`; Next.js проверяет server-only границу.

## Общие типы

Источник контрактов — `src/domain/types.ts`: ID районов/показателей/мер,
`Dataset`, `Scenario`, `Decision`, `ValidationResult`, `SimulationEngine`,
`SimulationResult`, `AnalysisService`, `AnalyzeRequest`, `AnalyzeResponse`.
Файл без runtime-кода и сторонних импортов. Изменения контрактов участники
согласуют до изменения потребителей.

`Decision` различает городской и районный ID: `districtId` запрещён для города.
TypeScript не проверяет JSON по сети: участник 1 реализует Zod-схемы,
проверку неизвестных ID, лишних полей и бизнес-ограничений.

`SimulationEngine.validate(unknown)` возвращает нормализованный сценарий и бюджет
или ошибки. `evaluate(unknown)` возвращает результат только при валидном сценарии.
`baseline()` отдельно рассчитывает базу; пустой пользовательский набор невалиден.
Ошибки содержат стабильный код, сообщение и при необходимости индексы решений с нуля.

`SimulationResult` содержит baseline/after, бюджет, дельту Score, дельты районов,
версию датасета и эффекты мер/синергий. `contributions` — реализованные эффекты
показателей до clip. Это не аддитивные вклады в итоговый Score: min, clip
и критические штрафы нелинейны. Дельты районов уже учитывают clip.

## Поток после реализации

1. UI формирует сценарий и получает проверку/предпросмотр через домен.
2. UI отправляет только решения в `POST /api/analyze`.
3. API проверяет JSON и заново оценивает решения на серверном датасете.
4. `AnalysisService.analyze(SimulationResult)` передаёт готовые факты LLM.
5. AI-ответ проходит Zod-проверку и возвращается вместе с серверным результатом.

Клиентские стоимость, эффекты, Score и произвольный промпт не являются доверенными входами.
Расчёт работает независимо от AI. Неудачный AI-запрос не должен стирать уже
доступный локальный детерминированный результат.

## HTTP-контракт

Пример запроса:

```json
{
  "scenario": {
    "decisions": [
      { "measureId": "M7", "districtId": "nura" },
      { "measureId": "M8", "districtId": "nura" },
      { "measureId": "M10", "districtId": "nura" },
      { "measureId": "M12" },
      { "measureId": "M5", "districtId": "saryarka" }
    ]
  }
}
```

| Статус | Контракт |
| --- | --- |
| 200 | `{ ok: true, result: SimulationResult, analysis: AiAnalysis }` |
| 400 | `{ ok: false, error: { code: "INVALID_REQUEST", message } }` — JSON/форма |
| 422 | `INVALID_SCENARIO` с `issues` — бизнес-правила |
| 503 | `AI_NOT_CONFIGURED` — нет ключа или модели |
| 502 | `AI_UNAVAILABLE` — тайм-аут, ошибка провайдера, невалидный AI-ответ |
| 500 | `INTERNAL_ERROR` — безопасное сообщение без внутренних деталей |
| 501 | `NOT_IMPLEMENTED` — текущее состояние каркаса |

Пока POST всегда возвращает 501, остальные статусы — будущий контракт.
`AiAnalysis`: summary, strengths, risks, consequences, recommendations.
У AI нет поля для вычисленного Score: числа на экране берутся из `SimulationResult`.

## Серверная конфигурация

`OPENAI_API_KEY` и `OPENAI_MODEL` без префикса `NEXT_PUBLIC_`.
Фабрика создаёт SDK лениво после проверки Zod; сборка не требует секрета
и не делает API-запросов. Участник 3 реализует Responses API; тесты используют mock.
Модель задаётся через окружение. Основание:
[официальный OpenAI quickstart](https://developers.openai.com/api/docs/quickstart).

## Проверки

Vitest проверяет целостность данных, страницу через RTL и текущий HTTP-контракт.
Один Playwright smoke запускается на production-сборке: страница, отсутствие
pageerror, API 501. После интеграции заменить его на выбор пяти мер и анализ
с mock AI, сохраняя один smoke-тест. Доменные и AI-тесты описаны в PLAN;
сам движок ещё не реализован.
