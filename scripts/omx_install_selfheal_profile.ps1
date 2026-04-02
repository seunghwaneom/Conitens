param(
    [string]$ProfilePath = $PROFILE.CurrentUserCurrentHost,
    [string]$HelperSourcePath = (Join-Path $PSScriptRoot 'omx_selfheal_profile_helper.ps1'),
    [string]$HelperFileName = 'omx-selfheal.ps1'
)

$ErrorActionPreference = 'Stop'

$profileDir = Split-Path -Parent $ProfilePath
$helperPath = Join-Path $profileDir $HelperFileName
$realOmxPath = Join-Path $env:APPDATA 'npm\omx.ps1'
$markerStart = '# OMX SELFHEAL START'
$markerEnd = '# OMX SELFHEAL END'

if (-not (Test-Path -LiteralPath $realOmxPath)) {
    throw "Could not find real omx wrapper at $realOmxPath"
}

if (-not (Test-Path -LiteralPath $HelperSourcePath)) {
    throw "Could not find helper source at $HelperSourcePath"
}

New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

if (Test-Path -LiteralPath $ProfilePath) {
    Copy-Item -LiteralPath $ProfilePath -Destination ($ProfilePath + '.bak-20260331-omx-selfheal') -Force
}

Copy-Item -LiteralPath $HelperSourcePath -Destination $helperPath -Force

$profileContent = if (Test-Path -LiteralPath $ProfilePath) {
    Get-Content -LiteralPath $ProfilePath -Raw
} else {
    ''
}

$block = @"
$markerStart
. '$helperPath'
$markerEnd
"@

$escapedStart = [regex]::Escape($markerStart)
$escapedEnd = [regex]::Escape($markerEnd)
$pattern = "$escapedStart.*?$escapedEnd"
$singleline = [System.Text.RegularExpressions.RegexOptions]::Singleline

if ([regex]::IsMatch($profileContent, $pattern, $singleline)) {
    $profileContent = [regex]::Replace($profileContent, $pattern, $block, $singleline)
} else {
    if ($profileContent.Length -gt 0 -and -not $profileContent.EndsWith("`r`n") -and -not $profileContent.EndsWith("`n")) {
        $profileContent += "`r`n"
    }
    $profileContent += $block
}

Set-Content -LiteralPath $ProfilePath -Value $profileContent -NoNewline

Write-Output "Installed OMX self-heal profile wrapper:"
Write-Output "  profile: $ProfilePath"
Write-Output "  helper : $helperPath"
