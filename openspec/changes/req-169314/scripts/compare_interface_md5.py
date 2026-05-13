#!/usr/bin/env python3
"""
Compare old and optimized has-permission interface responses by canonical JSON MD5.

Example:
  python3 compare_interface_md5.py \
    --old-base-url https://test.example.com \
    --new-base-url http://localhost:9115 \
    --cases cases.sample.json \
    --header "Authorization: Bearer <token>"
"""

import argparse
import csv
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, List, Optional, Tuple


DEFAULT_DYNAMIC_FIELDS = {
    "traceId",
    "requestId",
    "timestamp",
    "cost",
    "costMs",
    "serverTime",
}

DEFAULT_PATH = "/meeting/api/v1/activity-director/team-inspire/has-permission"


def parse_header(value: str) -> Tuple[str, str]:
    if ":" not in value:
        raise ValueError(f"Invalid header '{value}', expected 'Name: value'")
    name, header_value = value.split(":", 1)
    return name.strip(), header_value.strip()


def parse_dot_path(path: str) -> Tuple[str, ...]:
    normalized = path.strip()
    if normalized.startswith("$."):
        normalized = normalized[2:]
    elif normalized == "$":
        normalized = ""
    return tuple(part for part in normalized.split(".") if part)


def load_cases(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as fp:
        data = json.load(fp)
    if isinstance(data, dict):
        data = data.get("cases", [])
    if not isinstance(data, list):
        raise ValueError("Cases file must be a JSON array or an object with a 'cases' array")
    return data


def build_url(base_url: str, case: Dict[str, Any]) -> str:
    base = base_url.rstrip("/")
    path = case.get("path") or DEFAULT_PATH
    query = case.get("query") or {}
    encoded = urllib.parse.urlencode(query, doseq=True)
    url = f"{base}{path if path.startswith('/') else '/' + path}"
    return f"{url}?{encoded}" if encoded else url


def request_json(
    base_url: str,
    case: Dict[str, Any],
    headers: Dict[str, str],
    timeout: int,
) -> Tuple[int, Any, int, Optional[str]]:
    url = build_url(base_url, case)
    method = (case.get("method") or "POST").upper()
    merged_headers = {
        "Content-Type": "application/json",
        **headers,
        **(case.get("headers") or {}),
    }
    body = case.get("body")
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=merged_headers, method=method)

    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            elapsed_ms = int((time.perf_counter() - start) * 1000)
            return resp.status, json.loads(raw) if raw else None, elapsed_ms, None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        try:
            body_json = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            body_json = raw
        return exc.code, body_json, elapsed_ms, None
    except Exception as exc:  # Keep comparison output structured even on connection failures.
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return 0, None, elapsed_ms, str(exc)


def make_sort_rules(case: Dict[str, Any]) -> Dict[Tuple[str, ...], List[str]]:
    rules: Dict[Tuple[str, ...], List[str]] = {}
    for item in case.get("sortArraysBy") or []:
        path = parse_dot_path(item["path"])
        keys = item.get("keys") or []
        if not keys:
            raise ValueError(f"sortArraysBy rule for {item['path']} must include keys")
        rules[path] = keys
    return rules


def sort_key_for(keys: List[str], item: Any) -> Tuple[str, ...]:
    if not isinstance(item, dict):
        return (json.dumps(item, ensure_ascii=False, sort_keys=True),)
    return tuple("" if item.get(key) is None else str(item.get(key)) for key in keys)


def canonicalize(
    value: Any,
    ignore_fields: Iterable[str],
    sort_rules: Dict[Tuple[str, ...], List[str]],
    path: Tuple[str, ...] = (),
) -> Any:
    ignore_set = set(ignore_fields)
    if isinstance(value, dict):
        return {
            key: canonicalize(value[key], ignore_set, sort_rules, path + (key,))
            for key in sorted(value.keys())
            if key not in ignore_set
        }
    if isinstance(value, list):
        items = [canonicalize(item, ignore_set, sort_rules, path) for item in value]
        if path in sort_rules:
            keys = sort_rules[path]
            return sorted(items, key=lambda item: sort_key_for(keys, item))
        return items
    return value


def md5_of(value: Any) -> Tuple[str, str]:
    canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.md5(canonical.encode("utf-8")).hexdigest(), canonical


def diff_json(old: Any, new: Any, path: str = "$") -> List[Dict[str, Any]]:
    if type(old) is not type(new):
        return [{"path": path, "old": old, "new": new}]
    if isinstance(old, dict):
        diffs: List[Dict[str, Any]] = []
        for key in sorted(set(old.keys()) | set(new.keys())):
            child_path = f"{path}.{key}"
            if key not in old:
                diffs.append({"path": child_path, "old": "<missing>", "new": new[key]})
            elif key not in new:
                diffs.append({"path": child_path, "old": old[key], "new": "<missing>"})
            else:
                diffs.extend(diff_json(old[key], new[key], child_path))
        return diffs
    if isinstance(old, list):
        diffs = []
        max_len = max(len(old), len(new))
        for index in range(max_len):
            child_path = f"{path}[{index}]"
            if index >= len(old):
                diffs.append({"path": child_path, "old": "<missing>", "new": new[index]})
            elif index >= len(new):
                diffs.append({"path": child_path, "old": old[index], "new": "<missing>"})
            else:
                diffs.extend(diff_json(old[index], new[index], child_path))
        return diffs
    return [] if old == new else [{"path": path, "old": old, "new": new}]


def write_csv(path: str, rows: List[Dict[str, Any]]) -> None:
    fields = [
        "caseId",
        "teamId",
        "thirdActivityId",
        "scenario",
        "oldStatus",
        "newStatus",
        "oldMd5",
        "newMd5",
        "oldCostMs",
        "newCostMs",
        "match",
        "diffPath",
        "oldError",
        "newError",
    ]
    with open(path, "w", encoding="utf-8", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare interface responses by canonical JSON MD5")
    parser.add_argument("--old-base-url", required=True, help="Base URL for test environment with old logic")
    parser.add_argument("--new-base-url", required=True, help="Base URL for local environment with optimized logic")
    parser.add_argument("--cases", required=True, help="JSON file containing request cases")
    parser.add_argument("--timeout", type=int, default=15)
    parser.add_argument("--header", action="append", default=[], help="Common HTTP header, e.g. 'Authorization: Bearer xxx'")
    parser.add_argument("--ignore-field", action="append", default=[], help="Additional dynamic field name to ignore")
    parser.add_argument("--output", default="interface-md5-compare.csv", help="CSV output path")
    parser.add_argument("--max-diff", type=int, default=20, help="Maximum diff paths printed per mismatched case")
    args = parser.parse_args()

    headers = dict(parse_header(header) for header in args.header)
    ignore_fields = set(DEFAULT_DYNAMIC_FIELDS) | set(args.ignore_field)
    rows: List[Dict[str, Any]] = []
    all_match = True

    for case in load_cases(args.cases):
        case_id = case.get("caseId") or case.get("name") or "<unnamed>"
        sort_rules = make_sort_rules(case)

        old_status, old_body, old_cost, old_error = request_json(args.old_base_url, case, headers, args.timeout)
        new_status, new_body, new_cost, new_error = request_json(args.new_base_url, case, headers, args.timeout)

        old_canon = canonicalize(old_body, ignore_fields, sort_rules)
        new_canon = canonicalize(new_body, ignore_fields, sort_rules)
        old_md5, _ = md5_of(old_canon)
        new_md5, _ = md5_of(new_canon)
        diffs = diff_json(old_canon, new_canon) if old_md5 != new_md5 else []
        match = old_status == new_status and old_error == new_error and old_md5 == new_md5
        all_match = all_match and match

        row = {
            "caseId": case_id,
            "teamId": (case.get("query") or {}).get("teamId", ""),
            "thirdActivityId": (case.get("query") or {}).get("thirdActivityId", ""),
            "scenario": case.get("scenario", ""),
            "oldStatus": old_status,
            "newStatus": new_status,
            "oldMd5": old_md5,
            "newMd5": new_md5,
            "oldCostMs": old_cost,
            "newCostMs": new_cost,
            "match": str(match).lower(),
            "diffPath": ";".join(diff["path"] for diff in diffs[: args.max_diff]),
            "oldError": old_error or "",
            "newError": new_error or "",
        }
        rows.append(row)

        print(
            f"{case_id}: match={match} oldStatus={old_status} newStatus={new_status} "
            f"oldMd5={old_md5} newMd5={new_md5} oldCostMs={old_cost} newCostMs={new_cost}"
        )
        for diff in diffs[: args.max_diff]:
            print(f"  diff {diff['path']}: old={diff['old']!r} new={diff['new']!r}")

    write_csv(args.output, rows)
    print(f"Wrote {args.output}")
    return 0 if all_match else 1


if __name__ == "__main__":
    sys.exit(main())
