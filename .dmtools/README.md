# Jira SM-пайплайн (dmtools-agents, адаптировано под Claude Code)

Story- и Bug-пайплайны из https://github.com/IstiN/dmtools-agents, работают
поверх https://github.com/epam/dm.ai (DMTools CLI), в роли Teammate CLI-агента
— Claude Code вместо Cursor/Copilot.

**Статус: портировано из проекта resume (kejno/resume), где весь цикл
(Story + Bug) end-to-end был подтверждён рабочим на живых прогонах.
В bonapp пайплайн ещё не запускался — конфиг (`config.js`) указывает на
`kejno/bonapp` и Jira-проект `BNP`, но живой прогон здесь предстоит.**

**Целевая структура репозитория (см. `/CLAUDE.md` в корне для полного
стека):** монорепо `apps/api` (NestJS+Jest), `apps/guest-web` и
`apps/admin-web` (React+Vite+Vitest+Playwright), `packages/shared-types`.
Test-automation job-конфиги (`testFilesGlob`) и инструкции ниже уже
рассчитаны на эту структуру, а не на плоские `backend/`/`frontend/`,
упомянутые в историческом разделе «Что уже сделано» ниже (та запись
описывает раннее состояние скелета на момент первого intake-прогона).

Полный пайплайн: Epic в Backlog → **intake** (разбивка на Story) → вопросы →
BA Analysis → Acceptance Criteria → Solution Architecture →
Ready For Development → разработка (branch+PR) → In Review →
PR review/rework → merge → генерация тест-кейсов → **test automation**
(Claude пишет Playwright-тест) → **test PR review/rework** → merge →
проверка всех TC passed → Done. Если TC падает — **bug-хвост**: Failed TC →
`bulk_bugs_creation` создаёt Bug → `bug_development` чинит → PR review/merge
→ `bug_test_cases_generator`/`bug_test_automation` перепроверяют → Bug Done →
`bug_to_fix_check` возвращает заблокированную Story/TC на ре-тест.

Полную upstream-диаграмму см. в `dmtools-agents/README.md`; здесь подключены
`intake`, все `story_*`, все `bug_*`, `pr_review`, `pr_rework`, `retry_merge`,
`po_refinement`, `recover_merged_pr`, `unblock_resolved_dependencies`,
`test_cases_generator`, `story_test_automation*`, `bug_test_automation*`,
`pr_test_automation_*`, `pr_bug_test_automation_review`,
`bug_test_automation_rework`, `recover_stuck_test_case`,
`recover_dirty_review_test_case`, `retry_merge_test`, `bulk_bugs_creation`,
`bug_merged`, `bug_done_check`, `bug_to_fix_check` из `sm.json` (TestRail/Xray
правила выкинуты — здесь не нужны). Test-automation инструкции — прямой
Playwright (`tests/e2e/{TC_KEY}.spec.ts`).

## Как этим пользоваться (для овнера)

1. Завести Epic-тикет в Jira (проект `BNP`, статус `Backlog`) с сырым
   описанием фичи своими словами
2. SM-агент (крон каждые 20 мин) подхватит его, запустит `intake.json` —
   Claude Code разберёт идею, изучит существующие тикеты (чтоб не
   дублировать), создаст Epic+Story тикеты с описаниями, зависимостями
   между ними, оценкой сложности (Story Points)
3. Дальше каждая созданная Story идёт по обычному циклу — вопросы, BA,
   dev, PR review, merge — без твоего участия
4. Готовые PR смотришь и мержишь сам (пайплайн не автомерджит без review)

## Что уже сделано

- `.dmtools/agents/` — sm.json + конфиги job-ов (story-пайплайн, bug-пайплайн,
  intake), JS-actions, инструкции, промпты (скопировано и адаптировано из
  IstiN/dmtools-agents)
- `.dmtools/agents/bug_*.json` + `.dmtools/agents/js/{developBugAndCreatePR,
  notifyBugMerged,checkBugTestsPassed,checkBugToFixReady}.js` +
  `.dmtools/agents/js/common/aiChat.js` — весь bug-fix цикл: Failed TC →
  автосоздание Bug (`bulk_bugs_creation`) → Claude чинит и открывает PR
  (`bug_development`) → review/merge (переиспользует `pr_review`/
  `retry_merge`) → `bug_merged` → `bug_test_cases_generator`/
  `bug_test_automation` перепроверяют регрессию → `bug_done_check` → Done →
  `bug_to_fix_check` возвращает заблокированную Story/TC на ре-тест
- `.dmtools/agents/scripts/providers/claude.sh` — поддержаны два режима
  авторизации: `CLAUDE_CODE_OAUTH_TOKEN` (подписка Pro/Max, приоритетно) или
  `CLAUDE_CODE_API_KEY` (fallback), и `--permission-mode bypassPermissions`
  вместо нерабочего upstream `--allowedTools all`
- `.dmtools/agents/js/common/outputFiles.js` + `.dmtools/agents/js/common/
  pullRequest.js` — общая инфраструктура чтения output-файлов и создания PR,
  переживает три разных cwd в системе (см. «Известные баги upstream-кода»)
- `.dmtools/config.js` — конфиг проекта (owner/repo=kejno/bonapp, ключ
  Jira-проекта BNP, base branch), автоматически подхватывается
  `js/configLoader.js`
- `.github/workflows/sm.yml` — SM-агент, крон каждые 20 мин, сканит Jira через
  JQL, диспатчит `ai-teammate.yml` (перенести/включить в bonapp отдельно)
- `.dmtools/agents/scripts/providers/codex.sh` + `codex_usage.py` — провайдер
  OpenAI Codex (`codex exec`), два режима авторизации: `CODEX_AUTH_JSON`
  (подписка ChatGPT Plus/Pro, приоритетно) или `OPENAI_API_KEY` (fallback).
  См. «Переключение провайдера на Codex» ниже
- `.github/workflows/ai-teammate.yml` — выполняет один Teammate job
  (`dmtools run <config>`) с провайдером из переменной `AI_AGENT_PROVIDER`
  (`claude-code` по умолчанию, либо `codex`)

Режим запуска SM Agent управляется repo variable `SM_AGENT_TRIGGER_MODE`:
`after_all` запускает его после завершения всех активных/ожидающих AI Teammate
jobs, а отсутствие переменной (или любое другое значение) оставляет режим
`manual`. Ручной `workflow_dispatch` доступен в обоих режимах.

Acceptance Criteria с явным маркером `BLOCKER:` останавливают автоматическое
продвижение Story: тикет получает label `ai_content_blocker` и переводится в
`Blocked` вместо `Solution Architecture`/`Ready For Development`. Правило
авто-разблокировки зависимостей игнорирует такие тикеты, поскольку для них
нужен человеческий ввод, а не завершение связанного Jira-тикета. После
устранения причины перезапустите генерацию AC вручную: успешный прогон без
маркера удалит label и продолжит workflow.

## Настройка

| Что | Значение | Статус |
|---|---|---|
| Jira-проект | `BNP` ("BonApp" на `kejno.atlassian.net`) | ✅ создан |
| Секрет `JIRA_EMAIL` | email Jira-аккаунта | ✅ настроен |
| Секрет `JIRA_API_TOKEN` | API-токен Jira | ✅ настроен |
| Секрет `GH_PROJECT_TOKEN` | GitHub PAT, `repo`+`workflow` | ✅ настроен |
| Секрет `CLAUDE_CODE_OAUTH_TOKEN` | подписка Claude Code | ✅ настроен |
| Переменная `JIRA_BASE_PATH` | `https://kejno.atlassian.net` | ✅ настроена |
| `.github/workflows/{sm-agent,ai-teammate}.yml` | скопированы из resume, `runs-on` переключён на `ubuntu-latest` (в resume — `self-hosted`, отдельный runner не поднимали для bonapp) | ✅ |
| `package.json` / `npm ci` в `ai-teammate.yml` | npm workspaces (`backend/` NestJS + `frontend/` React) — скелет создан, `npm ci` теперь работает | ✅ |
| `services.postgres` в `ai-teammate.yml` | `backend/test/*.e2e-spec.ts` бутстрапит реальный Nest-модуль с живым TypeORM-подключением (не мок) — без сервиса каждый integration-тест падает/висит на недоступном `localhost:5432` | ✅ |

## Ручная настройка Jira-проекта (custom fields, экраны)

`config.js` ожидает статусы, лейблы и **custom-поля** по имени — если их нет
в проекте или они не подключены к экрану нужного типа тикета, запись
проваливается тихо: `outputType: "field"` не бросает ошибку в лог, которую
кто-то заметит, а `postJSAction` (например `closeQuestionTicket.js`) всё
равно закрывает тикет как обработанный. Так 43 из 48 сабтасков-вопросов в
BNP оказались закрыты в Done с пустым `Answer` — см. коммит с guard'ами
(`outputs/agent_failure.json`) для защиты от смерти CLI, но **эта** дыра
(поле есть в конфиге, но не в Jira) им не покрывается — агент отработал
успешно, просто писать было некуда.

**BNP — team-managed проект** (`style: next-gen`). Custom-поле там
подключается в два шага, оба только через UI (Jira REST такое не умеет):
1. Создать поле (см. `POST /rest/api/3/field` ниже, или Global settings →
   Custom fields → Create field, тип **Paragraph** для многострочных полей)
2. **Space settings → Fields → Add** — привязать поле к пространству BonApp
3. **Work types → <тип тикета> → Fields** — перетащить поле на форму
   нужного типа (Subtask / Story / Test Case)

Шаг 2 легко пропустить: поле существует и находится через `/rest/api/3/field`,
но `editmeta` конкретного тикета его не покажет, пока не сделаны шаги 2 и 3
— значит запись в него будет падать, а `outputType: "field"`/`jira_update_field`
это может не выбрасывать наверх как явную ошибку джоба.

Team-managed rich-text поля (Paragraph/textarea) хранят значение как
**Atlassian Document Format**, не как plain string — как и встроенный
Description. Ручной `PUT` с обычной строкой в такое поле вернёт `400
Operation value must be an Atlassian Document`; dmtools сериализует ADF сам,
это подтверждено рабочей записью в `Answer` на реальном прогоне.

### Что нужно на сегодня (BNP)

| Поле | Тип | Нужно на | Кто использует | Статус |
|---|---|---|---|---|
| `Answer` | Paragraph | Subtask | `po_refinement` (`outputType: field`) | ✅ создано, подключено |
| `Solution` | Paragraph | Story | `writeSolutionAndDiagrams.js` (`story_solution`) | ✅ уже было (customfield_10075) |
| `Diagrams` | Paragraph | Story | `writeSolutionAndDiagrams.js` (`story_solution`) | ✅ уже было (customfield_10076) |
| `Failed Reason` | Paragraph | Test Case | `postStoryTestAutomationResults.js`, `postBulkBugsCreation.js` | ✅ создано и подключено (customfield_10177), проверено через `createmeta` — Test Case тикетов в BNP пока нет, но экран уже принимает поле |

### Как создать поле (REST, если Space settings → Fields → Add — не ваш стиль)

```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" -X POST \
  -H "Content-Type: application/json" \
  "$JIRA_BASE_URL/rest/api/3/field" \
  -d '{
    "name": "Failed Reason",
    "description": "...",
    "type": "com.atlassian.jira.plugin.system.customfieldtypes:textarea",
    "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:textsearcher"
  }'
```

Возвращает `customfield_NNNNN`. REST создаёт поле, но **не** подключает его
к пространству/экрану — шаги 2 и 3 выше всё равно нужны руками. Проверка,
что поле действительно доступно для записи на конкретном тикете:

```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_BASE_URL/rest/api/3/issue/<KEY>/editmeta" \
  | jq '.fields | to_entries[] | select(.value.name=="Failed Reason")'
```

Пусто — поле не подключено к экрану этого типа тикета, идти делать шаги 2/3.

### Статусы и лейблы

Все статусы из `agents/js/config.js` (`STATUSES`) на сегодня присутствуют в
BNP workflow — сверено через `/rest/api/3/status`. Лейблы (`LABELS` там же)
Jira создаёт сама при первом использовании, руками заводить не нужно.

## Переключение провайдера на Codex

По умолчанию пайплайн работает на Claude Code. Переключение на OpenAI Codex —
через переменную репозитория `AI_AGENT_PROVIDER=codex` (Settings → Secrets and
variables → Actions → Variables). Локально — `AI_AGENT_PROVIDER=codex` в
`dmtools.env`.

### Почему Codex устроен сложнее Claude

`claude setup-token` выдаёт долгоживущий статичный токен — положил в секрет и
забыл. У Codex на подписке ChatGPT Plus/Pro такого нет: `codex login` пишет
`~/.codex/auth.json`, refresh-токен внутри **одноразовый** и ротируется при
каждом обновлении access-токена. Значит CI обязан после каждого прогона
записать обновлённый `auth.json` обратно в секрет (round-trip), иначе
следующий запуск умрёт на `refresh_token already used`.

Отсюда два следствия, которых нет у Claude:

1. **Codex-прогоны между собой строго сериализованы.** `ai-teammate.yml`
   кладёт любой запуск с `provider: codex` в одну общую concurrency-группу на
   весь репозиторий (`ai-teammate-agent-codex-auth`) вместо пер-тикетной: два
   параллельных Codex-job'а держали бы один `auth.json`, оба ротировали бы
   токен, и проигравший оставил бы мёртвую учётку. Это ограничение только на
   Codex-запуски *между собой* — Claude-запуски в это же время идут своей
   обычной пер-тикетной concurrency и Codex им не мешает (см. «Параллельный
   запуск Claude + Codex» ниже).
2. **Остаточный риск.** Шаг «Persist rotated Codex auth» стоит с
   `if: always()`, но job, убитый по cancel/timeout, не выполнит его вовсе —
   токен сгорит. Восстановление только руками: `codex login` локально →
   вставить новый `~/.codex/auth.json` в секрет `CODEX_AUTH_JSON`.

Если параллелизм важнее подписки — `OPENAI_API_KEY` вместо `CODEX_AUTH_JSON`:
ротации нет, пер-тикетная concurrency сохраняется, но оплата идёт по токенам
через платформенный аккаунт OpenAI, а не по подписке.

### Что настроить

| Что | Значение |
|---|---|
| Переменная `AI_AGENT_PROVIDER` | `codex` — провайдер по умолчанию для любого dispatch без явного `provider` (см. ниже) |
| Переменная `CODEX_MODEL` | опционально; если не задана, используется модель по умолчанию, выбранная Codex CLI для авторизованного аккаунта |
| Секрет `CODEX_AUTH_JSON` | содержимое `~/.codex/auth.json` после `codex login` |
| Секрет `CODEX_SECRETS_ADMIN_PAT` | fine-grained PAT, **только на `kejno/bonapp`**, право `Secrets: Read and write` — нужен чтобы записать ротированный токен обратно; `GITHUB_TOKEN` так не умеет, и никакой `permissions:`-скоуп этого не даёт |
| Секрет `OPENAI_API_KEY` | альтернатива `CODEX_AUTH_JSON` (без ротации) |

Безопасность: `CODEX_AUTH_JSON` — живые учётные данные вашей подписки
ChatGPT. Любой, кто может запустить workflow в репозитории, получает к ней
доступ. `CODEX_SECRETS_ADMIN_PAT` скоупить строго на один репозиторий.

### Параллельный запуск Claude + Codex

`AI_AGENT_PROVIDER` — провайдер **по умолчанию** для всего пайплайна, но
каждое правило в `sm.json` может переопределить его через `"provider"`:

```json
{
  "description": "Subtasks with 'q' label → trigger PO refinement",
  "jql": "...",
  "configFile": "agents/po_refinement.json",
  "provider": "codex",
  "...": "..."
}
```

`smAgent.js` прокидывает это значение в `workflow_dispatch` как `inputs.provider`;
`ai-teammate.yml` берёт провайдера по приоритету
`inputs.provider → vars.AI_AGENT_PROVIDER → 'claude-code'`. Правило без
`"provider"` продолжает наследовать репозиторную переменную — старые правила
менять не нужно.

Из этого следует практическая схема: держите `AI_AGENT_PROVIDER=claude-code`
(или вообще не задавайте — это дефолт), а на конкретные правила, которые
хотите гонять на подписке Codex, добавьте `"provider": "codex"`. Claude-прогоны
и Codex-прогоны для разных тикетов идут одновременно; несколько Codex-прогонов
между собой всё равно сериализуются через concurrency-группу в
`ai-teammate.yml` (см. выше — не настраивается, это следствие single-use
refresh-токена), так что Codex — это не второй параллельный поток throughput,
а способ забрать часть очереди на другую подписку, пока Claude обрабатывает
остальное.

Ещё один способ распределить провайдера — не через `rule.provider` на
отдельных правилах, а списком, применяемым сразу ко всем правилам без
явного `"provider"`. **Это НЕ делается через переменную репозитория**
`AI_AGENT_PROVIDER` — `sm-agent.yml` выполняется внутри dmtools' `JSRunner`
(GraalVM JS), где нет `java`-глобала для чтения OS-переменных
(`java.lang.System.getenv` там бросает `ReferenceError`, а не возвращает
значение — та же категория проблемы, что раньше была с `process.env`).
Значение задаётся прямо в `sm.json`:

```json
"jobParams": {
  "aiAgentProvider": "claude-code,codex",
  "...": "..."
}
```

`smAgent.js` читает `jobParams.aiAgentProvider` один раз в начале прохода и
сам распределяет тикеты между перечисленными провайдерами **в пределах
одного прохода** (см. «Бюджет на провайдера» ниже), передавая выбор для
каждого тикета в `workflow_dispatch` как свой конкретный `inputs.provider`
— так `ai-teammate.yml` всегда получает один конкретный провайдер, даже
когда `run-agent.sh` сам не умеет несколько в одном job'е (взаимоисключающие
ветки CLI).

В GitHub Actions `sm-agent.yml` передаёт repo variable `AI_AGENT_PROVIDER` в
`jobParams.aiAgentProvider` через JSON override команды `dmtools run`, поэтому
repo variable является единым источником выбора провайдера. Значение в
`sm.json` остаётся локальным значением по умолчанию. Если repo variable равна
`claude-code` или `codex`, SM выбирает только этот провайдер; список
`claude-code,codex` включает fair-share распределение между обоими.

#### Бюджет на провайдера (`maxTriggeredWorkflows`)

`maxTriggeredWorkflows` в `sm.json` принимает два формата:

```json
"maxTriggeredWorkflows": 2
```
— как раньше: один общий потолок **активных** GitHub Actions job'ов сразу,
без разделения по провайдеру (все провайдеры делят один и тот же пул слотов).

```json
"maxTriggeredWorkflows": { "claude-code": 2, "codex": 1 }
```
— отдельный потолок на каждый провайдер. Когда правило без явного
`"provider"` находит несколько подходящих тикетов подряд (в рамках лимита
`limit` правила и общего `Workflow cap per run`), `smAgent.js` распределяет
их между провайдерами **по свободной доле бюджета**
(`remaining / initial`), а не отдаёт всё первому из списка. Для конфига выше
и 3 тикетов в одном проходе: 1-й → `claude-code` (обе доли 100%, первый по
списку выигрывает при равенстве), 2-й → `codex` (у него ещё 100% против
оставшихся 50% у claude-code), 3-й → снова `claude-code` (0% vs 0% у codex,
но claude-code ещё не исчерпан). В итоге оба провайдера выбираются до своего
предела в одном и том же проходе SM, а не по очереди «сначала весь Claude,
потом Codex» — этим fair-share-выбор отличается от простого «первый в списке
со свободным местом», который отправил бы Codex в дело только когда у
Claude закончится собственный бюджет.

Провайдер, не упомянутый в объектной форме, не блокируется вовсе — он
считается неограниченным и в fair-share-сравнении всегда выигрывает у любого
провайдера с заданным лимитом (даже если у того ещё есть свободные слоты) —
задавайте лимит явно для каждого провайдера из списка `AI_AGENT_PROVIDER`,
если это не то поведение, которое вам нужно.

Провайдер, не упомянутый в объектной форме (например, ваш `AI_AGENT_PROVIDER`
список включает третьего провайдера, для которого в `maxTriggeredWorkflows`
нет ключа), не блокируется вовсе — трактуется как неограниченный, а не как
«0 слотов». Это касается и `"codex": 0` буквально — ноль отбрасывается как
невалидный лимит (`normalizePositiveInt`) и провайдер снова становится
неограниченным, а не заблокированным. Чтобы реально запретить провайдер,
уберите его из списка `AI_AGENT_PROVIDER`/из `rule.provider`, а не ставьте
ему `0`.

`codex` в объектной форме имеет смысл ставить не выше `1` — сама
concurrency-группа в `ai-teammate.yml` всё равно сериализует его до одного
активного job'а, так что более высокое число просто оставит лишние
Codex-dispatches ждать в очереди GitHub вместо реального параллелизма.

Тесты чистой budget-логики (aliasing общего пула, независимость
per-provider бакетов, выбор провайдера с оставшимся бюджетом) —
`agents/js/tests/test_smAgent_budget.js`, `node agents/js/tests/test_smAgent_budget.js`.

## Крон / триггеры

`sm-agent.yml` имеет только `workflow_dispatch`. При
`SM_AGENT_TRIGGER_MODE=after_all` финальный coordinator-job внутри
`ai-teammate.yml` ждёт завершения остальных AI Teammate runs и диспатчит SM
ровно один раз. Более старые coordinator-jobs уступают самому новому run ID;
поэтому в Actions не создаются отдельные skipped SM runs. При значении
`manual` (включая отсутствующую переменную) coordinator-job пропускается и SM
запускается только вручную. Первый цикл в любом случае нужно запустить руками
(`gh workflow run sm-agent.yml` или Actions → Run workflow), потому что до
первого SM dispatch нет AI Teammate run, который мог бы продолжить цепочку.
Оба workflow используют `runs-on: ubuntu-latest` (GitHub-hosted), не
self-hosted, как в resume.

## Известные баги upstream-кода (найдены и исправлены при отладке в resume)

Все три — в `.dmtools/agents/js/common/pullRequest.js` и
`.dmtools/agents/scripts/providers/claude.sh`. Код общий с bonapp (скопирован
как есть), поэтому актуальны и здесь:

1. **`claude --allowedTools all`** — не валидный синтаксис CLI (`--allowedTools`
   ждёт конкретный список тулов, не литерал `all`). Каждый `Write`/`Edit`
   зависал на permission-промпте в headless-режиме → Claude Code коммитил
   только служебные логи, реальный файл не создавался. Исправлено на
   `--permission-mode bypassPermissions`.
2. **`gh pr create --body-file`** резолвил путь неверно. Причина:
   `file_write()`/`file_read()` (MCP file tools) резолвят относительные
   пути от cwd JSRunner-процесса (`.dmtools/` в этом репо — там, где
   `dmtools run` запускается), а `cli_execute_command` (через который идёт
   `gh`, `git`, `find`) резолвит от repo root, на уровень выше. Один и тот
   же относительный путь (`outputs/response.md`) означал два разных файла
   для двух инструментов. Исправлено: `--body-file` получает путь,
   перепривязанный к repo-root (`.dmtools/outputs/response.md`), тогда как
   `file_read()` продолжает использовать путь относительно `.dmtools/`.
3. Побочный найденный факт: `CliCommandExecutor` (Java-сторона) отклоняет
   shell-метасимволы (`; \n \r `` $() ${} && || | > <`) даже **внутри**
   аргумента `bash -c "..."` — не только на верхнем уровне команды.
   Мешает передавать multi-line контент как inline `--body` аргумент;
   поэтому решение выше через файл, не через строку.
4. **Jira workflow: transition "Passed"/"Failed" может вести не туда.**
   Если в Jira-проекте переходы с именами `Passed`/`Failed` смаплены не на
   реальные финальные статусы, а сами на себя (no-op-петля) —
   `jira_move_to_status({statusName:'Passed'})` находит переход по имени,
   выполняет его без ошибки, но конечный статус тикета не меняется, и
   `story_done_check` стабильно видит TC как "still in review/automation".
   Диагностируется через `jira_get_transitions({key})` — смотреть `to.name`
   у перехода. Не код-баг, баг конфигурации воркфлоу — стоит проверить workflow
   нового проекта BNP до первого реального прогона (Project settings →
   Workflows → переходы `Passed`/`Failed`).
5. **`file_read()` не может прочитать НИЧЕГО вне `.dmtools/`** — не проблема
   пути, встроенный sandbox самого MCP tool. Из этого следовало два отдельных
   симптома, которые сначала выглядели как разные баги:
   - `outputs/story_test_automation_result.json is empty or missing`, хотя
     Claude Code (свой Write tool, cwd = repo-root) файл реально писал.
     Исправлено в `outputFiles.js`: абсолютные (repo-root) кандидаты теперь
     читаются через `cli_execute_command('cat <path>')`, а не `file_read()`.
     Требует `cat` в `CLI_ALLOWED_COMMANDS` job'а.
   - `gh pr create --body-file` падал с "no such file or directory" даже
     после фикса выше — `pullRequest.js`'s `.dmtools/`-префикс из бага 2 стал
     неверным предположением, как только тело PR стало читаться Claude'ом из
     repo-root, а не JSRunner'ом из `.dmtools/`. Исправлено: вместо угадывания
     префикса `createPullRequest()` теперь берёт точный путь, который вернул
     `outputFiles.readOutputFileDetailed()` (он уже знает, каким из двух
     способов реально прочитал файл).
6. **`CLI_ALLOWED_COMMANDS` в job JSON не аддитивен к дефолту** — задание
   своего списка (даже `["find","ls",...]`) *заменяет* встроенный дефолт
   dmtools (`gh, gcloud, npm, docker, ansible, git, dmtools, kubectl, az,
   terraform, yarn, aws`), а не добавляется к нему. Если своего списка нет
   вообще (job без своего `CLI_ALLOWED_COMMANDS`) — действует только дефолт, и
   команды типа `cat`/`echo`/`mkdir` там нет.
7. **`CLAUDE_CODE_MAX_TURNS=30` (глобальный дефолт в `ai-teammate.yml`) не
   хватает** для job'ов, где Claude Code сам ставит зависимости и гоняет
   тесты (`story_test_automation`, `bug_test_automation`,
   `bug_development`) — npm install + написание/прогон нескольких Playwright
   spec'ов с ретраями на упавших + чтение объёмного diff легко съедает 30
   ходов до того как дойдёт до git commit/push. Симптом обманчивый: агент
   реально находит баг и пишет result-файл, но не успевает закоммитить —
   постобработчик видит "CLI exited without producing result JSON", хотя файл
   технически был написан, просто позже отсечки. Исправлено per-job
   override'ом `CLAUDE_CODE_MAX_TURNS: "60"` в `envVariables` для всех
   test-automation/bug-fix job'ов.
8. **CLI-level failure (exit code от `run-agent.sh`) не всегда становится
   GitHub Actions job failure.** Наблюдалось на живом прогоне (2026-09-10,
   pr_review job на BNP-9): Claude Code упал на своей стороне (Anthropic
   account/session limit — `"error":"rate_limit"`, `api_error_status:429`,
   `"result":"You've hit your session limit · resets ..."`), `run-agent.sh`
   вернул exit code 1, но `dmtools run` внутри `ai-teammate.yml`'s "Run AI
   Teammate" step завершился успешно — job помечен `success`, хотя реально
   ничего не было сделано (`"result": "CLI command executed but did not
   produce output file"` осталось только в Jira-комментарии). Похоже, что для
   job'ов с `skipAIProcessing: true` / `outputType: "none"` dmtools-ядро
   трактует "CLI команда не произвела output" как soft-failure (пишет об этом
   в комментарий/result), а не как process-level exception, которая
   провалила бы сам `dmtools run` и, соответственно, весь Actions step. Это
   поведение closed-source Java-ядра dmtools, не наших bash/JS-обвязок —
   почему это происходит и можно ли настроить строгий режим не выяснено,
   `agents/README.md`/публичный API dmtools такого флага не документируют.
   Практическое следствие: **не полагайся на зелёный статус
   `ai-teammate.yml` run'а как доказательство, что job реально что-то
   сделал** — при подозрении на тихий сбой смотри Jira-комментарий job'а
   и/или скачанный `agent-cli-logs-*` artifact напрямую (ищи в
   `.dmtools-logs/cli/agent/claude-code-*.log`, финальный `"result"` в
   stream-json). Учитывая, что нет ни detectable-сигнала выше уровня
   разового текстового сообщения от Anthropic, ни гарантии что exit code
   вообще пробросится в job conclusion, попытка автоматически переключаться
   между несколькими Claude-аккаунтами на этом уровне признана слишком
   хрупкой для этого проекта и не реализована. Вместо этого
   `.github/workflows/ai-teammate.yml` содержит отдельный шаг **"Fail if
   Claude Code hit a rate/usage limit"** сразу после "Run AI Teammate" —
   он сам грепает свежесозданный CLI-транскрипт на тот же набор
   rate/usage-limit сигналов и явно проваливает Actions job (с понятным
   `::error::` сообщением, что делать), если находит совпадение — вместо
   того чтобы полагаться на dmtools' часто-ошибочный exit code.

Если апгрейдишь `dmtools` до новой версии — стоит перепроверить, не
исправлены ли баги 1-3, 5, 6, 9 в самом Java-ядре (тогда наши JS-патчи/конфиг-
обходы станут избыточны, но безвредны). Баг 4 — это состояние Jira-проекта,
апгрейд `dmtools` на него не повлияет. Баг 8 — детектится строкой в самом
`claude.sh`, апгрейд `dmtools` на него не влияет вовсе (это Claude Code CLI).

## Известные пробелы

- Механизм `SOURCE_GITHUB_TOKEN`/диспатча в `sm.yml` выведен из документации
  `dmtools-ai-docs` (github.md) — сам Java-код вызова `workflow_dispatch`
  внутри `dmtools-core` не смотрел (closed-source Java, не в agents-репо).
  Если SM не смог задиспатчить `ai-teammate.yml` — сначала смотреть лог рана.
- `inputJql` в каждом `agents/*.json` хранит заглушки-тикеты (`BNP-N`,
  перенесены как есть из resume/SCRUM-N) — `sm.json` переопределяет их на
  каждое правило при автоматическом диспатче; заглушки видны только при
  standalone-запуске без override (напр. диагностический `gh workflow run`
  на конкретный тикет). Эти конкретные `BNP-N` тикеты ещё не существуют —
  создать первый Epic перед первым standalone-прогоном.
- `intake.json` прогонялся вживую в bonapp: сначала упёрся в
  `CLAUDE_CODE_MAX_TURNS=30` (error_max_turns на 31 ходу) — Claude успел
  исследовать пустой backend/frontend скелет и написать 5 epic + 14 story
  markdown-файлов, но не успел записать финальный `outputs/stories.json`
  до отсечки, поэтому `createIntakeTickets.js` не создал ни одного тикета.
  Тот же баг 7 (см. выше), просто на новом job'е — добавлен
  `CLAUDE_CODE_MAX_TURNS: "60"` override в `intake.json`.
- `recover_failed_tc_bug_status.json` (upstream edge-case recovery job для
  зависших TC/Bug статусов) не портирован — не блокирует happy path, можно
  добавить позже если понадобится.
- **`ai-teammate.yml`'s `npm ci` шаг упадёт до первого Node-коммита** —
  bonapp пока docs-only (нет `package.json`); как только появится
  React/NestJS-скелет, шаг заработает сам, без правок workflow.
- **Первый цикл нужно запустить вручную** — автоматический coordinator
  находится в `ai-teammate.yml`, а AI Teammate до первого SM-dispatch ещё не
  запущен; без ручного `gh workflow run sm-agent.yml` (Actions → Run workflow)
  цепочка не стартует сама первый раз.
- **Ничего из пайплайна ещё не прогонялось на bonapp** — весь раздел «Известные
  баги upstream-кода» выше основан на опыте resume; стоит быть готовым, что
  в новом Jira-проекте/репо вылезет что-то ещё специфичное для BNP (см. баг 4
  про workflow-transitions — это состояние конкретного Jira-проекта, не
  переносится автоматически).
- ~~`customParams.testFilesGlob` — один путь на весь pipeline~~ — **исправлено**:
  `testFilesGlob` теперь принимает **массив** путей/pathspecs, not a single
  string. All four job configs (`story_test_automation`,
  `bug_test_automation`, `pr_test_automation_rework`,
  `story_test_automation_rework`/`bug_test_automation_rework`) list every
  test root the project could plausibly use: `apps/api/test/`,
  `apps/api/src/**/*.spec.ts`, and the `apps/guest-web`/`apps/admin-web`
  equivalents (unused until those tests exist — `git add` on a non-existent
  path/pathspec is a
  harmless no-op, not an error). `performGitOperations()`,
  `stageUnmergedPaths()`/`commitAndPush()` in `postTestReworkResults.js`,
  and `storyTestAutomationRework.js`'s own `commitAndPush()` all loop over
  the array and stage each root independently, so a change under any one of
  them is never silently dropped just because it wasn't the first path in
  the list. `getTestCaseDirectory()` (used only for the `irrelevant`-status
  deletion path) was also rewritten to build every plausible
  `{root}/{TCKEY}.e2e-spec.ts` / `.spec.ts` / `.test.ts(x)` combination
  across all configured roots, replacing the old single hardcoded
  `<root>/tests/<TCKEY>/` framework-agnostic layout that never matched this
  project's flat, ticket-key-named files anyway.
