param(
  [string]$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path,
  [string]$OutputName = '织境空间-v0.1.315-公开版.zip'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-BootJson([string]$modDir) {
  $bootPath = Join-Path $modDir 'boot.json'
  if (!(Test-Path -LiteralPath $bootPath)) { throw "Missing boot.json: $bootPath" }
  return Get-Content -LiteralPath $bootPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-BootFiles([string]$modDir, [object]$boot) {
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

  $files = @()
  foreach ($fileName in ($names | Select-Object -Unique)) {
    $path = Join-Path $modDir $fileName
    if (!(Test-Path -LiteralPath $path)) { throw "Listed file is missing: $path" }
    $files += $path
  }
  return $files
}

$sourceDir = Join-Path $RepoRoot 'src\AIStoryGen'
$boot = Read-BootJson $sourceDir
$files = Get-BootFiles $sourceDir $boot

$distDir = Join-Path $RepoRoot 'dist'
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
$outputPath = Join-Path $distDir $OutputName
Compress-Archive -LiteralPath $files -DestinationPath $outputPath -Force

Write-Host "[package] $($boot.name) $($boot.version) -> $outputPath"

