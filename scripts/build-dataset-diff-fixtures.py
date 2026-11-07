"""Write the Dataset Diff fixtures into data/dataset_diff/.

Workbooks come from openpyxl, which shares no code with the SheetJS reader the
tool uses. openpyxl cannot write some of what the cases need, so the saved
sheet XML is patched afterward:
  - floats are written to 16 significant digits (0.1 + 0.2 becomes 0.3), so
    every float cell is rewritten with its exact shortest round-trip value;
  - a formula is written with an empty cached result, so cached results are
    injected and an unresolved formula has its <v> removed;
  - an empty string is written as a cell with no string, so it gets one;
  - strings are inline, while Excel uses a shared string table, so every file
    but one is converted to shared strings.

Expected outcomes in fixtures.json are written by hand in CASES below and are
never computed from the files. Run: python -I scripts/build-dataset-diff-fixtures.py
"""

import io
import json
import re
import sys
import zipfile
from datetime import datetime
from pathlib import Path

import openpyxl
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from openpyxl.utils.datetime import CALENDAR_MAC_1904, to_excel

OUT = Path(__file__).resolve().parent.parent / 'data' / 'dataset_diff'
FIXED_TIME = datetime(2026, 1, 1)
ZIP_TIME = (2026, 1, 1, 0, 0, 0)


class Err:
    """A typed workbook error cell."""
    def __init__(self, code):
        self.code = code


class Formula:
    """A formula with a cached result, or with none when cached is None."""
    def __init__(self, text, cached):
        self.text = text
        self.cached = cached


class Text:
    """Text that openpyxl would otherwise reinterpret (error codes, '')."""
    def __init__(self, value):
        self.value = value


# ---------------------------------------------------------------- workbooks

def sheet(name, rows, formats=None, hidden=False, hidden_rows=(), hidden_cols=(),
          merges=(), styled_empty=()):
    return {'name': name, 'rows': rows, 'formats': formats or {}, 'hidden': hidden,
            'hidden_rows': hidden_rows, 'hidden_cols': hidden_cols, 'merges': merges,
            'styled_empty': styled_empty}


PARTS = [['Part', 'Location', 'Qty'],
         ['00123', 'North', 10],
         ['00456', 'South', 20],
         ['00123', 'North', 10]]

PARTS_VARIANTS = {
    'Same': PARTS,
    'RowsSwapped': [PARTS[0], PARTS[2], PARTS[1], PARTS[3]],
    'CopyRemoved': PARTS[:3],
    'QtyChanged': [PARTS[0], PARTS[1], ['00456', 'South', 21], PARTS[3]],
    'ColumnsReordered': [['Qty', 'Part', 'Location']] + [[r[2], r[0], r[1]] for r in PARTS[1:]],
    'QtyRenamed': [['Part', 'Location', 'Quantity']] + PARTS[1:],
    'PartAsNumber': [PARTS[0], [123, 'North', 10], [456, 'South', 20], [123, 'North', 10]],
}

DATE = 'm/d/yyyy'
DATES_ROWS = [['Event', 'When'], ['Kickoff', 46000], ['Review', 46000], ['Leap', 60], ['Noon', 45000.5]]
DATES_FMT = {'B2': DATE, 'B3': 'yyyy-mm-dd', 'B4': DATE, 'B5': 'm/d/yyyy h:mm'}
CAL_1900 = [['Event', 'When'], ['Kickoff', 46000], ['Review', 46000], ['Noon', 45000.5]]
# The same calendar dates in the 1904 system are 1462 lower.
CAL_1904 = [['Event', 'When'], ['Kickoff', 44538], ['Review', 44538], ['Noon', 43538.5]]
CAL_FMT = {'B2': DATE, 'B3': DATE, 'B4': 'm/d/yyyy h:mm'}

WORKBOOKS = {
    'parts-left.xlsx': {'sheets': [sheet('Parts', PARTS)]},
    'parts-right.xlsx': {'sheets': [sheet(n, r) for n, r in PARTS_VARIANTS.items()]},
    'three-pairs-left.xlsx': {'sheets': [
        sheet('Orders', [['OrderID', 'Customer', 'Amount'], ['A-100', 'Acme', 250.5],
                         ['A-101', 'Birch', 99.99], ['A-102', 'Cobalt', 1200]]),
        sheet('Stock', [['SKU', 'Bin', 'OnHand'], ['S-1', 'B1', 5], ['S-2', 'B2', 0],
                        ['S-3', 'B3', 12], ['S-4', 'B1', 7]]),
        sheet('Prices', [['Item', 'Price'], ['Bolt', 0.25], ['Nut', 0.1], ['Washer', 0.05]]),
        sheet('Archive', [['Year', 'Total'], [2024, 10]]),
        sheet('Notes', [['Note'], ['internal']], hidden=True),
    ]},
    'three-pairs-right.xlsx': {'sheets': [
        sheet('Orders', [['OrderID', 'Customer', 'Amount'], ['A-100', 'Acme', 250.5],
                         ['A-101', 'Birch', 99.99], ['A-102', 'Cobalt', 1200]]),
        sheet('Stock', [['SKU', 'Bin', 'OnHand'], ['S-4', 'B1', 7], ['S-3', 'B3', 12],
                        ['S-2', 'B2', 0], ['S-1', 'B1', 5]]),
        sheet('Prices', [['Item', 'Price'], ['Bolt', 0.25], ['Nut', 0.12], ['Washer', 0.05]]),
        sheet('Summary', [['Pairs'], [3]]),
    ]},
    'display-left.xlsx': {'sheets': [sheet(
        'Readings', [['Tag', 'Value'], ['T1', 1.234], ['T2', 1], ['T3', 0.1 + 0.2]],
        formats={'B2': '0.00', 'B3': '0'})]},
    'display-right.xlsx': {'sheets': [sheet(
        'Readings', [['Tag', 'Value'], ['T1', 1.233], ['T2', 1], ['T3', 0.3]],
        formats={'B2': '0.00', 'B3': '0.000'})]},
    'dates-1900.xlsx': {'sheets': [sheet('Dates', DATES_ROWS, DATES_FMT),
                                   sheet('Calendar', CAL_1900, CAL_FMT)]},
    'dates-1904.xlsx': {'epoch1904': True,
                        'sheets': [sheet('Dates', DATES_ROWS, DATES_FMT),
                                   sheet('Calendar', CAL_1904, CAL_FMT)]},
    'formulas-left.xlsx': {'sheets': [
        sheet('Totals', [['Item', 'Qty', 'Price', 'Total'],
                         ['Bolt', 4, 0.25, Formula('B2*C2', 1)],
                         ['Nut', 10, 0.1, Formula('B3*C3', 1)],
                         ['Washer', 3, 0.5, Formula('B4*C4', 1.5)]]),
        sheet('Unresolved', [['Item', 'Total'], ['Bolt', Formula('1+1', None)]]),
    ]},
    'formulas-right.xlsx': {'sheets': [
        sheet('Totals', [['Item', 'Qty', 'Price', 'Total'],
                         ['Bolt', 4, 0.25, 1],
                         ['Nut', 10, 0.1, 1],
                         ['Washer', 3, 0.5, Formula('C4*B4', 1.5)]]),
        sheet('Unresolved', [['Item', 'Total'], ['Bolt', 2]]),
    ]},
    'blanks-left.xlsx': {'sheets': [sheet(
        'Cells', [['Case', 'Value'],
                  ['blank-vs-empty', None],
                  ['text-vs-bool', 'TRUE'],
                  ['error-vs-text', Err('#N/A')],
                  ['space-vs-blank', '  '],
                  ['zero-signs', 0],
                  [None, None],
                  ['number-vs-text', 1]],
        styled_empty=('E20',))]},
    'blanks-right.xlsx': {'sheets': [sheet(
        'Cells', [['Case', 'Value'],
                  ['blank-vs-empty', Text('')],
                  ['text-vs-bool', True],
                  ['error-vs-text', Text('#N/A')],
                  ['space-vs-blank', None],
                  ['zero-signs', -0.0],
                  [None, None],
                  ['number-vs-text', '1']])]},
    # Kept on inline strings so both string paths in the reader are exercised.
    'layout.xlsx': {'inline': True, 'sheets': [
        sheet('Hidden', [['Part', 'Qty', 'Note'], ['P1', 1, 'a'], ['P2', 2, 'b'], ['P3', 3, 'c']],
              hidden_rows=(3,), hidden_cols=('C',)),
        sheet('MergedHeader', [['Readings', None], ['Tag', 'Value'], ['T1', 1], ['T2', 2]],
              merges=('A1:B1',)),
        sheet('HeaderOnly', [['Part', 'Qty']]),
    ]},
}


def build_workbook(spec):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    if spec.get('epoch1904'):
        wb.epoch = CALENDAR_MAC_1904
    wb.properties.created = FIXED_TIME
    wb.properties.modified = FIXED_TIME
    patches = {}
    for sh in spec['sheets']:
        ws = wb.create_sheet(sh['name'])
        sheet_patches = patches.setdefault(sh['name'], {})
        for r, row in enumerate(sh['rows'], 1):
            for c, value in enumerate(row, 1):
                ref = f'{get_column_letter(c)}{r}'
                if value is None:
                    continue
                cell = ws.cell(r, c)
                if isinstance(value, Err):
                    cell.value = value.code
                    cell.data_type = 'e'
                elif isinstance(value, Formula):
                    cell.value = '=' + value.text
                    sheet_patches[ref] = ('formula', value.cached)
                elif isinstance(value, Text):
                    cell.value = value.value
                    cell.data_type = 's'
                    if value.value == '':
                        sheet_patches[ref] = ('empty', None)
                else:
                    cell.value = value
                    if isinstance(value, float):
                        sheet_patches[ref] = ('float', value)
        for ref, fmt in sh['formats'].items():
            ws[ref].number_format = fmt
        for ref in sh['styled_empty']:
            ws[ref].font = Font(bold=True)
        for r in sh['hidden_rows']:
            ws.row_dimensions[r].hidden = True
        for col in sh['hidden_cols']:
            ws.column_dimensions[col].hidden = True
        for m in sh['merges']:
            ws.merge_cells(m)
        if sh['hidden']:
            ws.sheet_state = 'hidden'
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue(), patches


# ---------------------------------------------------------------- XML patches

def replace_once(text, pattern, repl, what):
    new, n = re.subn(pattern, repl, text, count=0)
    if n != 1:
        sys.exit(f'patch failed ({what}): matched {n} times')
    return new


def patch_sheet(xml, patches):
    for ref, (kind, value) in patches.items():
        cell = rf'<c r="{ref}"(?P<attrs>[^>]*)>'
        if kind == 'float':
            xml = replace_once(xml, cell + r'<v>[^<]*</v></c>',
                               lambda m: f'<c r="{ref}"{m["attrs"]}><v>{repr(value)}</v></c>', ref)
        elif kind == 'formula':
            body = '' if value is None else f'<v>{repr(value)}</v>'
            xml = replace_once(xml, cell + r'(?P<f><f>[^<]*</f>)<v></v></c>',
                               lambda m: f'<c r="{ref}"{m["attrs"]}>{m["f"]}{body}</c>', ref)
        elif kind == 'empty':
            xml = replace_once(xml, rf'<c r="{ref}"(?P<attrs>[^>]*) t="inlineStr"></c>',
                               lambda m: f'<c r="{ref}"{m["attrs"]} t="inlineStr"><is><t></t></is></c>', ref)
    return xml


INLINE = re.compile(r'<c r="(?P<ref>[A-Z]+\d+)"(?P<attrs>[^>]*) t="inlineStr"><is><t(?: xml:space="preserve")?>(?P<text>[^<]*)</t></is></c>')


def to_shared_strings(files, sheet_paths):
    """Move every inline string into xl/sharedStrings.xml, as Excel stores them."""
    table, index, count = [], {}, 0

    def swap(m):
        nonlocal count
        text = m['text']
        if text not in index:
            index[text] = len(table)
            table.append(text)
        count += 1
        return f'<c r="{m["ref"]}"{m["attrs"]} t="s"><v>{index[text]}</v></c>'

    for path in sheet_paths:
        files[path] = INLINE.sub(swap, files[path].decode()).encode()
        if 'inlineStr' in files[path].decode():
            sys.exit(f'inline string left in {path}')
    items = ''.join(f'<si><t xml:space="preserve">{t}</t></si>' for t in table)
    files['xl/sharedStrings.xml'] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        f'count="{count}" uniqueCount="{len(table)}">{items}</sst>').encode()
    rels = files['xl/_rels/workbook.xml.rels'].decode()
    files['xl/_rels/workbook.xml.rels'] = replace_once(
        rels, r'</Relationships>',
        '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
        'sharedStrings" Target="sharedStrings.xml" Id="rIdSharedStrings"/></Relationships>', 'rels').encode()
    types = files['[Content_Types].xml'].decode()
    files['[Content_Types].xml'] = replace_once(
        types, r'</Types>',
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/'
        'vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>', 'types').encode()


def finish_workbook(raw, spec, patches):
    src = zipfile.ZipFile(io.BytesIO(raw))
    order = [i.filename for i in src.infolist()]
    files = {name: src.read(name) for name in order}
    names = re.findall(r'<sheet [^>]*name="([^"]+)"', files['xl/workbook.xml'].decode())
    expected = [s['name'] for s in spec['sheets']]
    if names != expected:
        sys.exit(f'sheet order {names} != {expected}')
    sheet_paths = [f'xl/worksheets/sheet{i}.xml' for i in range(1, len(names) + 1)]
    for name, path in zip(names, sheet_paths):
        files[path] = patch_sheet(files[path].decode(), patches.get(name, {})).encode()
    if not spec.get('inline'):
        to_shared_strings(files, sheet_paths)
        order.append('xl/sharedStrings.xml')
    core = files['docProps/core.xml'].decode()
    core = re.sub(r'(<dcterms:(?:created|modified)[^>]*>)[^<]*', r'\g<1>2026-01-01T00:00:00Z', core)
    files['docProps/core.xml'] = core.encode()
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in order:
            info = zipfile.ZipInfo(name, ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, files[name])
    return out.getvalue()


# ---------------------------------------------------------------- CSV files

def csv_text(rows, bom=False):
    def field(v):
        s = str(v)
        if any(ch in s for ch in ',"\r\n'):
            s = '"' + s.replace('"', '""') + '"'
        return s
    body = ''.join(','.join(field(v) for v in row) + '\r\n' for row in rows)
    return ('﻿' if bom else '') + body


CSV_FILES = {'parts-left.csv': csv_text(PARTS)}
for _name, _rows in PARTS_VARIANTS.items():
    CSV_FILES[f'parts-right-{_name}.csv'] = csv_text(_rows)
# Written by hand as Excel would display these cells in a CSV save; simulated.
CSV_FILES['dates-excel-export-simulated.csv'] = (
    'Event,When\r\nKickoff,12/9/2025\r\nReview,2025-12-09\r\nLeap,2/29/1900\r\nNoon,3/15/2023 12:00\r\n')
CSV_FILES['quoted-newlines.csv'] = (
    'Part,Note\r\nP1,"line one\r\nline two"\r\nP2,"has ""quotes"", and a comma"\r\nP3,plain\r\n')
CSV_FILES['header-only.csv'] = 'Part,Qty\r\n'
CSV_FILES['ragged.csv'] = 'Part,Qty\r\nP1,1\r\nP2,2,extra\r\nP3\r\n'
CSV_FILES['bom-utf8.csv'] = csv_text([['Part', 'Name'], ['P1', 'Café'], ['P2', 'naïve']], bom=True)
CSV_FILES['literals.csv'] = 'Key,Value\r\na,NULL\r\nb,N/A\r\nc,NaN\r\nd,\r\n'


# ---------------------------------------------------------------- expectations

def counts(same, sorted_, left, right, matched, left_only, right_only, changed, **extra):
    out = {'sameOrder': same, 'sorted': sorted_, 'leftRows': left, 'rightRows': right,
           'matchedRows': matched, 'leftOnlyRows': left_only, 'rightOnlyRows': right_only,
           'changedCells': changed}
    out.update(extra)
    return out


PARTS_EXPECT = {
    'Same': counts('match', 'match', 3, 3, 3, 0, 0, 0),
    'RowsSwapped': counts('different', 'match', 3, 3, 3, 0, 0, 6),
    'CopyRemoved': counts('different', 'different', 3, 2, 2, 1, 0, 0, trailingLeftRows=1),
    'QtyChanged': counts('different', 'different', 3, 3, 2, 1, 1, 1),
    'ColumnsReordered': counts('match', 'match', 3, 3, 3, 0, 0, 0, columnOrderChanged=True),
    'QtyRenamed': {'schema': 'different', 'missingRight': ['Qty'], 'extraRight': ['Quantity'],
                   'sameOrder': 'unavailable', 'sorted': 'unavailable'},
    'PartAsNumber': counts('different', 'different', 3, 3, 0, 3, 3, 3,
                           leftOnlyPatterns=2, rightOnlyPatterns=2),
}

CASES = []
for _name, _expect in PARTS_EXPECT.items():
    CASES.append({'id': f'parts-{_name}-xlsx',
                  'left': {'file': 'parts-left.xlsx', 'sheet': 'Parts'},
                  'right': {'file': 'parts-right.xlsx', 'sheet': _name}, 'expect': _expect})
    CASES.append({'id': f'parts-{_name}-csv',
                  'left': {'file': 'parts-left.csv'},
                  'right': {'file': f'parts-right-{_name}.csv'}, 'expect': _expect})
CASES += [
    {'id': 'parts-mixed-format-match',
     'note': 'Nothing in this table is formatted, so a workbook and a CSV can still match.',
     'left': {'file': 'parts-left.xlsx', 'sheet': 'Parts'}, 'right': {'file': 'parts-right-Same.csv'},
     'expect': counts('match', 'match', 3, 3, 3, 0, 0, 0, mixedFormatWarning=True)},
    {'id': 'display-hides-decimal',
     'note': 'T1 shows 1.23 on both sides; T2 is one stored value shown two ways; T3 is 0.1+0.2 against 0.3.',
     'left': {'file': 'display-left.xlsx', 'sheet': 'Readings'},
     'right': {'file': 'display-right.xlsx', 'sheet': 'Readings'},
     'expect': counts('different', 'different', 3, 3, 1, 2, 2, 2)},
    {'id': 'dates-same-serials-different-systems',
     'left': {'file': 'dates-1900.xlsx', 'sheet': 'Dates'}, 'right': {'file': 'dates-1904.xlsx', 'sheet': 'Dates'},
     'expect': counts('match', 'match', 4, 4, 4, 0, 0, 0, dateSystems=['1900', '1904'])},
    {'id': 'dates-same-calendar-different-serials',
     'left': {'file': 'dates-1900.xlsx', 'sheet': 'Calendar'},
     'right': {'file': 'dates-1904.xlsx', 'sheet': 'Calendar'},
     'expect': counts('different', 'different', 3, 3, 0, 3, 3, 3, dateSystems=['1900', '1904'])},
    {'id': 'dates-simulated-csv-export',
     'note': 'The unsupported use case: Excel writes displayed text to CSV.',
     'left': {'file': 'dates-1900.xlsx', 'sheet': 'Dates'},
     'right': {'file': 'dates-excel-export-simulated.csv'},
     'expect': counts('different', 'different', 4, 4, 0, 4, 4, 4, mixedFormatWarning=True)},
    {'id': 'formula-caches-match-values',
     'left': {'file': 'formulas-left.xlsx', 'sheet': 'Totals'},
     'right': {'file': 'formulas-right.xlsx', 'sheet': 'Totals'},
     'expect': counts('match', 'match', 3, 3, 3, 0, 0, 0, leftFormulaCells=3, rightFormulaCells=1)},
    {'id': 'formula-unresolved',
     'left': {'file': 'formulas-left.xlsx', 'sheet': 'Unresolved'},
     'right': {'file': 'formulas-right.xlsx', 'sheet': 'Unresolved'},
     'expect': {'sameOrder': 'incomplete', 'sorted': 'incomplete',
                'reason': 'unresolved-formula', 'cells': ['Unresolved!B2']}},
    {'id': 'blanks-and-types',
     'note': 'Five rows differ by type or blankness; zero-signs and the all-blank row match.',
     'left': {'file': 'blanks-left.xlsx', 'sheet': 'Cells'},
     'right': {'file': 'blanks-right.xlsx', 'sheet': 'Cells'},
     'expect': counts('different', 'different', 7, 7, 2, 5, 5, 5)},
    {'id': 'header-only-mixed',
     'left': {'file': 'layout.xlsx', 'sheet': 'HeaderOnly'}, 'right': {'file': 'header-only.csv'},
     'expect': counts('match', 'match', 0, 0, 0, 0, 0, 0, mixedFormatWarning=True)},
]

PLANS = [
    {'id': 'three-pairs',
     'left': 'three-pairs-left.xlsx', 'right': 'three-pairs-right.xlsx',
     'pairs': [['Orders', 'Orders'], ['Stock', 'Stock'], ['Prices', 'Prices']],
     'excludedLeft': ['Archive', 'Notes'], 'excludedRight': ['Summary'],
     'expect': {
         'pairs': [counts('match', 'match', 3, 3, 3, 0, 0, 0),
                   counts('different', 'match', 4, 4, 4, 0, 0, 10),
                   counts('different', 'different', 3, 3, 2, 1, 1, 1)],
         'aggregate': {'sameOrder': 'different', 'sorted': 'different'},
         'hiddenSheets': {'left': ['Notes'], 'right': []}}},
    {'id': 'three-pairs-missing-sheet',
     'left': 'three-pairs-left.xlsx', 'right': 'three-pairs-right.xlsx',
     'pairs': [['Orders', 'Orders'], ['Archive', 'Archive']],
     'expect': {'aggregate': {'sameOrder': 'incomplete', 'sorted': 'incomplete'},
                'incompletePairs': [2], 'reason': 'missing-sheet'}},
]

IMPORTS = [
    {'file': 'blanks-left.xlsx', 'sheet': 'Cells', 'valueRange': 'A1:B8', 'refRange': 'A1:E20'},
    {'file': 'layout.xlsx', 'sheet': 'Hidden', 'valueRange': 'A1:C4', 'dataRows': 3,
     'hiddenRows': [3], 'hiddenColumns': ['C'], 'strings': 'inline'},
    {'file': 'layout.xlsx', 'sheet': 'MergedHeader', 'refused': 'merged-cells', 'mergedRanges': ['A1:B1'],
     'acceptedRange': 'A2:B4'},
    {'file': 'layout.xlsx', 'sheet': 'HeaderOnly', 'dataRows': 0},
    {'file': 'quoted-newlines.csv', 'dataRows': 3,
     'records': [{'record': 2, 'lines': [2, 3], 'Note': 'line one\r\nline two'},
                 {'record': 3, 'lines': [4, 4], 'Note': 'has "quotes", and a comma'}]},
    {'file': 'header-only.csv', 'dataRows': 0},
    {'file': 'ragged.csv', 'refused': 'ragged-rows',
     'errors': [{'record': 3, 'fields': 3}, {'record': 4, 'fields': 1}]},
    {'file': 'bom-utf8.csv', 'encoding': 'UTF-8 BOM', 'headers': ['Part', 'Name'],
     'values': ['Café', 'naïve']},
    {'file': 'literals.csv', 'columnTypes': {'Key': 'text', 'Value': 'text'},
     'values': ['NULL', 'N/A', 'NaN', None], 'note': 'Last Value is blank under the default Empty fields setting.'},
]


# ---------------------------------------------------------------- cell listing

def typed(value):
    """The stored value each cell must read back as, for the Phase 0b probe."""
    if value is None:
        return None
    if isinstance(value, Err):
        return ['e', value.code]
    if isinstance(value, Formula):
        return ['unresolved', value.text] if value.cached is None else ['n', value.cached]
    if isinstance(value, Text):
        return ['t', value.value]
    if isinstance(value, bool):
        return ['b', value]
    if isinstance(value, (int, float)):
        return ['n', value]
    return ['t', value]


def cell_listing():
    out = {}
    for fname, spec in WORKBOOKS.items():
        out[fname] = {
            'dateSystem': '1904' if spec.get('epoch1904') else '1900',
            'strings': 'inline' if spec.get('inline') else 'shared',
            'sheets': {s['name']: {'hidden': s['hidden'],
                                   'rows': [[typed(v) for v in row] for row in s['rows']]}
                       for s in spec['sheets']}}
    return out


# ---------------------------------------------------------------- checks

def check_workbook(fname, data, spec):
    """Reread with openpyxl and inspect raw XML for what the patches promised."""
    z = zipfile.ZipFile(io.BytesIO(data))
    joined = ''.join(z.read(n).decode() for n in z.namelist() if n.endswith('.xml'))
    wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    for s in spec['sheets']:
        ws = wb[s['name']]
        if (ws.sheet_state == 'hidden') != s['hidden']:
            sys.exit(f'{fname}!{s["name"]}: hidden state wrong')
        for r, row in enumerate(s['rows'], 1):
            for c, value in enumerate(row, 1):
                got = ws.cell(r, c).value
                if isinstance(got, datetime):
                    if value == 60 and not spec.get('epoch1904'):
                        continue  # openpyxl maps Excel's fictional 1900-02-29 to 59; raw XML check below
                    got = to_excel(got, wb.epoch)
                    if got == int(got):
                        got = int(got)
                if isinstance(value, Formula):
                    want = value.cached
                elif isinstance(value, Err):
                    want = value.code
                elif isinstance(value, Text):
                    want = value.value
                else:
                    want = value
                if value is not None and isinstance(value, Text) and value.value == '':
                    continue  # openpyxl reads a stored '' as None; the raw XML check covers it
                if type(got) is not type(want) and not (isinstance(want, float) and isinstance(got, int)):
                    if not (want is None and got is None):
                        sys.exit(f'{fname}!{s["name"]}!{get_column_letter(c)}{r}: {got!r} != {want!r}')
                if got != want or (isinstance(want, float) and repr(float(got)) != repr(want)):
                    sys.exit(f'{fname}!{s["name"]}!{get_column_letter(c)}{r}: {got!r} != {want!r}')
        for m in s['merges']:
            if m not in [str(x) for x in ws.merged_cells.ranges]:
                sys.exit(f'{fname}: merge {m} missing')
    needles = {
        'blanks-right.xlsx': ['<si><t xml:space="preserve"></t></si>',
                              '<si><t xml:space="preserve">#N/A</t></si>'],
        'blanks-left.xlsx': ['t="e"><v>#N/A</v>', '<dimension ref="A1:E20"/>'],
        'display-left.xlsx': ['<v>0.30000000000000004</v>'],
        'dates-1900.xlsx': ['<c r="B4" s="1" t="n"><v>60</v></c>'],
        'dates-1904.xlsx': ['date1904="1"'],
        'formulas-left.xlsx': ['<f>B2*C2</f><v>1</v>', '<f>B4*C4</f><v>1.5</v>', '<f>1+1</f></c>'],
        'three-pairs-left.xlsx': ['state="hidden"'],
        'layout.xlsx': ['<mergeCell ref="A1:B1"/>', 't="inlineStr"', 'hidden="1"'],
    }.get(fname, [])
    for needle in needles:
        if needle not in joined:
            sys.exit(f'{fname}: expected XML {needle!r} not found')
    if spec.get('epoch1904') != (wb.epoch == CALENDAR_MAC_1904) and spec.get('epoch1904'):
        sys.exit(f'{fname}: date system wrong')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for fname, spec in WORKBOOKS.items():
        raw, patches = build_workbook(spec)
        data = finish_workbook(raw, spec, patches)
        check_workbook(fname, data, spec)
        (OUT / fname).write_bytes(data)
    for fname, text in CSV_FILES.items():
        (OUT / fname).write_bytes(text.encode('utf-8'))
    manifest = {'version': 1,
                'generator': 'scripts/build-dataset-diff-fixtures.py',
                'openpyxl': openpyxl.__version__,
                'cases': CASES, 'plans': PLANS, 'imports': IMPORTS,
                'workbooks': cell_listing()}
    (OUT / 'fixtures.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n',
                                       encoding='utf-8', newline='\n')
    print(f'wrote {len(WORKBOOKS)} workbooks, {len(CSV_FILES)} CSV files, '
          f'{len(CASES)} cases, {len(PLANS)} plans, {len(IMPORTS)} import checks')


if __name__ == '__main__':
    main()
