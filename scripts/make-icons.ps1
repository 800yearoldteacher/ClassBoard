# ClassBoard 앱 아이콘 만들기 (Windows 기본 그래픽 기능만 씁니다)
# 실행: powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1
# 결과: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'public\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function New-Icon([int]$size, [string]$file, [bool]$maskable) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(255, 20, 24, 28))

    # 칠판(16:9). 가리개 모양 아이콘은 가운데 80% 안에 들어가도록 더 작게 그립니다.
    $scale = if ($maskable) { 0.62 } else { 0.80 }
    $bw = $size * $scale
    $bh = $bw * 9 / 16
    $bx = ($size - $bw) / 2
    $by = ($size - $bh) / 2
    $board = [System.Drawing.Color]::FromArgb(255, 29, 59, 47)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $board), [float]$bx, [float]$by, [float]$bw, [float]$bh)
    $frame = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 120, 90, 60)), ([float]($size * 0.018))
    $g.DrawRectangle($frame, [float]$bx, [float]$by, [float]$bw, [float]$bh)

    # 분필 글씨 같은 물결선
    $chalk = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([float]($size * 0.035))
    $chalk.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $chalk.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pts = @(
        (New-Object System.Drawing.PointF ([float]($bx + $bw * 0.14)), ([float]($by + $bh * 0.62))),
        (New-Object System.Drawing.PointF ([float]($bx + $bw * 0.32)), ([float]($by + $bh * 0.30))),
        (New-Object System.Drawing.PointF ([float]($bx + $bw * 0.50)), ([float]($by + $bh * 0.70))),
        (New-Object System.Drawing.PointF ([float]($bx + $bw * 0.68)), ([float]($by + $bh * 0.34)))
    )
    $g.DrawCurve($chalk, $pts, 0.6)

    # 레이저 점
    $r = $size * 0.045
    $cx = $bx + $bw * 0.80
    $cy = $by + $bh * 0.58
    $glow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 255, 70, 70))
    $g.FillEllipse($glow, [float]($cx - $r * 2), [float]($cy - $r * 2), [float]($r * 4), [float]($r * 4))
    $dot = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 80, 80))
    $g.FillEllipse($dot, [float]($cx - $r), [float]($cy - $r), [float]($r * 2), [float]($r * 2))

    $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

New-Icon 192 'icon-192.png' $false
New-Icon 512 'icon-512.png' $false
New-Icon 512 'icon-maskable-512.png' $true
Write-Output "아이콘을 만들었습니다: $out"
