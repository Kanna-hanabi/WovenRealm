param(
  [string]$DolRoot = 'D:\Dol',
  [string]$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path,
  [string]$PrivateAddonRoot = 'D:\Dol\WovenRealm-intimate-addon-src'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-BootJson([string]$modDir) {
  $bootPath = Join-Path $modDir 'boot.json'
  if (!(Test-Path -LiteralPath $bootPath)) { throw "Missing boot.json: $bootPath" }
  return Get-Content -LiteralPath $bootPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-BootFiles([object]$boot) {
  $names = New-Object System.Collections.Generic.List[string]
  $names.Add('boot.json')
  foreach ($listName in @(
    'scriptFileList_inject_early',
    'scriptFileList_earlyload',
    'scriptFileList_preload',
    'scriptFileList',
    'styleFileList',
    'tweeFileList',
    'additionFile',
    'additionBinaryFile'
  )) {
    if ($boot.PSObject.Properties.Name -notcontains $listName) { continue }
    foreach ($fileName in @($boot.$listName)) {
      if ($fileName) { $names.Add([string]$fileName) }
    }
  }
  return $names | Select-Object -Unique
}

function Sync-ModSource([string]$sourceDir, [string]$destDir) {
  $boot = Read-BootJson $sourceDir
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null

  foreach ($oldFile in (Get-ChildItem -LiteralPath $destDir -File -ErrorAction SilentlyContinue)) {
    Remove-Item -LiteralPath $oldFile.FullName -Force
  }

  foreach ($fileName in (Get-BootFiles $boot)) {
    $sourcePath = Join-Path $sourceDir $fileName
    if (!(Test-Path -LiteralPath $sourcePath)) {
      Write-Warning "Listed file is missing and was skipped: $sourcePath"
      continue
    }
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $destDir (Split-Path -Leaf $fileName)) -Force
  }

  Write-Host "[source] $($boot.name) $($boot.version) -> $destDir"
}

$publicSource = Join-Path $DolRoot 'AIStoryGen'
$publicDest = Join-Path $RepoRoot 'src\AIStoryGen'
Sync-ModSource $publicSource $publicDest

$addonSource = Join-Path $DolRoot 'AIStoryGenIntimateAddon'
$addonDest = Join-Path $PrivateAddonRoot 'AIStoryGenIntimateAddon'
Sync-ModSource $addonSource $addonDest

Write-Host '[source] split complete'

