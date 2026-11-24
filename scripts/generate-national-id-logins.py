#!/usr/bin/env python3
"""
Builds scripts/company-national-id-logins.json from the park's member-company
spreadsheet ("bank-e ettela'at-e sherkat-ha", the .xlsx the park office keeps),
for scripts/provision-national-id-logins.ts to turn into login accounts.

Only the Alborz sheet (the first one) carries each company's national ID, so
only it is read. Per company it keeps:

  - national_id: the login username (11 digits, check digit verified)
  - name / website / email: only to match the row to an exhibition_companies
    row in the database, the same way every other import here matches
  - initial_password_hash: scrypt hash of the CEO's mobile number, in the
    exact "salt:hex" format src/lib/auth/password.server.ts produces, so the
    CEO's mobile is the first-login password
  - ceo_mobile_masked: e.g. 0912***1997, only so the dry-run report can say
    which number a company should use, without the number itself sitting in
    the repository

The mobile numbers themselves are never written out: the JSON is committed,
and a list of every CEO's personal mobile has no business in git history.

Usage:
  python3 scripts/generate-national-id-logins.py path/to/companies.xlsx
Requires openpyxl (pip install openpyxl).
"""
import hashlib
import json
import os
import re
import sys

import openpyxl

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "company-national-id-logins.json")

DIGITS = str.maketrans(
    "۰۱۲۳۴۵۶۷۸۹"
    "٠١٢٣٤٥٦٧٨٩",
    "01234567890123456789",
)

# Header text (whitespace-collapsed) -> field. Matched by header rather than
# column position so a reordered sheet still reads correctly.
HEADERS = {
    "نام شرکت": "name",
    "شناسه ملی": "national_id",
    "شماره تماس مدیرعامل": "ceo_mobile",
    "ایمیل شرکت / ایمیل رسمی نماینده": "email",
    "آدرس وبسایت": "website",
}


def clean(v):
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v).translate(DIGITS)).strip()


def valid_national_id(nid):
    if not re.fullmatch(r"\d{11}", nid):
        return False
    d = [int(c) for c in nid]
    offset = d[9] + 2
    weights = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17]
    s = sum((d[i] + offset) * weights[i] for i in range(10)) % 11
    return (0 if s == 10 else s) == d[10]


def normalize_mobile(raw):
    """First number in the cell as 09xxxxxxxxx, or None if it isn't a mobile."""
    first = re.split(r"[\n\r/]+", raw.translate(DIGITS))[0]
    d = re.sub(r"\D", "", first)
    if d.startswith("0098"):
        d = "0" + d[4:]
    elif d.startswith("98") and len(d) == 12:
        d = "0" + d[2:]
    elif len(d) == 10 and d.startswith("9"):
        d = "0" + d
    return d if re.fullmatch(r"09\d{9}", d) else None


def scrypt_hash(password):
    # Mirrors hashPassword() in src/lib/auth/password.server.ts: a 16-byte
    # random salt, hex-encoded, and that hex *string* is what Node passes to
    # scrypt as the salt; N=16384, r=8, p=5, key length 64, stored as
    # scrypt$N$r$p$salt$hash.
    salt = os.urandom(16).hex()
    key = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=5, dklen=64, maxmem=64 * 1024 * 1024)
    return f"scrypt$16384$8$5${salt}${key.hex()}"


def first_email(raw):
    for part in re.split(r"[\s,;]+", raw):
        part = part.strip("'\"").lower()
        if "@" in part:
            return part
    return None


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    ws = openpyxl.load_workbook(sys.argv[1], data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))

    header_idx, cols = None, {}
    for i, r in enumerate(rows[:10]):
        found = {HEADERS[clean(c)]: j for j, c in enumerate(r) if clean(c) in HEADERS}
        if "national_id" in found and "name" in found:
            header_idx, cols = i, found
            break
    if header_idx is None:
        sys.exit("Could not find the header row (company name + national ID columns) in the first sheet.")
    missing = [f for f in ("name", "national_id", "ceo_mobile") if f not in cols]
    if missing:
        sys.exit(f"Header row is missing columns: {missing}")

    out, problems, seen = [], [], {}
    for r in rows[header_idx + 1:]:
        get = lambda f: clean(r[cols[f]]) if f in cols and cols[f] < len(r) else ""
        name = get("name")
        if not name:
            continue
        nid = re.sub(r"\D", "", get("national_id"))
        if not nid:
            problems.append(f"no national ID: {name}")
            continue
        if not valid_national_id(nid):
            problems.append(f"invalid national ID {nid}: {name}")
            continue
        if nid in seen:
            problems.append(f"national ID {nid} repeated: {name} / {seen[nid]}")
            continue
        mobile = normalize_mobile(get("ceo_mobile"))
        if not mobile:
            problems.append(f"no usable CEO mobile: {name}")
            continue
        seen[nid] = name
        website = get("website") or None
        out.append({
            "name": name,
            "national_id": nid,
            "website": website if website and website not in ("-", "_") else None,
            "email": first_email(get("email")),
            "ceo_mobile_masked": mobile[:4] + "***" + mobile[-4:],
            "initial_password_hash": scrypt_hash(mobile),
        })

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Wrote {len(out)} companies to {OUT}")
    if problems:
        print(f"\nSkipped ({len(problems)}):")
        for p in problems:
            print("  - " + p)


if __name__ == "__main__":
    main()
