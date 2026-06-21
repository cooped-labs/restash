# Build restash-win-helper.exe on a Windows runner (CI) or locally with MSVC.
# Produces a self-contained, statically-linked (/MT) console exe that depends on
# nothing the user installs — only Win32 system DLLs present on every Win10/11.
#
# Usage (Developer Command Prompt / GitHub windows-latest):
#   pwsh native/build-win-helper.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $PSScriptRoot "win32\restash-win-helper.c"
$out  = Join-Path $root "bin\restash-win-helper.exe"
New-Item -ItemType Directory -Force -Path (Join-Path $root "bin") | Out-Null

# Prefer MSVC cl.exe (already on windows-latest via the VS toolchain).
& cl /nologo /O2 /MT $src /Fe:$out user32.lib shell32.lib ole32.lib /link /SUBSYSTEM:CONSOLE
if ($LASTEXITCODE -ne 0) { throw "cl build failed" }
Write-Host "Built $out"
