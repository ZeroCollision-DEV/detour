$repo = 'detour'
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged into GitHub. Run:  gh auth login" -ForegroundColor Yellow
    Write-Host "Then run this script again." -ForegroundColor Yellow
    exit 1
}

gh auth setup-git 2>&1 | Out-Null

$login = (gh api user --jq .login 2>&1).Trim()
$id    = (gh api user --jq .id 2>&1).Trim()

Write-Host "Setting up repo $login/$repo ..." -ForegroundColor Cyan

gh repo view "$login/$repo" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    gh repo create $repo --public --description "the short way around - a client-side link bypass" 2>&1 | Out-Null
}

Set-Location $root
if (-not (Test-Path -LiteralPath .git)) { git init | Out-Null }
git config user.name $login
git config user.email "$id+$login@users.noreply.github.com"
git remote remove origin 2>&1 | Out-Null
git remote add origin "https://github.com/$login/$repo.git"
git add -A
git commit -m "detour: client-side link bypass" --allow-empty | Out-Null
git branch -M main
git push -u origin main

Write-Host "Enabling GitHub Pages ..." -ForegroundColor Cyan
gh api "repos/$login/$repo/pages" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    $body = '{"source":{"branch":"main","path":"/"}}'
    $body | gh api "repos/$login/$repo/pages" --method POST --input - 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Couldn't enable Pages via API. Do it manually:" -ForegroundColor Yellow
        Write-Host "  Repo Settings -> Pages -> Deploy from a branch -> main / (root) -> Save" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Done. Site will be live at:" -ForegroundColor Green
Write-Host "  https://$login.github.io/$repo/" -ForegroundColor Green
Write-Host "(First deploy can take a minute or two.)" -ForegroundColor DarkGray
