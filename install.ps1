# dsh-ui-appearance installer (Windows) - one command, no npm account and no
# git required:
#
#   powershell -ExecutionPolicy Bypass -Command "Invoke-WebRequest 'https://raw.githubusercontent.com/TQSY114514/dsh-ui-appearance/main/install.ps1' -OutFile install.ps1; .\install.ps1"
#
# Unlike a plain repo zip, the source here is the npm registry tarball, which
# ships the pre-built lib/ bundle (lib/ is not committed to this repository).
# The script:
#   1. resolves the version ('latest' -> newest publish via the registry API)
#   2. downloads, sha512-verifies and extracts the tarball into
#      %DSH_HOME%\plugins (persistent, not %TEMP% - temp can be wiped and
#      would leave the junction dangling)
#   3. links it into the profile's own node_modules
#   4. registers it in that profile's package.json ('dependencies' +
#      'dsh.profile.bundles'), mirroring what `dsh plugin add` produces -
#      idempotent, safe to rerun
#
# Pin a version with -Version '0.1.0'. DSH home defaults to %DSH_HOME% or
# %USERPROFILE%\.dsh; override with -DshHome. Profile defaults to 'web'.
# Reload the Web UI afterwards. Uninstall with
# `dsh plugin --profile <name> remove dsh-ui-appearance`, or by hand:
# delete the junction under profiles\<name>\node_modules plus the entries
# step 4 added to the profile's package.json.

param(
    [string]$Version = 'latest',
    [string]$DshHome = $env:DSH_HOME,
    [string]$ProfileName = 'web'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$packageName = 'dsh-ui-appearance'

if (-not $DshHome) { $DshHome = Join-Path $env:USERPROFILE '.dsh' }
if (-not (Test-Path $DshHome)) { throw "DSH home not found: $DshHome (override with -DshHome)" }

$pluginsDir = Join-Path $DshHome 'plugins'
$pkgDir     = Join-Path $pluginsDir $packageName

function Remove-LinkSafely([string]$path) {
    # Test-Path follows a link's target and misreports dangling links, so
    # inspect the reparse point itself; delete the link, never its target.
    $item = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    if (-not $item) { return }
    if ($item.LinkType) {
        # Delete the junction itself (-Recurse would follow it).
        [System.IO.Directory]::Delete($path)
    } else {
        Remove-Item -LiteralPath $path -Force -Recurse
    }
}

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

# ---------- 3. place the persistent copy ----------
Write-Host "[3/4] Installing $packageName@$Version -> $pkgDir" -ForegroundColor Cyan
if (Test-Path $pkgDir) { Remove-Item $pkgDir -Recurse -Force }
Move-Item $inner $pkgDir
Remove-Item $tgzFile -Force
Remove-Item $extractDir -Recurse -Force

# ---------- 4. register with the profile ----------
# The dsh host loads plugins from each profile's own package.json
# ('dependencies' entry + 'dsh.profile.bundles' array); the package's
# bundled cordis.patch.yml supplies the settings-panel roster on its own.
# This mirrors what `dsh plugin add` produces, and an uninitialized
# profile fails fast instead of being invented silently.
$profileDir = Join-Path $DshHome "profiles\$ProfileName"
$profilePkg = Join-Path $profileDir 'package.json'
$profileNM  = Join-Path $profileDir 'node_modules'
$linkPath   = Join-Path $profileNM $packageName
if (-not (Test-Path $profilePkg)) {
    throw "profile '$ProfileName' has no package.json at $profilePkg - start dsh with this profile once so it initializes, then rerun"
}

Write-Host "[4/4] Registering with profile '$ProfileName'..." -ForegroundColor Cyan

# Releases of this script before 0.1.5 linked into the shared
# profiles\node_modules layer, which the host does not consult for
# loading; drop that stale link when upgrading from one of those.
Remove-LinkSafely (Join-Path (Join-Path $DshHome 'profiles\node_modules') $packageName)

New-Item -ItemType Directory -Force -Path $profileNM | Out-Null
Remove-LinkSafely $linkPath
New-Item -ItemType Junction -Path $linkPath -Target $pkgDir | Out-Null
if (-not (Test-Path (Join-Path $linkPath 'lib\client.js'))) { throw 'junction creation failed' }

$pkgJson  = Get-Content $profilePkg -Raw -Encoding UTF8 | ConvertFrom-Json
$fileSpec = 'file:' + ($pkgDir -replace '\\', '/')
if (-not ($pkgJson.PSObject.Properties['dependencies'])) {
    $pkgJson | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{})
}
$pkgJson.dependencies | Add-Member -Force -NotePropertyName $packageName -NotePropertyValue $fileSpec

if (-not ($pkgJson.PSObject.Properties['dsh'])) {
    $pkgJson | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{})
}
if (-not ($pkgJson.dsh.PSObject.Properties['profile'])) {
    $pkgJson.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{})
}
if (-not ($pkgJson.dsh.profile.PSObject.Properties['bundles'])) {
    $pkgJson.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue @()
}
$bundles = @($pkgJson.dsh.profile.bundles)
if ($bundles -cnotcontains $packageName) {
    $bundles += $packageName
    # The cast keeps a single-entry list a JSON array instead of a scalar.
    $pkgJson.dsh.profile | Add-Member -Force -NotePropertyName bundles -NotePropertyValue ([string[]]$bundles)
}
[System.IO.File]::WriteAllText($profilePkg, (ConvertTo-Json $pkgJson -Depth 32) + "`n", $utf8NoBom)

Write-Host ''
Write-Host "Done. Reload the Web UI - Settings -> General -> Appearance." -ForegroundColor Green
Write-Host 'If the panel does not appear after reload, restart the dsh web process.' -ForegroundColor Yellow
