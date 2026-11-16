# Session Bridge bootstrap. Uses only Windows PowerShell / PowerShell system APIs.
[CmdletBinding()]
param(
  [string]$Harness,
  [ValidateSet('global','project')][string]$Scope = 'global',
  [string]$Cwd = (Get-Location).Path,
  [string]$SkillsDir,
  [string]$Release = 'latest',
  [switch]$Offline,
  [switch]$Upgrade
)
$ErrorActionPreference = 'Stop'
# Avoid the PowerShell 5.1 progress renderer slowing noninteractive binary downloads.
$ProgressPreference = 'SilentlyContinue'
$Repository = 'lyzMaster/session-bridge'
if ($env:OS -ne 'Windows_NT') { throw 'Use install.sh on macOS.' }
if ($Release -ne 'latest' -and $Release -notmatch '^v\d+\.\d+\.\d+$') { throw 'Invalid release tag.' }
$Cwd = (Resolve-Path -LiteralPath $Cwd).Path
$Forward = @('--scope',$Scope,'--cwd',$Cwd)
if ($Harness) { $Forward += @('--harness',$Harness) }
if ($SkillsDir) {
  if (-not [IO.Path]::IsPathRooted($SkillsDir)) { $SkillsDir = [IO.Path]::Combine($Cwd,$SkillsDir) }
  $Forward += @('--skills-dir',$SkillsDir)
}
if ($Upgrade) { $Forward += '--replace' }
function Test-LocalExecutable([string]$Executable) {
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
  try {
    $Data = (& $Executable doctor 2>$null | Out-String | ConvertFrom-Json)
    return ($LASTEXITCODE -eq 0 -and $Data.ready -eq $true -and $Data.standalone -eq $true -and
      $Data.skills_engine.package -eq 'skills' -and $Data.compatibility.installation_receipt_version -eq 1)
  } catch { return $false }
}
if (-not $Upgrade) {
  $Candidates = @()
  if ($SkillsDir) { $Candidates += [IO.Path]::Combine($SkillsDir,'session-bridge','session-bridge.exe') }
  else {
    $UserDirectory = [Environment]::GetFolderPath('UserProfile')
    $Registries = @('.agents\skills','.codex\skills','.claude\skills','.cursor\skills') | ForEach-Object { [IO.Path]::Combine($UserDirectory,$_) }
    $Registries += @('.agents\skills','.codex\skills','.claude\skills','skills') | ForEach-Object { [IO.Path]::Combine($Cwd,$_) }
    foreach ($Base in @($UserDirectory,$Cwd)) {
      $Registries += Get-ChildItem -LiteralPath $Base -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name.StartsWith('.') } | ForEach-Object { [IO.Path]::Combine($_.FullName,'skills') }
    }
    foreach ($Base in @([IO.Path]::Combine($UserDirectory,'.config'),$env:APPDATA,$env:LOCALAPPDATA,$env:XDG_CONFIG_HOME)) {
      if ($Base -and (Test-Path -LiteralPath $Base -PathType Container)) {
        $Registries += Get-ChildItem -LiteralPath $Base -Directory -Force -ErrorAction SilentlyContinue |
          ForEach-Object { [IO.Path]::Combine($_.FullName,'skills') }
      }
    }
    if ($env:CODEX_HOME) { $Registries += [IO.Path]::Combine($env:CODEX_HOME,'skills') }
    if ($env:CLAUDE_CONFIG_DIR) { $Registries += [IO.Path]::Combine($env:CLAUDE_CONFIG_DIR,'skills') }
    $Candidates = $Registries | Select-Object -Unique | ForEach-Object { [IO.Path]::Combine($_,'session-bridge','session-bridge.exe') }
  }
  foreach ($Candidate in $Candidates) {
    if (Test-LocalExecutable $Candidate) {
      & $Candidate install @Forward
      if ($LASTEXITCODE -ne 0) { throw "Local installer returned exit code $LASTEXITCODE" }
      return
    }
  }
}
if ($Offline) { throw 'No compatible local installation found; offline mode did not download anything.' }
$Architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($Architecture -ne 'AMD64') { throw 'The current Windows release supports x64. Native Windows ARM is not supported.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$TempDirectory = [IO.Path]::Combine([IO.Path]::GetTempPath(),'session-bridge-bootstrap-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($TempDirectory) | Out-Null
try {
  $ManifestUrl = if ($Release -eq 'latest') { "https://github.com/$Repository/releases/latest/download/release-manifest.json" }
    else { "https://github.com/$Repository/releases/download/$Release/release-manifest.json" }
  $Manifest = Invoke-RestMethod -Uri $ManifestUrl -TimeoutSec 90
  if ($Manifest.schema_version -ne 1 -or $Manifest.repository -ne $Repository -or $Manifest.tag -notmatch '^v\d+\.\d+\.\d+$') { throw 'Invalid release manifest identity.' }
  if ($Release -ne 'latest' -and $Manifest.tag -ne $Release) { throw 'Release version does not match request.' }
  $Artifact = $Manifest.platforms.'windows-x64'
  $ExpectedUrl = "https://github.com/$Repository/releases/download/$($Manifest.tag)/session-bridge-windows-x64.exe"
  if ($Artifact.filename -ne 'session-bridge-windows-x64.exe' -or $Artifact.url -ne $ExpectedUrl -or
      $Artifact.sha256 -notmatch '^[a-f0-9]{64}$' -or $Artifact.bytes -le 0 -or $Artifact.bytes -gt 160000000) { throw 'Invalid Windows artifact metadata.' }
  $Executable = [IO.Path]::Combine($TempDirectory,$Artifact.filename)
  Invoke-WebRequest -UseBasicParsing -Uri $Artifact.url -OutFile $Executable -TimeoutSec 600
  if ((Get-Item -LiteralPath $Executable).Length -ne $Artifact.bytes -or
      (Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Artifact.sha256) { throw 'Downloaded executable failed integrity verification.' }
  & $Executable install @Forward
  if ($LASTEXITCODE -ne 0) { throw "Installer returned exit code $LASTEXITCODE" }
} finally { Remove-Item -LiteralPath $TempDirectory -Recurse -Force -ErrorAction SilentlyContinue }
