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

# ---------- 1. resolve version + expected tarball digest ----------
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
    try {
        $meta = Invoke-RestMethod -Uri "https://registry.npmjs.org/$packageName/$Version" -TimeoutSec 15
    } catch {
        throw "could not reach the npm registry to resolve v$Version`: $($_.Exception.Message)"
    }
}
$expectedIntegrity = $meta.dist.integrity
if (-not $expectedIntegrity -or -not $expectedIntegrity.StartsWith('sha512-')) {
    throw "registry metadata for v$Version has no sha512 integrity digest - refusing to download unverified"
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

# Verify the tarball against the registry's published sha512 digest
# (CWE-494: an unverified download is a code-integrity hole).
$expectedB64 = $expectedIntegrity.Substring('sha512-'.Length)
$hashHex = (Get-FileHash -LiteralPath $tgzFile -Algorithm SHA512).Hash
$actualB64 = [Convert]::ToBase64String((1..($hashHex.Length / 2) | ForEach-Object { [Convert]::ToByte($hashHex.Substring(($_ - 1) * 2, 2), 16) }))
if ($actualB64 -cne $expectedB64) {
    Remove-Item -LiteralPath $tgzFile -Force
    throw "tarball integrity check failed for v$Version - the download does not match the registry digest"
}
Write-Host '  sha512 verified' -ForegroundColor DarkGray

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
# Test-Path follows the junction target and reports $false for a dangling
# link, so inspect the reparse point itself before creating the replacement.
$existing = Get-Item -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.LinkType) {
        # Delete the junction itself, never its target (-Recurse would follow it).
        [System.IO.Directory]::Delete($linkPath)
    } else {
        Remove-Item -LiteralPath $linkPath -Force -Recurse
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
    $content = Get-Content $patchFile -Raw -Encoding UTF8
    if ($content -cmatch "(?m)^\s*-\s+id:\s*(?:$pluginId|'$pluginId'|`"$pluginId`")\s*(?:#.*)?$") {
        Write-Host '  already registered, skip.' -ForegroundColor DarkGray
    } else {
        # Strip a trailing empty YAML list (with or without a trailing
        # comment, e.g. '[] # no plugins') before appending.
        $base = ($content -replace '(?m)^\s*\[\s*\]\s*(?:#.*)?$', '').TrimEnd()
        if ($base -eq '') { $new = $entryText + "`n" } else { $new = $base + "`n`n" + $entryText + "`n" }
        [System.IO.File]::WriteAllText($patchFile, $new, $utf8NoBom)
    }
}

Write-Host ''
Write-Host "Done. Reload the Web UI - Settings -> General -> Appearance -> '$pluginId'." -ForegroundColor Green
Write-Host 'If the row does not appear after reload, restart the dsh web process.' -ForegroundColor Yellow
