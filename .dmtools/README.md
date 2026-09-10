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
| Секрет `JIRA_EMAIL` | email Jira-аккаунта | ⬜ настроить в GitHub Actions |
| Секрет `JIRA_API_TOKEN` | API-токен Jira | ⬜ настроить в GitHub Actions |
| Секрет `GH_PROJECT_TOKEN` | GitHub PAT, `repo`+`workflow` | ⬜ настроить в GitHub Actions |
| Секрет `CLAUDE_CODE_OAUTH_TOKEN` | подписка Claude Code | ⬜ настроить в GitHub Actions |
| Переменная `JIRA_BASE_PATH` | `https://kejno.atlassian.net` | ⬜ настроить в GitHub Actions |
| `.github/workflows/{sm,ai-teammate}.yml` | скопировать из resume | ⬜ |

## Крон

`sm.yml` крутится по расписанию (`schedule: '*/20 * * * *'`) плюс
`workflow_dispatch` для ручных прогонов. SM сам сканит весь Jira-бэклог и
диспатчит `ai-teammate.yml` под каждый подходящий тикет — с созданной Epic/
Story идеи владелец дальше не трогает пайплайн руками до готового PR.

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

Если апгрейдишь `dmtools` до новой версии — стоит перепроверить, не
исправлены ли баги 1-3, 5, 6 в самом Java-ядре (тогда наши JS-патчи/конфиг-
обходы станут избыточны, но безвредны). Баг 4 — это состояние Jira-проекта,
апгрейд `dmtools` на него не повлияет.

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
- `intake.json` ещё не прогонялся вживую в bonapp.
- `recover_failed_tc_bug_status.json` (upstream edge-case recovery job для
  зависших TC/Bug статусов) не портирован — не блокирует happy path, можно
  добавить позже если понадобится.
- **Workflow-файлы `.github/workflows/sm.yml` и `.github/workflows/
  ai-teammate.yml` ещё не скопированы в bonapp** — были только в resume,
  нужно перенести и настроить секреты (см. таблицу «Настройка» выше) перед
  первым живым прогоном.
- **Ничего из пайплайна ещё не прогонялось на bonapp** — весь раздел «Известные
  баги upstream-кода» выше основан на опыте resume; стоит быть готовым, что
  в новом Jira-проекте/репо вылезет что-то ещё специфичное для BNP (см. баг 4
  про workflow-transitions — это состояние конкретного Jira-проекта, не
  переносится автоматически).
