param(
    [string]$CloudHost = "root@43.139.111.113",
    [string]$PublicUrl = "https://icebear-yearning.fun/island/"
)

$ErrorActionPreference = "Stop"

Write-Host "=== [1-2/4] Building I-land frontend & packing clean release bundle in WSL2 ===" -ForegroundColor Cyan
$bundle = "D:\OpenClaw\iland-release.tar.gz"
$buildRaw = (Get-Content -Raw -Encoding UTF8 "D:\OpenClaw\I-land\scripts\build_iland_bundle.sh") -replace "`r", ""
$buildB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($buildRaw))
wsl.exe -d OpenClaw -u openclaw -- bash -c "echo $buildB64 | base64 -d | bash"
if ($LASTEXITCODE -ne 0) { throw "I-land frontend build or bundle packing failed." }

Write-Host "=== [3/4] Uploading bundle to $CloudHost (with auto-retry) ===" -ForegroundColor Cyan
$uploaded = $false
for ($i = 1; $i -le 6; $i++) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($bundle)
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "ssh.exe"
        $psi.Arguments = "-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 $CloudHost `"cat > /tmp/iland-release.tar.gz`""
        $psi.UseShellExecute = $false
        $psi.RedirectStandardInput = $true
        $psi.RedirectStandardError = $true
        $proc = [System.Diagnostics.Process]::Start($psi)
        $proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        $proc.StandardInput.BaseStream.Flush()
        $proc.StandardInput.Close()
        $err = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()
        if ($proc.ExitCode -eq 0) {
            $uploaded = $true
            break
        }
        Write-Host "SSH upload attempt $i failed ($err), retrying..." -ForegroundColor Yellow
    } catch {
        Write-Host "SSH upload attempt $i failed ($($_.Exception.Message)), retrying..." -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 2
}
Remove-Item $bundle -Force -ErrorAction SilentlyContinue
if (-not $uploaded) { throw "Failed to upload iland-release.tar.gz to cloud server." }

Write-Host "=== [4/4] Deploying I-land on cloud server (zero data touch) ===" -ForegroundColor Cyan
$remoteScript = @'
set -euo pipefail
rm -rf /opt/couple-space/iland
mkdir -p /opt/couple-space/iland
tar -xzf /tmp/iland-release.tar.gz -C /opt/couple-space/iland
rm -f /tmp/iland-release.tar.gz
chown -R donut:donut /opt/couple-space/iland

su - donut -c '/opt/couple-space/iland-venv/bin/pip install --quiet -i https://pypi.tuna.tsinghua.edu.cn/simple -r /opt/couple-space/iland/backend/requirements.txt'
systemctl restart couple-iland.service
sleep 2
systemctl is-active couple-iland.service

HOME_CODE="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/)"
AUTH_CODE="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/auth/me)"
echo "ILAND_HEALTH home=$HOME_CODE auth_guard=$AUTH_CODE"
[ "$HOME_CODE" = "200" ] && [ "$AUTH_CODE" = "401" ]
'@ -replace "`r", ""
$remoteB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))

$deployed = $false
for ($i = 1; $i -le 6; $i++) {
    ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 $CloudHost "echo $remoteB64 | base64 -d | bash"
    if ($LASTEXITCODE -eq 0) {
        $deployed = $true
        break
    }
    Write-Host "Remote deploy attempt $i failed, retrying..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}
if (-not $deployed) { throw "Remote deploy failed." }

Write-Host "=== Verifying public HTTPS endpoint ===" -ForegroundColor Green
$prevPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$pubCode = & curl.exe -sS -o NUL -w "%{http_code}" --max-time 8 $PublicUrl 2>&1
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $prevPref
if ($exitCode -eq 0 -and "$pubCode" -eq "200") {
    Write-Host "Public $PublicUrl -> HTTP $pubCode" -ForegroundColor Green
} else {
    Write-Host "[WARN] Local public HTTPS check did not complete ($pubCode) - cloud service itself is active & healthy." -ForegroundColor Yellow
}
Write-Host "[OK] I-land published successfully to $CloudHost !" -ForegroundColor Green
