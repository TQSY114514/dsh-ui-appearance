# dsh-ui-appearance installer (Windows) - one command, no npm account and no
# git required:
#
#   powershell -ExecutionPolicy Bypass -Command "Invoke-WebRequest 'https://raw.githubusercontent.com/TQSY114514/dsh-ui-appearance/main/install.ps1' -OutFile install.ps1; .\install.ps1"
#
# Unlike a plain repo zip, the source here is the npm registry tarball, which
# ships the pre-built lib/ bundle (lib/ is not committed to this repository).
# The script:
#   1. resolves the version ('latest' -> newest publish via the registry API)
#   2. downloads and extracts the tarball into %DSH_HOME%\plugins (persistent,
#      not %TEMP% - temp can be wiped and would leave the junction dangling)
#   3. creates a junction in the profile's node_modules
#   4. registers ui-appearance in cordis.patch.yml (idempotent - safe to rerun)
#
# Pin a version with -Version '0.1.0'. DSH home defaults to %DSH_HOME% or
# %USERPROFILE%\.dsh; override with -DshHome. Profile defaults to 'web'.
# Reload the Web UI afterwards. Uninstall: delete the junction and the entry,
# or `dsh plugin --profile <name> remove ui-appearance`.

param(
    [string]$Version = 'latest',
    [string]$DshHome = $env:DSH_HOME,
    [string]$Profile = 'web'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$packageName = 'dsh-ui-appearance'
$pluginId    = 'ui-appearance'

if (-not $DshHome) { $DshHome = Join-Path $env:USERPROFILE '.dsh' }
if (-not (Test-Path $DshHome)) { throw "DSH home not found: $DshHome (override with -DshHome)" }

$nodeModules = Join-Path $DshHome 'profiles\node_modules'
$linkPath    = Join-Path $nodeModules $packageName
$patchFile   = Join-Path $DshHome "profiles\$Profile\cordis.patch.yml"
$pluginsDir  = Join-Path $DshHome 'plugins'
$pkgDir      = Join-Path $pluginsDir $packageName

# ---------- 1. resolve version ----------
Write-Host '[1/4] Resolving version...' -ForegroundColor Cyan
if ($Version -eq 'latest') {
    try {
        $meta = Invoke-RestMethod -Uri "https://registry.npmjs.org/$packageName/latest" -TimeoutSec 15
        $Version = $meta.version
        Write-Host "  latest: v$Version" -ForegroundColor Cyan
    } catch {
        throw "could not reach the npm registry to resolve 'latest': $($_.Exception.Message)"
    }
} else {
    $Version = $Version.TrimStart('v')
}

# ---------- 2. download + extract ----------
Write-Host "[2/4] Downloading $packageName@$Version..." -ForegroundColor Cyan
$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if (-not $tar) { throw 'tar.exe not found - Windows 10 1803+ ships it; install the plugin from source instead (see README)' }

$tgzUrl     = "https://registry.npmjs.org/$packageName/-/$packageName-$Version.tgz"
$tgzFile    = Join-Path $pluginsDir "$packageName.tgz"
$extractDir = Join-Path $pluginsDir "$packageName-extract"
New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null

try {
    Invoke-WebRequest $tgzUrl -OutFile $tgzFile -UseBasicParsing -TimeoutSec 120
} catch {
    throw "download failed ($tgzUrl): $($_.Exception.Message)"
}

if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
& $tar.Source '-xzf' $tgzFile '-C' $extractDir
if ($LASTEXITCODE -ne 0) { throw "tar extraction failed for $tgzFile" }

$inner = Join-Path $extractDir 'package'
if (-not (Test-Path (Join-Path $inner 'lib\client.js'))) {
    throw "lib\client.js missing from the tarball - the published package must ship the pre-built bundle"
}

# ---------- 3. place + junction ----------
Write-Host "[3/4] Linking -> $linkPath" -ForegroundColor Cyan
if (Test-Path $pkgDir) { Remove-Item $pkgDir -Recurse -Force }
Move-Item $inner $pkgDir
Remove-Item $tgzFile -Force
Remove-Item $extractDir -Recurse -Force

New-Item -ItemType Directory -Force -Path $nodeModules | Out-Null
if (Test-Path $linkPath) {
    $item = Get-Item $linkPath -Force
    if ($item.LinkType) {
        # Delete the junction itself, never its target (-Recurse would follow it).
        [System.IO.Directory]::Delete($linkPath)
    } else {
        Remove-Item $linkPath -Force -Recurse
    }
}
New-Item -ItemType Junction -Path $linkPath -Target $pkgDir | Out-Null
if (-not (Test-Path (Join-Path $linkPath 'lib\client.js'))) { throw 'junction creation failed' }

# ---------- 4. register ----------
Write-Host "[4/4] Registering in $patchFile" -ForegroundColor Cyan
$profileDir = Split-Path $patchFile -Parent
if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Force -Path $profileDir | Out-Null }
$entryText = @'
- insert:
    - id: ui-appearance
      name: 'dsh-ui-appearance'
'@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
if (-not (Test-Path $patchFile)) {
    [System.IO.File]::WriteAllText($patchFile, $entryText + "`n", $utf8NoBom)
} else {
    $content = Get-Content $patchFile -Raw
    if ($content -match "(?m)^\s*-\s+id:\s*['`"]?$pluginId['`"]?\s*$") {
        Write-Host '  already registered, skip.' -ForegroundColor DarkGray
    } else {
        # Strip a trailing empty YAML list before appending.
        $base = ($content -replace '(?s)\[\s*\]\s*$', '').TrimEnd()
        if ($base -eq '') { $new = $entryText + "`n" } else { $new = $base + "`n`n" + $entryText + "`n" }
        [System.IO.File]::WriteAllText($patchFile, $new, $utf8NoBom)
    }
}

Write-Host ''
Write-Host "Done. Reload the Web UI - Settings -> General -> Appearance -> '$pluginId'." -ForegroundColor Green
Write-Host 'If the row does not appear after reload, restart the dsh web process.' -ForegroundColor Yellow
