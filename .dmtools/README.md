# Jira SM-пайплайн (dmtools-agents, адаптировано под Claude Code)

Story- и Bug-пайплайны из https://github.com/IstiN/dmtools-agents, работают
поверх https://github.com/epam/dm.ai (DMTools CLI), в роли Teammate CLI-агента
— Claude Code вместо Cursor/Copilot.

**Статус: портировано из проекта resume (kejno/resume), где весь цикл
(Story + Bug) end-to-end был подтверждён рабочим на живых прогонах.
В bonapp пайплайн ещё не запускался — конфиг (`config.js`) указывает на
`kejno/bonapp` и Jira-проект `BNP`, но живой прогон здесь предстоит.**

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
- `.github/workflows/ai-teammate.yml` — выполняет один Teammate job
  (`dmtools run <config>`) с `AI_AGENT_PROVIDER=claude-code`

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

## Крон / триггеры

`sm-agent.yml` не на фиксированном расписании — триггерится `workflow_run`
сразу после завершения `ai-teammate.yml` (событийно, без опроса), плюс
`workflow_dispatch` для ручных прогонов. Значит первый цикл нужно запустить
руками (`gh workflow run sm-agent.yml` или Actions → Run workflow) — без хотя
бы одного ручного старта цепочка никогда не начнётся сама. SM сам сканит весь
Jira-бэклог и диспатчит `ai-teammate.yml` под каждый подходящий тикет — с
созданной Epic/Story идеи владелец дальше не трогает пайплайн руками до
готового PR. Оба workflow используют `runs-on: ubuntu-latest`
(GitHub-hosted), не self-hosted, как в resume.

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
- **Первый цикл нужно запустить вручную** — `sm-agent.yml` триггерится
  `workflow_run` от `ai-teammate.yml`, у которого своих триггеров кроме
  `workflow_dispatch` нет; без ручного `gh workflow run sm-agent.yml`
  (Actions → Run workflow) цепочка не стартует сама первый раз.
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
  test root the project could plausibly use: `backend/test/`,
  `backend/src/**/*.spec.ts`, and the `frontend/` equivalents (unused until
  frontend tests exist — `git add` on a non-existent path/pathspec is a
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
