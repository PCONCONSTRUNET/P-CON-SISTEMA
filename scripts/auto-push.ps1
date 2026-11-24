Write-Host "Iniciando o sincronizador automático de código (Auto-Push para o GitHub)..."
Write-Host "Pressione Ctrl+C para parar."

while ($true) {
    # Verifica se há alguma alteração no repositório
    $status = git status --porcelain
    if ($status) {
        Write-Host "Mudanças detectadas! Fazendo commit e push..."
        git add .
        $date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        git commit -m "Auto-commit: $date"
        git push origin main
        Write-Host "Sincronizado com sucesso na nuvem!"
    }
    
    # Aguarda 15 segundos antes da próxima verificação
    Start-Sleep -Seconds 15
}
