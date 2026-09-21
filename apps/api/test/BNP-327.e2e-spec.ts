// BNP-327: Ветка main защищена от прямых push-коммитов
//
// Ожидаемый результат: прямой push в main должен быть отклонён.
// Проверка требует изменения настроек Branch Protection в GitHub Settings UI
// и попытки push напрямую в main — это нельзя сделать программно через gh CLI
// без привилегированного токена и без реального изменения конфигурации репозитория.
//
// Статус: blocked_by_human — требует ручной проверки в GitHub Settings.

describe('BNP-327: Main branch is protected from direct push commits', () => {
  it.skip(
    'direct push to main is rejected by branch protection rules',
    () => {
      // Requires: GitHub repository Settings → Branches → Branch protection rule for "main"
      // with "Require a pull request before merging" enabled.
      // Manual verification: attempt git push origin main and confirm it is rejected.
    },
  );

  it.skip(
    'branch protection requires pull request reviews before merging',
    () => {
      // Requires: GitHub repository Settings → Branches → Branch protection rule for "main"
      // with "Require pull request reviews before merging" enabled.
      // Manual verification: open a PR and confirm the Merge button is locked without a review.
    },
  );
});
