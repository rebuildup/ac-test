param(
    [Parameter(Position = 0, Mandatory = $true)]
    [string]$Alias,

    [string]$ContestDir = ".",

    [double]$LimitMultiplier = 1.0
)

$ErrorActionPreference = "Stop"
$ContestDir = (Resolve-Path $ContestDir).Path
$manifestPath = Join-Path $ContestDir "Cargo.toml"
$testcaseDir = Join-Path $ContestDir ("testcases/generated/" + $Alias)
$yamlPath = Join-Path $ContestDir ("testcases/" + $Alias + ".yml")

if (-not (Test-Path $manifestPath)) {
    throw "Cargo.toml not found: $manifestPath"
}
if (-not (Test-Path $testcaseDir)) {
    throw "Generated testcases not found: $testcaseDir`nOpen the AtCoder problem page once with ac-test enabled."
}

$toml = Get-Content $manifestPath -Raw
$escapedAlias = [regex]::Escape($Alias)
$binName = $null

# cargo-compete metadata, e.g.
# abc123-a = { alias = "a", problem = "..." }
$metadataPattern = '(?m)^\s*([A-Za-z0-9_.-]+)\s*=\s*\{[^\r\n}]*\balias\s*=\s*"' + $escapedAlias + '"[^\r\n}]*\}'
$m = [regex]::Match($toml, $metadataPattern)
if ($m.Success) {
    $binName = $m.Groups[1].Value.Trim('"')
}

# Fallback: [[bin]] whose source file is src/bin/<alias>.rs
if (-not $binName) {
    $blocks = [regex]::Matches($toml, '(?ms)\[\[bin\]\](.*?)(?=\r?\n\s*\[\[|\z)')
    foreach ($block in $blocks) {
        $pathMatch = [regex]::Match($block.Groups[1].Value, '(?m)^\s*path\s*=\s*"([^"]+)"')
        $nameMatch = [regex]::Match($block.Groups[1].Value, '(?m)^\s*name\s*=\s*"([^"]+)"')
        if ($pathMatch.Success -and $nameMatch.Success) {
            $leaf = [IO.Path]::GetFileNameWithoutExtension($pathMatch.Groups[1].Value)
            if ($leaf -eq $Alias) {
                $binName = $nameMatch.Groups[1].Value
                break
            }
        }
    }
}

if (-not $binName) {
    throw "Could not resolve cargo bin for alias '$Alias' from Cargo.toml"
}

$timeLimitMs = $null
if (Test-Path $yamlPath) {
    $yaml = Get-Content $yamlPath -Raw
    $tm = [regex]::Match($yaml, '(?m)^timelimit:\s*([0-9.]+)s\s*$')
    if ($tm.Success) {
        $timeLimitMs = [double]$tm.Groups[1].Value * 1000.0 * $LimitMultiplier
    }
}

Write-Host "ac-test stress: $Alias -> $binName"
if ($timeLimitMs) {
    Write-Host ("local threshold: {0:N0} ms (x{1})" -f $timeLimitMs, $LimitMultiplier)
}
Write-Host "building release..."

Push-Location $ContestDir
try {
    & cargo build --release --bin $binName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $metadata = (& cargo metadata --format-version 1 --no-deps | ConvertFrom-Json)
    $exeName = if ($IsWindows -or $env:OS -eq "Windows_NT") { "$binName.exe" } else { $binName }
    $exePath = Join-Path $metadata.target_directory ("release/" + $exeName)
    if (-not (Test-Path $exePath)) {
        throw "Built executable not found: $exePath"
    }

    $files = Get-ChildItem $testcaseDir -Filter *.txt | Sort-Object Name
    if ($files.Count -eq 0) {
        throw "No generated .txt files in $testcaseDir"
    }

    $results = @()
    foreach ($file in $files) {
        $stdout = [IO.Path]::GetTempFileName()
        $stderr = [IO.Path]::GetTempFileName()
        try {
            $psi = [Diagnostics.ProcessStartInfo]::new()
            $psi.FileName = $exePath
            $psi.UseShellExecute = $false
            $psi.RedirectStandardInput = $true
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError = $true
            $psi.CreateNoWindow = $true

            $process = [Diagnostics.Process]::new()
            $process.StartInfo = $psi

            $sw = [Diagnostics.Stopwatch]::StartNew()
            [void]$process.Start()

            # Stream instead of loading a potentially huge stress case into one PowerShell string.
            $reader = [IO.File]::OpenText($file.FullName)
            try {
                $buffer = New-Object char[] 65536
                while (($count = $reader.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $process.StandardInput.Write($buffer, 0, $count)
                }
            } finally {
                $reader.Dispose()
                $process.StandardInput.Close()
            }

            $outTask = $process.StandardOutput.ReadToEndAsync()
            $errTask = $process.StandardError.ReadToEndAsync()

            $timeoutMs = if ($timeLimitMs) { [Math]::Max(1000, [int][Math]::Ceiling($timeLimitMs * 1.5)) } else { 30000 }
            if (-not $process.WaitForExit($timeoutMs)) {
                $process.Kill($true)
                $process.WaitForExit()
                $sw.Stop()
                $status = "TIMEOUT"
                $exitCode = $null
            } else {
                $sw.Stop()
                $exitCode = $process.ExitCode
                if ($exitCode -ne 0) {
                    $status = "RE"
                } elseif ($timeLimitMs -and $sw.Elapsed.TotalMilliseconds -gt $timeLimitMs) {
                    $status = "OVER"
                } else {
                    $status = "OK"
                }
            }

            [IO.File]::WriteAllText($stdout, $outTask.GetAwaiter().GetResult())
            [IO.File]::WriteAllText($stderr, $errTask.GetAwaiter().GetResult())

            $results += [pscustomobject]@{
                Case = $file.BaseName
                Status = $status
                TimeMs = [Math]::Round($sw.Elapsed.TotalMilliseconds, 1)
                Exit = $exitCode
            }
        } finally {
            Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue
        }
    }

    $results | Format-Table -AutoSize
    Write-Host ""
    Write-Host "OVER/TIMEOUT is only a local warning; AtCoder hardware and runtime differ."
} finally {
    Pop-Location
}
