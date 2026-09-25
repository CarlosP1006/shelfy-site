"""Confere que schema/products.schema.json e as regras do site (js/catalog.js) concordam.

Uso: pip install jsonschema && python3 dev/test-schema.py
O publicador em Python vai validar com esta mesma biblioteca.
"""
import copy
import json
import subprocess
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
schema = json.loads((ROOT / "schema" / "products.schema.json").read_text(encoding="utf-8"))
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema)

cases = json.loads(subprocess.run(["node", "dev/schema-parity.mjs"], cwd=ROOT, check=True, capture_output=True).stdout)

mismatches = []
for index, case in enumerate(cases):
    if case["kind"] == "product":
        document = {"version": 1, "updatedAt": None, "products": [case["value"]]}
    else:
        document = {"version": 1, "updatedAt": case["value"], "products": []}
    schema_ok = validator.is_valid(document)
    if schema_ok != case["site"]:
        mismatches.append((index, case["kind"], case["value"], schema_ok, case["site"]))

for fixture, expected in [("data/products.json", True), ("dev/fixtures/empty.json", True), ("dev/fixtures/version2.json", False),
                          ("dev/fixtures/version-string.json", False), ("dev/fixtures/no-products.json", False),
                          ("dev/fixtures/products-object.json", False), ("dev/fixtures/array-root.json", False),
                          ("dev/fixtures/hostile.json", False), ("dev/products.sample.json", False)]:
    document = json.loads((ROOT / fixture).read_text(encoding="utf-8"))
    if validator.is_valid(document) != expected:
        mismatches.append(("arquivo", fixture, "", not expected, expected))

big = {"version": 1, "updatedAt": None, "products": [{"code": "P%04d" % n, "title": "t", "link": "https://a.bc/%d" % n} for n in range(1, 10002)]}
if validator.is_valid(big):
    mismatches.append(("arquivo", "10001 produtos", "", True, False))

for item in mismatches:
    print("DIVERGÊNCIA", item[:2], repr(item[2])[:120], "schema:", item[3], "site:", item[4])
print(f"{len(cases)} casos comparados, {len(mismatches)} divergência(s)")
sys.exit(1 if mismatches else 0)
