# Script de prueba para el registro
Write-Host "=== Prueba de Registro ===" -ForegroundColor Cyan
Write-Host ""

# Datos de prueba
$testData = @{
    name = "Usuario Prueba"
    email = "prueba.test@tecmilenio.mx"
    password = "password123"
} | ConvertTo-Json

Write-Host "Enviando solicitud de registro..." -ForegroundColor Yellow
Write-Host "Datos: $testData" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri 'http://localhost:5000/api/auth/register' `
        -Method POST `
        -Body $testData `
        -ContentType 'application/json'
    
    Write-Host "✅ Registro exitoso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Respuesta del servidor:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 5
    
    if ($response.email_sent) {
        Write-Host ""
        Write-Host "✅ Email enviado correctamente" -ForegroundColor Green
        Write-Host "Revisa el correo: $($testData | ConvertFrom-Json | Select-Object -ExpandProperty email)" -ForegroundColor Yellow
    } else {
        Write-Host ""
        Write-Host "⚠️  Email NO se pudo enviar" -ForegroundColor Yellow
        Write-Host "Error: $($response.email_error)" -ForegroundColor Red
        if ($response.verification_code) {
            Write-Host "Código de verificación (desarrollo): $($response.verification_code)" -ForegroundColor Cyan
        }
    }
} catch {
    Write-Host "❌ Error al registrar:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host ""
        Write-Host "Detalles:" -ForegroundColor Yellow
        $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json
    }
}

Write-Host ""
Write-Host "=== Fin de la prueba ===" -ForegroundColor Cyan
