function Invoke-OmxHudSelfHeal {
    $packageRoot = Join-Path $env:APPDATA 'npm\node_modules\oh-my-codex'
    $hudPath = Join-Path $packageRoot 'dist\hud\index.js'
    if (-not (Test-Path -LiteralPath $hudPath)) {
        return
    }

    $content = Get-Content -LiteralPath $hudPath -Raw
    $old1 = @'
    dependencies.writeStdout('\x1b[?25l');
    let firstRender = true;
    let inFlight = false;
    let queued = false;
    let stopped = false;
'@
    $new1 = @'
    dependencies.writeStdout('\x1b[?25l');
    let firstRender = true;
    let inFlight = false;
    let lastLine = null;
    let queued = false;
    let stopped = false;
'@
    $old2 = @'
        try {
            if (firstRender) {
                dependencies.writeStdout('\x1b[2J\x1b[H');
                firstRender = false;
            }
            else {
                dependencies.writeStdout('\x1b[H');
            }
            const config = await dependencies.readHudConfigFn(cwd);
            const ctx = await dependencies.readAllStateFn(cwd, config);
            const preset = flags.preset ?? config.preset;
            const line = dependencies.renderHudFn(ctx, preset);
            dependencies.writeStdout(line + '\x1b[K\n\x1b[J');
            await dependencies.runAuthorityTickFn({ cwd });
'@
    $new2 = @'
        try {
            const config = await dependencies.readHudConfigFn(cwd);
            const ctx = await dependencies.readAllStateFn(cwd, config);
            const preset = flags.preset ?? config.preset;
            const line = dependencies.renderHudFn(ctx, preset);
            if (firstRender) {
                dependencies.writeStdout('\x1b[2J\x1b[H\x1b[2K' + line + '\x1b[K');
                firstRender = false;
                lastLine = line;
            }
            else if (line !== lastLine) {
                dependencies.writeStdout('\x1b[H\x1b[2K' + line + '\x1b[K');
                lastLine = line;
            }
            await dependencies.runAuthorityTickFn({ cwd });
'@

    $changed = $false
    if ($content.Contains($old1)) {
        $content = $content.Replace($old1, $new1)
        $changed = $true
    }
    if ($content.Contains($old2)) {
        $content = $content.Replace($old2, $new2)
        $changed = $true
    }

    if ($changed) {
        $backupPath = $hudPath + '.bak-auto-selfheal'
        if (-not (Test-Path -LiteralPath $backupPath)) {
            Copy-Item -LiteralPath $hudPath -Destination $backupPath -Force
        }
        Set-Content -LiteralPath $hudPath -Value $content -NoNewline
    }
}

function global:omx {
    [CmdletBinding()]
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]] $Args
    )

    Invoke-OmxHudSelfHeal
    & $env:APPDATA\npm\omx.ps1 @Args
}
