param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]+$')]
    [string]$DeploymentUuid,
    [ValidateRange(1, 100)]
    [int]$LogLines = 60
)

# Read-only diagnostic. The credential stays in memory and is never printed.
$ErrorActionPreference = 'Stop'
$diagToken = [Environment]::GetEnvironmentVariable('COOLIFY_MCP_TOKEN', 'User')
if (!$diagToken) {
    $diagToken = [Environment]::GetEnvironmentVariable('COOLIFY_MCP_TOKEN', 'Process')
}
if (!$diagToken) { throw 'COOLIFY_MCP_TOKEN no está disponible.' }

$diagHeaders = @{
    Authorization = 'Bearer ' + $diagToken
    Accept = 'application/json, text/event-stream'
}

function Invoke-DiagnosticRpc($body) {
    $response = Invoke-WebRequest -Uri 'https://coolify.sodiau.com/mcp' `
        -Headers $diagHeaders -Method Post -ContentType 'application/json' `
        -Body ($body | ConvertTo-Json -Depth 10 -Compress) -TimeoutSec 45
    if ($response.Headers['Mcp-Session-Id']) {
        $diagHeaders['Mcp-Session-Id'] = [string]$response.Headers['Mcp-Session-Id']
    }
    $raw = [string]$response.Content
    if ($raw.TrimStart().StartsWith('{')) { return ($raw | ConvertFrom-Json) }
    $jsonLine = $raw -split '\r?\n' | Where-Object { $_ -match '^data:' } |
        Select-Object -Last 1
    return (($jsonLine -replace '^data:\s*', '') | ConvertFrom-Json)
}

$null = Invoke-DiagnosticRpc @{
    jsonrpc = '2.0'; id = 1; method = 'initialize'
    params = @{
        protocolVersion = '2025-03-26'; capabilities = @{}
        clientInfo = @{ name = 'controlchats-diagnostic'; version = '1.0' }
    }
}
$rpc = Invoke-DiagnosticRpc @{
    jsonrpc = '2.0'; id = 2; method = 'tools/call'
    params = @{
        name = 'get_deployment'
        arguments = @{
            uuid = $DeploymentUuid; include_log_summary = $true; log_lines = $LogLines
        }
    }
}
if ($rpc.error -or $rpc.result.isError) {
    throw 'Coolify rechazó la consulta de diagnóstico; contenido omitido.'
}
$textBlock = $rpc.result.content | Where-Object { $_.type -eq 'text' } |
    Select-Object -First 1
$data = ($textBlock.text | ConvertFrom-Json).data
[PSCustomObject]@{
    Deployment = $data.deployment_uuid
    Status = $data.status
    Commit = $data.commit
    CreatedAt = $data.created_at
    FinishedAt = $data.finished_at
    LogsAvailable = $data.log_summary.available
    LogsTruncated = $data.log_summary.truncated
} | Format-List

foreach ($line in ([string]$data.log_summary.text -split '\r?\n')) {
    $safe = $line.Replace($diagToken, '[credential hidden]')
    # Never print credential assignments, authorization headers or connection URLs.
    if ($safe -match '(?i)(authorization|bearer\s|password|private.key|access.token|system.user.token|app.secret|encryption.key|database.url|better.auth.secret|verify.token|otp|\bpin\b|\b(?:ENV|ARG|export)\b.*=)') {
        Write-Output '[potentially sensitive line omitted]'
        continue
    }
    $safe = $safe -replace '(?i)https?://[^\s]+', '[URL omitted]'
    $safe = $safe -replace '[A-Za-z0-9_+/=-]{40,}', '[long value omitted]'
    Write-Output $safe
}

try {
    $publicHealth = Invoke-RestMethod -Uri 'https://alta.controlchats.com/api/health' `
        -Method Get -TimeoutSec 20
    [PSCustomObject]@{
        PublicHealth = $publicHealth.ok
        PublicVersion = $publicHealth.version
        PublicCommit = $publicHealth.commit
        CommitVerified = $publicHealth.commitVerified
    } | Format-List
} catch {
    Write-Output ('PUBLIC_HEALTH_FAILED status=' + $_.Exception.Response.StatusCode)
}
