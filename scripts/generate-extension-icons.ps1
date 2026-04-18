param(
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\icons')
)

Add-Type -AssemblyName System.Drawing

function New-RoundedPath {
  param(
    [System.Drawing.Rectangle]$Rect,
    [int]$Radius
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = [Math]::Max(1, $Radius * 2)
  $arc = [System.Drawing.Rectangle]::new($Rect.X, $Rect.Y, $diameter, $diameter)

  $path.AddArc($arc, 180, 90)
  $arc.X = $Rect.Right - $diameter
  $path.AddArc($arc, 270, 90)
  $arc.Y = $Rect.Bottom - $diameter
  $path.AddArc($arc, 0, 90)
  $arc.X = $Rect.X
  $path.AddArc($arc, 90, 90)
  $path.CloseFigure()

  return $path
}

function Draw-Icon {
  param(
    [int]$Size,
    [string]$Path
  )

  $bmp = [System.Drawing.Bitmap]::new($Size, $Size)
  $bmp.SetResolution(144, 144)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  try {
    $bgRect = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
    $bgPath = New-RoundedPath -Rect $bgRect -Radius ([Math]::Round($Size * 0.22))
    $bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      $bgRect,
      [System.Drawing.Color]::FromArgb(255, 7, 29, 51),
      [System.Drawing.Color]::FromArgb(255, 22, 119, 177),
      45
    )
    $blend = [System.Drawing.Drawing2D.ColorBlend]::new()
    $blend.Positions = @(0.0, 0.52, 1.0)
    $blend.Colors = @(
      [System.Drawing.Color]::FromArgb(255, 12, 38, 66),
      [System.Drawing.Color]::FromArgb(255, 18, 92, 153),
      [System.Drawing.Color]::FromArgb(255, 28, 147, 190)
    )
    $bgBrush.InterpolationColors = $blend
    $g.FillPath($bgBrush, $bgPath)

    $shineBrush = [System.Drawing.Drawing2D.PathGradientBrush]::new($bgPath)
    $shineBrush.CenterPoint = [System.Drawing.PointF]::new([single]($Size * 0.28), [single]($Size * 0.20))
    $shineBrush.CenterColor = [System.Drawing.Color]::FromArgb(95, 255, 255, 255)
    $shineBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
    $g.FillEllipse($shineBrush, [int]($Size * -0.06), [int]($Size * -0.06), [int]($Size * 0.55), [int]($Size * 0.55))

    $pad = [Math]::Round($Size * 0.16)
    $pageRect = [System.Drawing.Rectangle]::new($pad, [Math]::Round($Size * 0.12), ($Size - ($pad * 2)), [Math]::Round($Size * 0.76))
    $pageShadowRect = [System.Drawing.Rectangle]::new(($pageRect.X + [Math]::Round($Size * 0.03)), ($pageRect.Y + [Math]::Round($Size * 0.03)), $pageRect.Width, $pageRect.Height)
    $pageRadius = [Math]::Max(2, [Math]::Round($Size * 0.06))

    $shadowPath = New-RoundedPath -Rect $pageShadowRect -Radius $pageRadius
    $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(55, 0, 0, 0))
    $g.FillPath($shadowBrush, $shadowPath)

    $pagePath = New-RoundedPath -Rect $pageRect -Radius $pageRadius
    $pageBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 250, 252, 255))
    $pageBorder = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(70, 255, 255, 255), [Math]::Max(1, [Math]::Round($Size * 0.012)))
    $g.FillPath($pageBrush, $pagePath)
    $g.DrawPath($pageBorder, $pagePath)

    $fold = [Math]::Round($Size * 0.10)
    $corner = @(
      [System.Drawing.Point]::new($pageRect.Right - $fold, $pageRect.Y),
      [System.Drawing.Point]::new($pageRect.Right, $pageRect.Y),
      [System.Drawing.Point]::new($pageRect.Right, $pageRect.Y + $fold)
    )
    $cornerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 227, 239, 255))
    $cornerShadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
    $g.FillPolygon($cornerShadowBrush, @(
      [System.Drawing.Point]::new($corner[0].X + 1, $corner[0].Y + 1),
      [System.Drawing.Point]::new($corner[1].X + 1, $corner[1].Y + 1),
      [System.Drawing.Point]::new($corner[2].X + 1, $corner[2].Y + 1)
    ))
    $g.FillPolygon($cornerBrush, $corner)

    $foldEdge = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(90, 29, 78, 216), [Math]::Max(1, [Math]::Round($Size * 0.008)))
    $g.DrawLine($foldEdge, $corner[0].X, $corner[0].Y, $corner[2].X, $corner[2].Y)

    $lineLeft = $pageRect.X + [Math]::Round($Size * 0.11)
    $lineTop = $pageRect.Y + [Math]::Round($Size * 0.26)
    $lineHeight = [Math]::Max(1, [Math]::Round($Size * 0.045))
    $lineGap = [Math]::Round($Size * 0.085)
    $lineColors = @(
      [System.Drawing.Color]::FromArgb(255, 34, 111, 204),
      [System.Drawing.Color]::FromArgb(255, 240, 110, 83),
      [System.Drawing.Color]::FromArgb(255, 42, 185, 128)
    )
    $lineWidths = @(
      [Math]::Round($Size * 0.38),
      [Math]::Round($Size * 0.50),
      [Math]::Round($Size * 0.31)
    )

    for ($i = 0; $i -lt 3; $i++) {
      $barRect = [System.Drawing.Rectangle]::new($lineLeft, ($lineTop + ($lineGap * $i)), $lineWidths[$i], $lineHeight)
      $barBrush = [System.Drawing.SolidBrush]::new($lineColors[$i])
      $barPath = New-RoundedPath -Rect $barRect -Radius ([Math]::Max(1, [Math]::Round($lineHeight / 2)))
      $g.FillPath($barBrush, $barPath)
      $barPath.Dispose()
      $barBrush.Dispose()
    }

    $wavePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(230, 34, 197, 224), [Math]::Max(1, [Math]::Round($Size * 0.022)))
    $wavePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $wavePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $wavePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $waveY = $pageRect.Bottom - [Math]::Round($Size * 0.12)
    $waveX1 = $pageRect.X + [Math]::Round($Size * 0.12)
    $waveX2 = $pageRect.Right - [Math]::Round($Size * 0.15)
    $waveMidX = [Math]::Round(($waveX1 + $waveX2) / 2)
    $waveOffset = [Math]::Round($Size * 0.04)
    $g.DrawBezier(
      $wavePen,
      $waveX1, $waveY,
      $waveX1 + [Math]::Round($Size * 0.05), $waveY - $waveOffset,
      $waveMidX - [Math]::Round($Size * 0.04), $waveY + $waveOffset,
      $waveX2, $waveY - [Math]::Round($Size * 0.01)
    )

    $accent = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(80, 255, 255, 255))
    $g.FillEllipse($accent, [Math]::Round($Size * 0.10), [Math]::Round($Size * 0.08), [Math]::Round($Size * 0.20), [Math]::Round($Size * 0.14))
  }
  finally {
    $g.Dispose()
  }

  $dir = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$sizes = @(16, 32, 48, 128)
foreach ($size in $sizes) {
  $target = Join-Path $OutputDir ("icon$size.png")
  Draw-Icon -Size $size -Path $target
  Write-Host "Wrote $target"
}
