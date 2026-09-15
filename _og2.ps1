Add-Type -AssemblyName System.Drawing
$dir = $PSScriptRoot
$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# 深色对角渐变背景
$rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
$c1 = [System.Drawing.ColorTranslator]::FromHtml("#1A1440")
$c2 = [System.Drawing.ColorTranslator]::FromHtml("#0C2B33")
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 35)
$g.FillRectangle($bgBrush, $rect)

# 柔光（径向渐变）
function Draw-Glow($cx, $cy, $r, $hex) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(($cx - $r), ($cy - $r), ($r * 2), ($r * 2))
    $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
    $col = [System.Drawing.ColorTranslator]::FromHtml($hex)
    $pgb.CenterColor = [System.Drawing.Color]::FromArgb(70, $col.R, $col.G, $col.B)
    $pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $col.R, $col.G, $col.B))
    $g.FillPath($pgb, $path)
    $path.Dispose(); $pgb.Dispose()
}
Draw-Glow 980 180 360 "#8B5CF6"
Draw-Glow 250 560 320 "#22D3EE"

# 透明人物（PNG）放右侧
$avatarPath = Join-Path $dir "hero-avatar-opt.png"
if (Test-Path $avatarPath) {
    $av = [System.Drawing.Image]::FromFile($avatarPath)
    $th = 560
    $tw = [int][Math]::Round($av.Width * $th / $av.Height)
    $ax = $W - $tw - 30
    $ay = $H - $th + 10
    $g.DrawImage($av, (New-Object System.Drawing.Rectangle($ax, $ay, $tw, $th)), 0, 0, $av.Width, $av.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $av.Dispose()
}

$json = [IO.File]::ReadAllText((Join-Path $dir "_og2.json"), [System.Text.Encoding]::UTF8) | ConvertFrom-Json

# 左侧装饰竖条（渐变）
$barRect = New-Object System.Drawing.Rectangle(92, 132, 8, 250)
$barBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($barRect, [System.Drawing.ColorTranslator]::FromHtml("#A78BFA"), [System.Drawing.ColorTranslator]::FromHtml("#22D3EE"), 90)
$g.FillRectangle($barBrush, $barRect)

$cyan = [System.Drawing.ColorTranslator]::FromHtml("#67E8F9")
$white = [System.Drawing.Brushes]::White
$gray = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(205, 200, 215, 235))
$labelFont = New-Object System.Drawing.Font("Arial", 22, [System.Drawing.FontStyle]::Bold)
$nameFont = New-Object System.Drawing.Font("Microsoft YaHei", 108, [System.Drawing.FontStyle]::Bold)
$roleFont = New-Object System.Drawing.Font("Microsoft YaHei", 40, [System.Drawing.FontStyle]::Regular)
$tagFont = New-Object System.Drawing.Font("Microsoft YaHei", 26, [System.Drawing.FontStyle]::Regular)
$lx = 128
$g.DrawString($json.label.ToUpper(), $labelFont, (New-Object System.Drawing.SolidBrush($cyan)), $lx, 150)
$g.DrawString($json.name, $nameFont, $white, $lx, 196)
$g.DrawString($json.role, $roleFont, (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 226, 222, 255))), $lx, 356)

# 底部三项标签：先测各项宽度，再把可用宽度的余量均分为间距，右边界锁在安全区，避免压到右侧人物/电脑
$tagY = 452
$tagRightLimit = 808
$n = $json.tags.Count
$widths = @()
$totalW = 0
foreach ($t in $json.tags) {
    $w = [int][Math]::Ceiling($g.MeasureString($t, $tagFont).Width)
    $widths += $w
    $totalW += $w
}
$gap = 0
if ($n -gt 1) { $gap = [Math]::Max(20, [int][Math]::Floor(($tagRightLimit - $lx - $totalW) / ($n - 1))) }
$tx = $lx
for ($i = 0; $i -lt $n; $i++) {
    $g.DrawString($json.tags[$i], $tagFont, $gray, $tx, $tagY)
    $tx += $widths[$i] + $gap
}

$out = Join-Path $dir "og-image.jpg"
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 90L)
$bmp.Save($out, $enc, $ep)
$g.Dispose(); $bmp.Dispose()
Write-Output ("og-image.jpg " + [int]((Get-Item $out).Length / 1KB) + "KB")
