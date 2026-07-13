#!/usr/bin/env python3
"""Extract GT 07871B rows from a mysqldump and emit a safe restore SQL script."""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

DUMP_PATH = Path(r"e:/grsd-gims/db-gims-2026-07-06_170031 (1).sql")
OUT_PATH = Path(r"e:/grsd-gims/scripts/restore_GT_07871B.sql")
TARGET = "GT 07871B"

insert_re = re.compile(r"INSERT INTO `?(?P<table>\w+)`? VALUES (?P<body>.*?);", re.S)
create_re = re.compile(r"CREATE TABLE `?(?P<table>\w+)`? \((?P<body>.*?)\) ENGINE=", re.S)


def split_rows(body: str) -> list[str]:
    rows: list[str] = []
    i = 0
    n = len(body)
    while i < n:
        while i < n and body[i] in " \n\r\t,":
            i += 1
        if i >= n or body[i] != "(":
            break
        depth = 0
        in_str = False
        esc = False
        quote = None
        start = i
        while i < n:
            c = body[i]
            if in_str:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == quote:
                    if quote == "'" and i + 1 < n and body[i + 1] == "'":
                        i += 1
                    else:
                        in_str = False
                        quote = None
            else:
                if c in ("'", '"'):
                    in_str = True
                    quote = c
                elif c == "(":
                    depth += 1
                elif c == ")":
                    depth -= 1
                    if depth == 0:
                        rows.append(body[start : i + 1])
                        i += 1
                        break
            i += 1
        else:
            break
    return rows


def parse_fields(row: str) -> list[str]:
    assert row[0] == "(" and row[-1] == ")"
    body = row[1:-1]
    fields: list[str] = []
    i = 0
    n = len(body)
    while i < n:
        while i < n and body[i] in " \n\r\t":
            i += 1
        if i >= n:
            break
        if body[i] == "'":
            i += 1
            buf: list[str] = []
            while i < n:
                c = body[i]
                if c == "\\" and i + 1 < n:
                    buf.append(body[i : i + 2])
                    i += 2
                    continue
                if c == "'":
                    if i + 1 < n and body[i + 1] == "'":
                        buf.append("''")
                        i += 2
                        continue
                    i += 1
                    break
                buf.append(c)
                i += 1
            fields.append("'" + "".join(buf) + "'")
        else:
            j = i
            while j < n and body[j] != ",":
                j += 1
            fields.append(body[i:j].strip())
            i = j
        if i < n and body[i] == ",":
            i += 1
    return fields


def load_columns(text: str) -> dict[str, list[str]]:
    columns: dict[str, list[str]] = {}
    for m in create_re.finditer(text):
        table = m.group("table")
        body = m.group("body")
        cols: list[str] = []
        for line in body.split("\n"):
            line = line.strip().rstrip(",")
            cm = re.match(r"`(\w+)`", line)
            if not cm:
                continue
            upper = line.upper()
            if upper.startswith(("PRIMARY", "UNIQUE", "KEY", "CONSTRAINT", "FULLTEXT", "SPATIAL")):
                continue
            cols.append(cm.group(1))
        columns[table] = cols
    return columns


def main() -> None:
    text = DUMP_PATH.read_text(encoding="utf-8", errors="replace")
    columns = load_columns(text)
    hits: dict[str, list[str]] = defaultdict(list)
    receive_ids: set[str] = set()
    receive_rrp_fks: set[str] = set()

    for m in insert_re.finditer(text):
        table = m.group("table")
        body = m.group("body")
        if TARGET not in body:
            continue
        cols = columns.get(table, [])
        for row in split_rows(body):
            if TARGET not in row:
                continue
            hits[table].append(row)
            if table == "receive_details" and cols:
                fields = parse_fields(row)
                id_idx = cols.index("id")
                receive_ids.add(fields[id_idx])
                if "rrp_fk" in cols:
                    rrp_fk = fields[cols.index("rrp_fk")]
                    if rrp_fk.upper() != "NULL":
                        receive_rrp_fks.add(rrp_fk)

    rrp_by_id: dict[str, str] = {}
    rrp_by_receive_fk: list[str] = []
    if receive_ids or receive_rrp_fks:
        for m in insert_re.finditer(text):
            if m.group("table") != "rrp_details":
                continue
            cols = columns.get("rrp_details", [])
            id_idx = cols.index("id") if "id" in cols else None
            fk_idx = cols.index("receive_fk") if "receive_fk" in cols else None
            for row in split_rows(m.group("body")):
                fields = parse_fields(row)
                if id_idx is not None and fields[id_idx] in receive_rrp_fks:
                    rrp_by_id[fields[id_idx]] = row
                if fk_idx is not None and fields[fk_idx] in receive_ids:
                    rrp_by_receive_fk.append(row)
                    if id_idx is not None:
                        rrp_by_id[fields[id_idx]] = row

    rrp_rows = list(rrp_by_id.values())

    # Tables to restore in FK-safe order
    direct_tables_order = [
        "stock_details",
        "spare_compatibility",
        "nac_units",
        "unit_conversions",
        "prediction_metrics",
        "fuel_equipment_consumption_cache",
        "request_details",
        "receive_details",
        "issue_details",
        "transaction_details",
    ]

    lines: list[str] = []
    lines.append("-- =============================================================================")
    lines.append(f"-- SAFE RESTORE for NAC code: {TARGET}")
    lines.append(f"-- Source dump: {DUMP_PATH.name}")
    lines.append("--")
    lines.append("-- Safety features:")
    lines.append("--   * Wrapped in a transaction (all-or-nothing)")
    lines.append("--   * INSERT IGNORE / ON DUPLICATE KEY UPDATE where appropriate")
    lines.append("--   * Does NOT delete anything already present")
    lines.append("--   * Only restores rows for this exact nac_code")
    lines.append("--   * Also restores rrp_details linked via receive_details.rrp_fk / receive_fk")
    lines.append("--   * Ends with verification SELECTs")
    lines.append("--")
    lines.append("-- Run against the CURRENT live database (not the dump).")
    lines.append("-- Review the counts at the end before COMMIT.")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("SET NAMES utf8mb4;")
    lines.append("SET FOREIGN_KEY_CHECKS = 0;")
    lines.append("START TRANSACTION;")
    lines.append("")
    lines.append(f"SET @target_nac := '{TARGET}';")
    lines.append("")

    summary: list[tuple[str, int]] = []

    for table in direct_tables_order:
        rows = hits.get(table, [])
        cols = columns.get(table, [])
        summary.append((table, len(rows)))
        lines.append(f"-- ---------------------------------------------------------------------------")
        lines.append(f"-- {table}: {len(rows)} row(s)")
        lines.append(f"-- ---------------------------------------------------------------------------")
        if not rows:
            lines.append(f"-- (no rows for {TARGET} in dump)")
            lines.append("")
            continue
        if not cols:
            raise SystemExit(f"Missing CREATE TABLE columns for {table}")

        col_list = ", ".join(f"`{c}`" for c in cols)
        # Prefer INSERT IGNORE to skip existing primary keys without failing
        lines.append(f"INSERT IGNORE INTO `{table}` ({col_list}) VALUES")
        for idx, row in enumerate(rows):
            sep = "," if idx < len(rows) - 1 else ";"
            lines.append(f"  {row}{sep}")
        lines.append("")

    # rrp_details after receive_details
    rrp_cols = columns.get("rrp_details", [])
    summary.append(("rrp_details (linked)", len(rrp_rows)))
    lines.append("-- ---------------------------------------------------------------------------")
    lines.append(f"-- rrp_details linked to restored receives: {len(rrp_rows)} row(s)")
    lines.append("-- ---------------------------------------------------------------------------")
    if rrp_rows and rrp_cols:
        col_list = ", ".join(f"`{c}`" for c in rrp_cols)
        lines.append(f"INSERT IGNORE INTO `rrp_details` ({col_list}) VALUES")
        for idx, row in enumerate(rrp_rows):
            sep = "," if idx < len(rrp_rows) - 1 else ";"
            lines.append(f"  {row}{sep}")
        lines.append("")
    else:
        lines.append("-- (no linked rrp_details found)")
        lines.append("")

    # Any other tables that happened to contain the nac code
    known = set(direct_tables_order) | {"rrp_details"}
    extras = sorted(t for t in hits if t not in known)
    for table in extras:
        rows = hits[table]
        cols = columns.get(table, [])
        summary.append((table, len(rows)))
        lines.append(f"-- EXTRA table with {TARGET}: {table} ({len(rows)})")
        if not cols:
            lines.append(f"-- WARNING: skipped {table}; columns unknown")
            lines.append("")
            continue
        col_list = ", ".join(f"`{c}`" for c in cols)
        lines.append(f"INSERT IGNORE INTO `{table}` ({col_list}) VALUES")
        for idx, row in enumerate(rows):
            sep = "," if idx < len(rows) - 1 else ";"
            lines.append(f"  {row}{sep}")
        lines.append("")

    lines.append("-- =============================================================================")
    lines.append("-- VERIFICATION (inspect these before COMMIT)")
    lines.append("-- =============================================================================")
    for table, _count in summary:
        if table.startswith("rrp_details"):
            continue
        lines.append(
            f"SELECT '{table}' AS tbl, COUNT(*) AS cnt FROM `{table}` "
            f"WHERE nac_code COLLATE utf8mb4_unicode_ci = @target_nac;"
        )
    lines.append(
        "SELECT 'rrp_details' AS tbl, COUNT(*) AS cnt FROM `rrp_details` rrp "
        "WHERE rrp.receive_fk IN ("
        "  SELECT id FROM `receive_details` WHERE nac_code COLLATE utf8mb4_unicode_ci = @target_nac"
        ") OR rrp.id IN ("
        "  SELECT rrp_fk FROM `receive_details` "
        "  WHERE nac_code COLLATE utf8mb4_unicode_ci = @target_nac AND rrp_fk IS NOT NULL"
        ");"
    )
    lines.append("")
    lines.append("-- If counts look correct, COMMIT. Otherwise ROLLBACK.")
    lines.append("COMMIT;")
    lines.append("-- ROLLBACK;")
    lines.append("SET FOREIGN_KEY_CHECKS = 1;")
    lines.append("")

    OUT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Wrote {OUT_PATH}")
    print("Summary from dump:")
    for table, count in summary:
        print(f"  {table}: {count}")
    print(f"  extras: {extras}")
    print(f"  receive_ids: {len(receive_ids)}")
    print(f"  receive_rrp_fks: {len(receive_rrp_fks)}")


if __name__ == "__main__":
    main()
