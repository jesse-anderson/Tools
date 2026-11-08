# Saves every openpyxl fixture in data/dataset_diff/ through Microsoft Excel as
# XLSX, XLSM, XLSB, XLS and ODS, into data/dataset_diff/excel/<format>/.
# Excel is the writer people actually use, and it shares no code with the
# SheetJS reader under test. Needs Excel on Windows; the output is committed
# because Excel is not available everywhere. Excel stamps save times into the
# files, so a rerun is not byte-identical; fixtures.json, not the bytes, holds
# what each file must contain.
#
# Run from the repo root: powershell -NoProfile -File scripts/build-dataset-diff-formats.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'data\dataset_diff'
$formats = [ordered]@{ xlsx = 51; xlsm = 52; xlsb = 50; xls = 56; ods = 60 }

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
# Never run macros in a file this script opens.
$excel.AutomationSecurity = 3
try {
    foreach ($fmt in $formats.Keys) {
        New-Item -ItemType Directory -Force (Join-Path $src "excel\$fmt") | Out-Null
    }
    foreach ($file in Get-ChildItem $src -Filter *.xlsx) {
        # UpdateLinks 0, ReadOnly true.
        $wb = $excel.Workbooks.Open($file.FullName, 0, $true)
        foreach ($fmt in $formats.Keys) {
            $out = Join-Path $src ("excel\$fmt\" + [IO.Path]::GetFileNameWithoutExtension($file.Name) + ".$fmt")
            if (Test-Path $out) { Remove-Item $out }
            $wb.SaveAs($out, $formats[$fmt])
        }
        $wb.Close($false)
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb)
        Write-Output "saved $($file.Name)"
    }
    # Dates typed into cells as a person would, so Excel's own parsing decides
    # the stored serials that readDate must reproduce. Needs an en-US locale.
    if ((Get-Culture).Name -ne 'en-US') { throw 'Typed dates need the en-US locale (M/D/YYYY).' }
    New-Item -ItemType Directory -Force (Join-Path $src 'excel\typed') | Out-Null
    foreach ($typed in @(@('dates-typed', $false), @('dates-typed-1904', $true))) {
        $rows = Import-Csv (Join-Path $src "$($typed[0]).csv")
        $wb = $excel.Workbooks.Add()
        $wb.Date1904 = $typed[1]
        $ws = $wb.Worksheets.Item(1)
        $ws.Name = 'Typed'
        $ws.Cells.Item(1, 1).Value2 = 'Event'
        $ws.Cells.Item(1, 2).Value2 = 'When'
        $r = 2
        foreach ($row in $rows) {
            $ws.Cells.Item($r, 1).Value2 = $row.Event
            # Assigning Formula parses the text exactly as typing it would.
            $ws.Cells.Item($r, 2).Formula = $row.When
            $r++
        }
        $out = Join-Path $src "excel\typed\$($typed[0]).xlsx"
        if (Test-Path $out) { Remove-Item $out }
        $wb.SaveAs($out, 51)
        $wb.Close($false)
        Write-Output "typed $($typed[0]).xlsx"
    }
} finally {
    $excel.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
