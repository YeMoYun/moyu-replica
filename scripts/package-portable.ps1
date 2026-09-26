$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'package.json') | ConvertFrom-Json
$version = [string]$packageJson.version
$folderName = "MoYuMaster-$version-win-x64"
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'release'))
$portableDir = [IO.Path]::GetFullPath((Join-Path $releaseRoot $folderName))
$zipPath = [IO.Path]::GetFullPath((Join-Path $releaseRoot "$folderName.zip"))
$builderRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot '.artifacts\electron-builder'))
$unpackedDir = [IO.Path]::GetFullPath((Join-Path $builderRoot 'win-unpacked'))
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot '.artifacts\qtscrcpy-custom-runtime'))

if ($env:OS -ne 'Windows_NT') { throw '只能在 Windows 上生成便携版' }
if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [Runtime.InteropServices.Architecture]::X64) { throw '只能在 Windows x64 环境生成此发布包' }

Push-Location $repoRoot
try {
  $dirty = @(git status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw '无法读取 Git 状态' }
  if ($dirty.Count) { throw "工作区不干净，拒绝生成发布包：`n$($dirty -join "`n")" }
  $commit = (git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw '无法读取 Git 提交' }

  $requiredSourceFiles = @(
    'QtScrcpy.exe',
    'adb.exe',
    'scrcpy-server',
    'platforms\qwindows.dll',
    'LICENSE-QtScrcpy.txt'
  )
  foreach ($relative in $requiredSourceFiles) {
    $candidate = Join-Path $runtimeRoot $relative
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "QtScrcpy 运行库缺少：$candidate" }
  }
  foreach ($sourceLicense in @('native\QtScrcpy\LICENSE', 'native\QtScrcpy\UPSTREAM.md', 'build\使用说明.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $sourceLicense) -PathType Leaf)) { throw "发布文件缺少：$sourceLicense" }
  }

  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'electron-vite build 失败' }
  npx electron-builder --win --x64 --dir --config electron-builder.yml
  if ($LASTEXITCODE -ne 0) { throw 'electron-builder 失败' }

  $requiredPackagedFiles = @(
    '摸鱼大师.exe',
    '使用说明.txt',
    'resources\app.asar',
    'resources\qtscrcpy\QtScrcpy.exe',
    'resources\qtscrcpy\adb.exe',
    'resources\qtscrcpy\scrcpy-server',
    'resources\qtscrcpy\platforms\qwindows.dll',
    'resources\licenses\QtScrcpy-LICENSE.txt',
    'resources\licenses\QtScrcpy-UPSTREAM.md',
    'resources\licenses\QtScrcpy-runtime-license.txt'
  )
  foreach ($relative in $requiredPackagedFiles) {
    $candidate = Join-Path $unpackedDir $relative
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "打包目录缺少：$candidate" }
  }
  $debugFiles = @(Get-ChildItem -LiteralPath $unpackedDir -Recurse -File | Where-Object { $_.Extension -in @('.pdb', '.lib') })
  if ($debugFiles.Count) { throw "打包目录包含调试文件：$($debugFiles.FullName -join ', ')" }

  New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
  $releasePrefix = $releaseRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  foreach ($target in @($portableDir, $zipPath, (Join-Path $releaseRoot 'SHA256SUMS.txt'), (Join-Path $releaseRoot 'package-manifest.txt'))) {
    $fullTarget = [IO.Path]::GetFullPath($target)
    if (-not $fullTarget.StartsWith($releasePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "拒绝操作发布目录之外的路径：$fullTarget" }
    if (Test-Path -LiteralPath $fullTarget) { Remove-Item -LiteralPath $fullTarget -Recurse -Force }
  }

  Copy-Item -LiteralPath $unpackedDir -Destination $portableDir -Recurse
  Compress-Archive -LiteralPath $portableDir -DestinationPath $zipPath -CompressionLevel Optimal
  $sha256 = [Security.Cryptography.SHA256]::Create()
  $zipStream = [IO.File]::OpenRead($zipPath)
  try {
    $hash = ([BitConverter]::ToString($sha256.ComputeHash($zipStream)) -replace '-', '').ToUpperInvariant()
  } finally {
    $zipStream.Dispose()
    $sha256.Dispose()
  }
  "$hash *$folderName.zip" | Set-Content -LiteralPath (Join-Path $releaseRoot 'SHA256SUMS.txt') -Encoding ascii
  $fileCount = @(Get-ChildItem -LiteralPath $portableDir -Recurse -File).Count
  $zipBytes = (Get-Item -LiteralPath $zipPath).Length
  @(
    'Product=MoYuMaster',
    "Version=$version",
    'Platform=Windows',
    'Architecture=x64',
    "GitCommit=$commit",
    "GeneratedAt=$([DateTimeOffset]::Now.ToString('o'))",
    "PortableFileCount=$fileCount",
    "ZipBytes=$zipBytes",
    "ZipSha256=$hash"
  ) | Set-Content -LiteralPath (Join-Path $releaseRoot 'package-manifest.txt') -Encoding utf8
  Write-Host "便携版已生成：$zipPath"
  Write-Host "SHA256：$hash"
} finally {
  Pop-Location
}
