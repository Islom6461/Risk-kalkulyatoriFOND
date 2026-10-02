"""
ZA_ISLAMIC — RiskKalkulyatori_FOND backend
Flask + SQLite: haqiqiy foydalanuvchilar bazasi, signallar va narx proksi.

Ishga tushirish:
    pip install -r requirements.txt
    python app.py
    -> http://127.0.0.1:8000

Frontend (index.html) avtomatik ravishda shu manzildan foydalanadi.
Backend ishlamasa ham frontend ishlaydi — localStorage rejimiga o'tadi.
"""

import os
import json
import time
import hmac
import sqlite3
import hashlib
import secrets
import threading
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Flask, request, jsonify, g, send_from_directory, Response

# ------------------------------------------------------------------ sozlamalar
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)          # loyiha ildizi (index.html shu yerda)
DB_PATH = os.environ.get("ZA_DB", os.path.join(BASE_DIR, "za_islamic.db"))

ADMIN_TOKEN = os.environ.get("ZA_ADMIN_TOKEN", "za_islamic_admin")
DEFAULT_TOKEN = "za_islamic_admin"          # ochiq qiymat — internetga chiqmasligi kerak
API_KEY = os.environ.get("ZA_FCS_KEY", "")   # ixtiyoriy: FCS API kaliti

TOKEN_DAYS = 30
PBKDF2_ROUNDS = 260_000
PORT = int(os.environ.get("ZA_PORT", "8000"))

app = Flask(__name__, static_folder=None)
app.config["JSON_AS_ASCII"] = False
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024

# ------------------------------------------------------------------ yordamchilar
_lock = threading.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


_schema_ready = False


def db() -> sqlite3.Connection:
    """Har doim tayyor bazani beradi — jadval yo'q bo'lsa o'zini yaratadi."""
    global _schema_ready
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        g.db = conn
        if not _schema_ready:
            init_db()
            _schema_ready = True
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(
            """
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS users (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                email       TEXT NOT NULL UNIQUE,
                phone       TEXT DEFAULT '',
                pw_hash     TEXT NOT NULL,
                pw_salt     TEXT NOT NULL,
                tier        TEXT DEFAULT 'Bepul',
                balance     REAL DEFAULT 0,
                created_at  TEXT NOT NULL,
                last_login  TEXT
            );

            CREATE TABLE IF NOT EXISTS tokens (
                token      TEXT PRIMARY KEY,
                user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS signals (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                uid        TEXT NOT NULL DEFAULT '',
                instrument TEXT NOT NULL,
                pair       TEXT NOT NULL,
                type       TEXT NOT NULL,
                entry      REAL,
                sl         REAL,
                tp         REAL,
                status     TEXT DEFAULT 'pending',
                time       TEXT NOT NULL,
                note       TEXT DEFAULT '',
                tv_symbol  TEXT DEFAULT '',
                source     TEXT DEFAULT 'manual',
                score      REAL,
                UNIQUE(uid, instrument, type, time)
            );

            CREATE INDEX IF NOT EXISTS idx_signals_time   ON signals(time DESC);
            CREATE INDEX IF NOT EXISTS idx_tokens_expires ON tokens(expires_at);
            """
        )
        # --- yangi versiyalar uchun ustunlar (idempotent) ---
        for ddl in (
            "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
            "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'",
            "ALTER TABLE users ADD COLUMN blocked_at TEXT",
            "ALTER TABLE users ADD COLUMN blocked_reason TEXT",
            "ALTER TABLE users ADD COLUMN note TEXT DEFAULT ''",
        ):
            try:
                conn.execute(ddl)
                conn.commit()
            except sqlite3.OperationalError:
                pass  # ustun allaqachon bor

        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS lessons (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT NOT NULL,
                body        TEXT DEFAULT '',
                video_url   TEXT DEFAULT '',
                category    TEXT DEFAULT 'Umumiy',
                order_no    INTEGER DEFAULT 0,
                published   INTEGER DEFAULT 1,
                min_tier    TEXT DEFAULT 'Bepul',
                created_at  TEXT NOT NULL,
                updated_at  TEXT
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                ts      TEXT NOT NULL,
                actor   TEXT DEFAULT '',
                action  TEXT NOT NULL,
                target  TEXT DEFAULT '',
                detail  TEXT DEFAULT ''
            );

            CREATE INDEX IF NOT EXISTS idx_audit_ts    ON audit_log(ts DESC);
            CREATE INDEX IF NOT EXISTS idx_lessons_ord ON lessons(order_no, id);
            """
        )
        conn.commit()


# ------------------------------------------------------------------ rollar
TIERS = ["Bepul", "Pro", "VIP"]
ROLES = ["user", "moderator", "admin"]
TIER_RANK = {t: i for i, t in enumerate(TIERS)}


def permissions_of(row) -> dict:
    """Foydalanuvchi imkoniyatlari — frontend ham shuni ko'radi."""
    keys = row.keys()
    role = (row["role"] if "role" in keys else "user") or "user"
    tier = (row["tier"] if "tier" in keys else "Bepul") or "Bepul"
    admin = role == "admin"
    mod = role == "moderator" or admin
    return {
        "role": role,
        "isAdmin": admin,
        "isModerator": mod,
        "tier": tier,
        "tierRank": TIER_RANK.get(tier, 0),
        "canManageSignals": mod,
        "canManageLessons": admin,
        "canBlockUsers": mod,
        "canDeleteUsers": admin,
        "canChangeRoles": admin,
        "canViewAudit": admin,
        "canViewStats": admin,
    }


def audit(actor: str, action: str, target: str = "", detail: str = ""):
    try:
        conn = db()
        conn.execute(
            "INSERT INTO audit_log (ts, actor, action, target, detail) VALUES (?,?,?,?,?)",
            (now_iso(), actor, action, target, detail),
        )
        conn.commit()
    except sqlite3.Error:
        pass


def require_admin(fn):
    """Faqat admin: rol o'zgartirish, foydalanuvchi o'chirish, darslar, audit."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        u = current_user()
        if u is None:
            return jsonify({"error": "Kirish talab qilinadi"}), 401
        if (u["role"] or "user") != "admin":
            return jsonify({"error": "Faqat admin uchun"}), 403
        g.user = u
        return fn(*args, **kwargs)
    return wrapper


def require_moderator(fn):
    """Moderator ham, admin ham: bloklash, signal boshqaruvi."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        u = current_user()
        if u is None:
            return jsonify({"error": "Kirish talab qilinadi"}), 401
        if (u["role"] or "user") not in ("moderator", "admin"):
            return jsonify({"error": "Faqat moderator yoki admin uchun"}), 403
        g.user = u
        return fn(*args, **kwargs)
    return wrapper


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ROUNDS
    ).hex()


def verify_password(password: str, salt: str, expected: str) -> bool:
    return hmac.compare_digest(hash_password(password, salt), expected)


def public_user(row) -> dict:
    keys = row.keys()
    status = (row["status"] if "status" in keys else "active") or "active"
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"] or "",
        "tier": row["tier"],
        "balance": row["balance"],
        "registered": (row["created_at"] or "")[:10],
        "lastLogin": row["last_login"],
        "status": status,
        "blocked": status == "blocked",
        "blockedReason": (row["blocked_reason"] if "blocked_reason" in keys else "") or "",
        "note": (row["note"] if "note" in keys else "") or "",
        "perms": permissions_of(row),
    }


def make_token(conn, user_id: str) -> str:
    token = secrets.token_hex(32)
    expires = (datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)).replace(microsecond=0).isoformat()
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at, expires_at) VALUES (?,?,?,?)",
        (token, user_id, now_iso(), expires),
    )
    conn.commit()
    return token


def current_user():
    """Authorization: Bearer <token> orqali joriy foydalanuvchini qaytaradi.
       Bloklangan foydalanuvchilar uchun None qaytaradi (token o'chiriladi)."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    conn = db()
    row = conn.execute(
        """SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id
           WHERE t.token = ? AND t.expires_at > ?""",
        (token, now_iso()),
    ).fetchone()
    if row is None:
        return None
    if (row["status"] or "active") == "blocked":
        # bloklanganini darhol kuzatib boramiz va token'ni o'chiramiz
        try:
            conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
            conn.commit()
        except sqlite3.Error:
            pass
        return None
    return row


def blocked_guard(fn):
    """Bloklangan foydalanuvchi uchun aniq xabar (401 emas, 403)."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:].strip()
            row = db().execute(
                """SELECT u.status, u.blocked_reason FROM tokens t
                   JOIN users u ON u.id = t.user_id
                   WHERE t.token = ? AND t.expires_at > ?""",
                (token, now_iso()),
            ).fetchone()
            if row is not None and (row["status"] or "active") == "blocked":
                return jsonify({
                    "error": "Hisobingiz bloklangan." + (" Sabab: " + (row["blocked_reason"] or "") if row["blocked_reason"] else ""),
                    "blocked": True,
                }), 403
        return fn(*args, **kwargs)
    return wrapper


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        u = current_user()
        if u is None:
            return jsonify({"error": "Kirish talab qilinadi yoki hisob bloklangan"}), 401
        g.user = u
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    """Admin so'rovlari. Ochiq (standart) token bilan ISHLAMAYDI —
       aks holda kimdir internet orqali signal yozib/o'chira olardi."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if hmac.compare_digest(ADMIN_TOKEN, DEFAULT_TOKEN):
            return jsonify({
                "error": "Xavfsizlik: admin token o\'zgartirilmagan. "
                         "Serverda ZA_ADMIN_TOKEN atrof-muhit o\'zgaruvchisini "
                         "random qiymat bilan belgilang.",
                "need": "ZA_ADMIN_TOKEN=<random 32+ belgi>"
            }), 503
        token = request.headers.get("X-Admin-Token") or request.headers.get("Authorization", "")
        if token.startswith("Bearer "):
            token = token[7:].strip()
        if not hmac.compare_digest(token or "", ADMIN_TOKEN):
            return jsonify({"error": "Admin token noto'g'ri"}), 403
        return fn(*args, **kwargs)

    return wrapper


@app.after_request
def add_headers(resp: Response):
    # lokal ishlash va alohida domen uchun CORS
    origin = request.headers.get("Origin")
    resp.headers.setdefault(
        "Access-Control-Allow-Origin", origin if origin else "*"
    )
    resp.headers.setdefault("Vary", "Origin")
    resp.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token")
    resp.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
    resp.headers.setdefault("Cache-Control", "no-store")
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    return resp


# ------------------------------------------------------------------ RATE LIMIT
# Oddiy slayd-window limiter (jaroatda, DB emas). IP bo'yicha.
RATE_READ = int(os.environ.get("ZA_RATE_READ", "600"))    # daqiqada o'qish
RATE_WRITE = int(os.environ.get("ZA_RATE_WRITE", "60"))   # daqiqada yozish
RATE_LOGIN = int(os.environ.get("ZA_RATE_LOGIN", "15"))   # daqiqada kirish urinish
_hits: dict = {}


def rate_limit(max_per_min: int, bucket: str):
    """So'rov sonini cheklaydi. Bloklasa 429 qaytaradi."""
    def guard(*_a, **_kw):
        ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr or "?"
        now = time.time()
        key = f"{bucket}:{ip}"
        arr = [t for t in _hits.get(key, []) if now - t < 60]
        if len(arr) >= max_per_min:
            _hits[key] = arr
            resp = jsonify({"error": "Juda ko'p so'rov. Bir daqiqada kutib turing.", "retryIn": 60})
            resp.status_code = 429
            resp.headers["Retry-After"] = "60"
            return resp
        arr.append(now)
        _hits[key] = arr
        # xotira tozalash
        if len(_hits) > 5000:
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 120]:
                _hits.pop(k, None)
        return None
    return guard


@app.before_request
def _apply_limits():
    if request.method == "OPTIONS":
        return None
    path = request.path
    if path.startswith("/api/auth/login") or path.startswith("/api/auth/register"):
        return rate_limit(RATE_LOGIN, "auth")()
    if request.method in ("GET", "HEAD"):
        return rate_limit(RATE_READ, "read")()
    return rate_limit(RATE_WRITE, "write")()


# ------------------------------------------------------------------ HTTP kesh
_cache: dict = {}


def cached(key: str, ttl: float, producer):
    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] > time.time():
            return hit[1]
    value = producer()
    with _lock:
        _cache[key] = (time.time() + ttl, value)
    return value


def http_json(url: str, timeout: float = 8.0):
    req = urllib.request.Request(url, headers={"User-Agent": "ZA_ISLAMIC/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


# ------------------------------------------------------------------ MARKET
TV_SCAN = "https://scanner.tradingview.com/global/scan"

# id -> TradingView simvoli
TV_SYMBOLS = {
    "EURUSD": "FX:EURUSD", "GBPUSD": "FX:GBPUSD", "USDJPY": "FX:USDJPY",
    "AUDUSD": "FX:AUDUSD", "USDCAD": "FX:USDCAD", "USDCHF": "FX:USDCHF",
    "NZDUSD": "FX:NZDUSD", "EURGBP": "FX:EURGBP", "EURJPY": "FX:EURJPY",
    "GBPJPY": "FX:GBPJPY", "XAUUSD": "OANDA:XAUUSD", "XAGUSD": "TVC:SILVER",
    "SPX500": "SP:SPX", "NAS100": "NASDAQ:NDX", "DJI": "DJ:DJI", "DE40": "TVC:DE30",
    "BTCUSDT": "BINANCE:BTCUSDT", "ETHUSDT": "BINANCE:ETHUSDT",
    "BNBUSDT": "BINANCE:BNBUSDT", "SOLUSDT": "BINANCE:SOLUSDT",
    "XRPUSDT": "BINANCE:XRPUSDT", "ADAUSDT": "BINANCE:ADAUSDT",
    "DOGEUSDT": "BINANCE:DOGEUSDT", "DOTUSDT": "BINANCE:DOTUSDT",
    "LINKUSDT": "BINANCE:LINKUSDT", "AVAXUSDT": "BINANCE:AVAXUSDT",
}
TV_ID = {v: k for k, v in TV_SYMBOLS.items()}

TV_COLUMNS = [
    "close", "change", "change_abs", "high", "low", "volume",
    "RSI|60", "ATR|240",
    "Recommend.All", "Recommend.All|15", "Recommend.All|60", "Recommend.All|240",
    "MACD.macd|60", "MACD.signal|60", "MACD.macd|15", "MACD.signal|15",
    "EMA9|60", "EMA21|60", "SMA50|60",
    "Stoch.K|60", "Stoch.D|60", "BB.upper|60", "BB.lower|60",
]
TV_IND_KEYS = {
    "RSI|60": "rsi", "ATR|240": "atr",
    "Recommend.All": "rec", "Recommend.All|15": "rec15",
    "Recommend.All|60": "rec60", "Recommend.All|240": "rec240",
    "MACD.macd|60": "macd", "MACD.signal|60": "macdSignal",
    "MACD.macd|15": "macd15", "MACD.signal|15": "macdSignal15",
    "EMA9|60": "ema9", "EMA21|60": "ema21", "SMA50|60": "sma50",
    "Stoch.K|60": "stochK", "Stoch.D|60": "stochD",
    "BB.upper|60": "bbUpper", "BB.lower|60": "bbLower",
}


def _tv_quotes():
    body = json.dumps({
        "symbols": {"query": {"types": []}, "tickers": list(TV_SYMBOLS.values())},
        "columns": TV_COLUMNS,
    }).encode("utf-8")
    req = urllib.request.Request(
        TV_SCAN, data=body, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "ZA_ISLAMIC/1.0"},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read().decode("utf-8"))

    out = {}
    for item in data.get("data", []):
        ident = TV_ID.get(item.get("s"))
        if not ident:
            continue
        v = dict(zip(TV_COLUMNS, item.get("d") or []))
        price = v.get("close")
        if price is None:
            continue
        ind = {TV_IND_KEYS[k]: v[k] for k in TV_IND_KEYS if v.get(k) is not None}
        out[ident] = {
            "price": price,
            "chg": v.get("change"),
            "chgAbs": v.get("change_abs"),
            "high": v.get("high"),
            "low": v.get("low"),
            "vol": v.get("volume"),
            "ind": ind,
            "source": "tradingview",
        }
    return out


@app.get("/api/market/quotes")
def api_quotes():
    """Barcha narxlar + indikatorlar (3 soniya server keshi bilan).
       Frontend har bir foydalanuvchi uchun alohida so'rov yubormasligi uchun
       barcha narxlar shu yerdan (kesh bilan) olinadi."""
    def produce():
        try:
            quotes = _tv_quotes()
            return {"ts": int(time.time() * 1000), "quotes": quotes, "errors": []}
        except Exception as e:                               # noqa: BLE001
            return {"ts": int(time.time() * 1000), "quotes": {}, "errors": [str(e)]}

    data = cached("quotes", 3.0, produce)
    if not data["quotes"]:
        return jsonify({"error": "TradingView scanner javob bermadi", "detail": data["errors"]}), 502
    return jsonify(data)


# ------------------------------------------------------------------ KALENDAR
FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
IMPACT_MAP = {"High": 3, "Medium": 2, "Low": 1, "Holiday": 1}


@app.get("/api/calendar")
def api_calendar():
    """ForexFactory haftalik iqtisodiy kalendari (10 daqiqa kesh)."""
    def produce():
        raw = http_json(FF_URL)
        items = []
        for x in raw:
            impact = IMPACT_MAP.get(x.get("impact"), 1)
            try:
                dt = datetime.fromisoformat(x["date"])
            except Exception:                              # noqa: BLE001
                continue
            items.append({
                "currency": (x.get("country") or "ALL").upper(),
                "title": x.get("title") or "",
                "impact": impact,
                "impactRaw": x.get("impact") or "Low",
                "forecast": x.get("forecast") or "",
                "previous": x.get("previous") or "",
                "ts": int(dt.timestamp() * 1000),
            })
        items.sort(key=lambda i: i["ts"])
        return {"ts": int(time.time() * 1000), "items": items}

    try:
        return jsonify(cached("calendar", 600.0, produce))
    except Exception as e:                                  # noqa: BLE001
        return jsonify({"error": "Kalendar yuklanmadi", "detail": str(e)}), 502


# ------------------------------------------------------------------ HEALTH
@app.get("/api/health")
@app.get("/health")
def api_health():
    try:
        conn = db()
        n_users = conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
        n_signals = conn.execute("SELECT COUNT(*) c FROM signals").fetchone()["c"]
        n_lessons = conn.execute("SELECT COUNT(*) c FROM lessons").fetchone()["c"]
    except sqlite3.Error as e:                              # noqa: BLE001
        return jsonify({"status": "error", "error": str(e)}), 503
    return jsonify({
        "status": "ok",
        "app": "ZA_ISLAMIC",
        "version": "1.1.0",
        "db": DB_PATH,
        "users": n_users,
        "signals": n_signals,
        "lessons": n_lessons,
        "admins": conn.execute(
            "SELECT COUNT(*) c FROM users WHERE role = 'admin'").fetchone()["c"],
        "adminOk": not hmac.compare_digest(ADMIN_TOKEN, DEFAULT_TOKEN),
        "limits": {"read": RATE_READ, "write": RATE_WRITE, "login": RATE_LOGIN},
        "time": now_iso(),
    })


# ------------------------------------------------------------------ AUTH
@app.post("/api/auth/register")
def api_register():
    d = request.get_json(silent=True) or {}
    name = (d.get("name") or "").strip()
    email = (d.get("email") or "").strip().lower()
    phone = (d.get("phone") or "").strip()
    password = d.get("password") or ""

    if not name:
        return jsonify({"error": "Ism to'ldirilishi shart"}), 400
    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "Email noto'g'ri"}), 400
    if len(password) < 6:
        return jsonify({"error": "Parol kamida 6 belgidan iborat bo'lishi kerak"}), 400
    if not d.get("agree"):
        return jsonify({"error": "Foydalanish shartnomasi va maxfiylik siyosatiga rozilik bermasiz"}), 400

    conn = db()
    if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        return jsonify({"error": "Bu email allaqachon ro'yxatdan o'tgan"}), 409

    uid = "ZA-" + secrets.token_hex(3).upper()
    salt = secrets.token_hex(16)

    # Birinchi ro'yxatdan o'tgan odam avtomatik admin bo'ladi
    total = conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    role = "admin" if total == 0 else "user"

    conn.execute(
        """INSERT INTO users (id,name,email,phone,pw_hash,pw_salt,tier,balance,
                              created_at,last_login,role,status)
           VALUES (?,?,?,?,?,?,'Bepul',0,?,?,?,'active')""",
        (uid, name, email, phone, hash_password(password, salt), salt,
         now_iso(), now_iso(), role),
    )
    conn.commit()
    if role == "admin":
        audit(uid, "system.first_admin", uid, "birinchi foydalanuvchi — admin")
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return jsonify({"user": public_user(row), "token": make_token(conn, uid)}), 201


@app.post("/api/auth/login")
def api_login():
    d = request.get_json(silent=True) or {}
    email = (d.get("email") or "").strip().lower()
    password = d.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Email va parol talab qilinadi"}), 400

    conn = db()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if row is None or not verify_password(password, row["pw_salt"], row["pw_hash"]):
        return jsonify({"error": "Email yoki parol noto'g'ri"}), 401

    if (row["status"] or "active") == "blocked":
        reason = (row["blocked_reason"] if "blocked_reason" in row.keys() else "") or ""
        audit(row["id"], "login.blocked", row["id"], reason)
        return jsonify({
            "error": "Hisobingiz bloklangan." + (" Sabab: " + reason if reason else ""),
            "blocked": True,
        }), 403

    conn.execute("UPDATE users SET last_login = ? WHERE id = ?", (now_iso(), row["id"]))
    conn.commit()
    return jsonify({"user": public_user(row), "token": make_token(conn, row["id"])})


@app.get("/api/auth/me")
@auth_required
def api_me():
    return jsonify({"user": public_user(g.user)})


@app.post("/api/auth/logout")
@auth_required
def api_logout():
    conn = db()
    conn.execute("DELETE FROM tokens WHERE user_id = ?", (g.user["id"],))
    conn.commit()
    return jsonify({"status": "ok"})


# ------------------------------------------------------------------ DARS(L)LAR
def lesson_dict(r, full: bool = True) -> dict:
    d = {
        "id": r["id"],
        "title": r["title"],
        "category": r["category"],
        "orderNo": r["order_no"],
        "published": bool(r["published"]),
        "minTier": r["min_tier"],
        "updatedAt": r["updated_at"],
        "createdAt": r["created_at"],
    }
    if full:
        d["body"] = r["body"]
        d["videoUrl"] = r["video_url"]
    else:
        preview = (r["body"] or "")[:160]
        d["preview"] = (preview + "…") if len(r["body"] or "") > 160 else preview
    return d


@app.get("/api/lessons")
@auth_required
def api_lessons_list():
    """Foydalanuvchiga ko'rinadigan darslar (tarifiga qarab)."""
    rank = TIER_RANK.get(g.user["tier"] or "Bepul", 0)
    rows = db().execute(
        "SELECT * FROM lessons WHERE published = 1 ORDER BY order_no ASC, id ASC"
    ).fetchall()
    out = []
    for r in rows:
        need = TIER_RANK.get(r["min_tier"] or "Bepul", 0)
        if need > rank:
            out.append({
                "id": r["id"], "title": r["title"], "category": r["category"],
                "orderNo": r["order_no"], "locked": True, "minTier": r["min_tier"],
                "preview": "Bu dars " + str(r["min_tier"]) + " tarifida.",
            })
        else:
            d = lesson_dict(r, full=False)
            d["locked"] = False
            out.append(d)
    return jsonify({"lessons": out})


@app.get("/api/lessons/<int:lid>")
@auth_required
def api_lesson_get(lid: int):
    r = db().execute("SELECT * FROM lessons WHERE id = ?", (lid,)).fetchone()
    if r is None:
        return jsonify({"error": "Dars topilmadi"}), 404
    if not r["published"] and (g.user["role"] or "user") != "admin":
        return jsonify({"error": "Dars hali e'lon qilinmagan"}), 403
    rank = TIER_RANK.get(g.user["tier"] or "Bepul", 0)
    if TIER_RANK.get(r["min_tier"] or "Bepul", 0) > rank:
        return jsonify({"error": "Bu dars " + str(r["min_tier"]) + " tarifida mavjud"}), 403
    return jsonify({"lesson": lesson_dict(r)})


@app.post("/api/admin/lessons")
@require_admin
def api_lesson_create():
    d = request.get_json(silent=True) or {}
    title = (d.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Sarlavha talab qilinadi"}), 400
    tier = d.get("minTier") if d.get("minTier") in TIERS else "Bepul"
    conn = db()
    conn.execute(
        """INSERT INTO lessons
           (title, body, video_url, category, order_no, published, min_tier, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            title, d.get("body") or "", d.get("videoUrl") or "",
            d.get("category") or "Umumiy", int(d.get("orderNo") or 0),
            1 if d.get("published", True) else 0, tier, now_iso(), now_iso(),
        ),
    )
    conn.commit()
    rid = conn.execute("SELECT last_insert_rowid() id").fetchone()["id"]
    audit(g.user["id"], "lesson.create", str(rid), title)
    row = conn.execute("SELECT * FROM lessons WHERE id = ?", (rid,)).fetchone()
    return jsonify({"lesson": lesson_dict(row)}), 201


@app.patch("/api/admin/lessons/<int:lid>")
@require_admin
def api_lesson_update(lid: int):
    d = request.get_json(silent=True) or {}
    conn = db()
    row = conn.execute("SELECT * FROM lessons WHERE id = ?", (lid,)).fetchone()
    if row is None:
        return jsonify({"error": "Dars topilmadi"}), 404
    fields, vals = [], []
    mapping = {
        "title": "title", "body": "body", "videoUrl": "video_url",
        "category": "category", "orderNo": "order_no", "minTier": "min_tier",
    }
    for key, col in mapping.items():
        if key in d:
            v = d[key]
            if col == "min_tier" and v not in TIERS:
                continue
            fields.append(f"{col} = ?")
            vals.append(int(v) if col == "order_no" else v)
    if "published" in d:
        fields.append("published = ?")
        vals.append(1 if d["published"] else 0)
    if not fields:
        return jsonify({"error": "Hech narsa yangilanmadi"}), 400
    fields.append("updated_at = ?")
    vals.append(now_iso())
    conn.execute(f"UPDATE lessons SET {', '.join(fields)} WHERE id = ?", (*vals, lid))
    conn.commit()
    audit(g.user["id"], "lesson.update", str(lid), row["title"])
    return jsonify({"lesson": lesson_dict(conn.execute("SELECT * FROM lessons WHERE id = ?", (lid,)).fetchone())})


@app.delete("/api/admin/lessons/<int:lid>")
@require_admin
def api_lesson_delete(lid: int):
    conn = db()
    cur = conn.execute("DELETE FROM lessons WHERE id = ?", (lid,))
    conn.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "Dars topilmadi"}), 404
    audit(g.user["id"], "lesson.delete", str(lid))
    return jsonify({"status": "ok"})


# ------------------------------------------------------------------ ADMIN: FOYDALANUVCHILAR
@app.get("/api/admin/users")
@require_admin
def api_admin_users():
    q = (request.args.get("q") or "").strip().lower()
    rows = db().execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
    out = []
    for r in rows:
        if q and q not in (r["name"] or "").lower() and q not in (r["email"] or "").lower():
            continue
        u = public_user(r)
        stats = db().execute(
            "SELECT COUNT(*) c FROM signals WHERE uid = ?", (r["id"],)
        ).fetchone()["c"]
        u["signalCount"] = stats
        out.append(u)
    return jsonify({"users": out, "tiers": TIERS, "roles": ROLES})


@app.patch("/api/admin/users/<uid>")
@require_admin
def api_admin_user_update(uid: str):
    d = request.get_json(silent=True) or {}
    conn = db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if row is None:
        return jsonify({"error": "Foydalanuvchi topilmadi"}), 404
    if uid == g.user["id"] and d.get("role") and d["role"] != "admin":
        return jsonify({"error": "O'z ro'lingizni pasaytira olmaysiz"}), 400

    fields, vals, changes = [], [], []
    if "tier" in d and d["tier"] in TIERS:
        fields.append("tier = ?"); vals.append(d["tier"])
        if d["tier"] != row["tier"]:
            changes.append(f"tier: {row['tier']} → {d['tier']}")
    if "role" in d and d["role"] in ROLES:
        fields.append("role = ?"); vals.append(d["role"])
        if d["role"] != row["role"]:
            changes.append(f"role: {row['role']} → {d['role']}")
    if "note" in d:
        fields.append("note = ?"); vals.append(str(d["note"])[:500])
        changes.append("izoh yangilandi")
    if "name" in d and d["name"].strip():
        fields.append("name = ?"); vals.append(d["name"].strip()[:80])

    if not fields:
        return jsonify({"error": "Hech narsa yangilanmadi"}), 400
    conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", (*vals, uid))
    conn.commit()
    audit(g.user["id"], "user.update", uid, "; ".join(changes))
    return jsonify({"user": public_user(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())})


@app.post("/api/admin/users/<uid>/block")
@require_moderator
def api_admin_user_block(uid: str):
    d = request.get_json(silent=True) or {}
    conn = db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if row is None:
        return jsonify({"error": "Foydalanuvchi topilmadi"}), 404
    if uid == g.user["id"]:
        return jsonify({"error": "O'z'zingizni bloklay olmaysiz"}), 400
    if (row["role"] or "user") == "admin" and (g.user["role"] or "user") != "admin":
        return jsonify({"error": "Adminga tegishli emas"}), 403

    reason = (d.get("reason") or "").strip()[:300]
    conn.execute(
        "UPDATE users SET status = 'blocked', blocked_at = ?, blocked_reason = ? WHERE id = ?",
        (now_iso(), reason, uid),
    )
    conn.execute("DELETE FROM tokens WHERE user_id = ?", (uid,))   # darhol chiqarish
    conn.commit()
    audit(g.user["id"], "user.block", uid, reason or "(sababsiz)")
    return jsonify({"user": public_user(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())})


@app.post("/api/admin/users/<uid>/unblock")
@require_moderator
def api_admin_user_unblock(uid: str):
    conn = db()
    cur = conn.execute(
        "UPDATE users SET status = 'active', blocked_at = NULL, blocked_reason = '' WHERE id = ?",
        (uid,),
    )
    conn.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "Foydalanuvchi topilmadi"}), 404
    audit(g.user["id"], "user.unblock", uid)
    return jsonify({"user": public_user(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())})


@app.delete("/api/admin/users/<uid>")
@require_admin
def api_admin_user_delete(uid: str):
    if uid == g.user["id"]:
        return jsonify({"error": "O'z'zingizni o'chira olmaysiz"}), 400
    conn = db()
    row = conn.execute("SELECT name, email FROM users WHERE id = ?", (uid,)).fetchone()
    if row is None:
        return jsonify({"error": "Foydalanuvchi topilmadi"}), 404
    conn.execute("DELETE FROM tokens WHERE user_id = ?", (uid,))
    conn.execute("DELETE FROM signals   WHERE uid = ?", (uid,))
    conn.execute("DELETE FROM users     WHERE id = ?", (uid,))
    conn.commit()
    audit(g.user["id"], "user.delete", uid, f"{row['name']} <{row['email']}>")
    return jsonify({"status": "ok"})


@app.get("/api/admin/stats")
@require_admin
def api_admin_stats():
    conn = db()

    def q(sql: str, args=()):
        return conn.execute(sql, args).fetchone()[0]

    return jsonify({
        "users": q("SELECT COUNT(*) FROM users"),
        "newToday": q(
            "SELECT COUNT(*) FROM users WHERE substr(created_at,1,10) = ?",
            (now_iso()[:10],),
        ),
        "blocked": q("SELECT COUNT(*) FROM users WHERE status = 'blocked'"),
        "signals": q("SELECT COUNT(*) FROM signals"),
        "lessons": q("SELECT COUNT(*) FROM lessons"),
        "admins": q("SELECT COUNT(*) FROM users WHERE role IN ('admin','moderator')"),
        "premium": q("SELECT COUNT(*) FROM users WHERE tier <> 'Bepul'"),
    })


@app.get("/api/admin/audit")
@require_admin
def api_admin_audit():
    limit = min(int(request.args.get("limit", "100")), 500)
    rows = db().execute(
        "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return jsonify({"log": [
        {"id": r["id"], "ts": r["ts"], "actor": r["actor"],
         "action": r["action"], "target": r["target"], "detail": r["detail"]}
        for r in rows
    ]})


# ------------------------------------------------------------------ SIGNALS
def signal_row_to_dict(r) -> dict:
    return {
        "id": str(r["id"]),
        "instrument": r["instrument"],
        "pair": r["pair"],
        "type": r["type"],
        "entry": r["entry"],
        "sl": r["sl"],
        "tp": r["tp"],
        "status": r["status"],
        "time": r["time"],
        "note": r["note"],
        "tvSymbol": r["tv_symbol"],
        "source": r["source"],
        "score": r["score"],
        "owner": r["uid"],
    }


@app.get("/api/signals")
def api_signals_list():
    limit = min(int(request.args.get("limit", "200")), 1000)
    rows = db().execute(
        "SELECT * FROM signals ORDER BY time DESC LIMIT ?", (limit,)
    ).fetchall()
    return jsonify({"signals": [signal_row_to_dict(r) for r in rows]})


@app.post("/api/signals")
@require_moderator
def api_signals_create():
    d = request.get_json(silent=True) or {}
    inst = (d.get("instrument") or "").strip().upper()
    if not inst or d.get("entry") is None:
        return jsonify({"error": "instrument va entry talab qilinadi"}), 400

    conn = db()
    try:
        conn.execute(
            """INSERT INTO signals
               (uid,instrument,pair,type,entry,sl,tp,status,time,note,tv_symbol,source,score)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                d.get("owner", "") or g.user["id"], inst, d.get("pair") or inst,
                (d.get("type") or "BUY").upper(),
                float(d["entry"]),
                float(d["sl"]) if d.get("sl") is not None else None,
                float(d["tp"]) if d.get("tp") is not None else None,
                d.get("status", "pending"),
                d.get("time") or now_iso(),
                d.get("note", ""), d.get("tvSymbol", ""),
                d.get("source", "manual"),
                float(d["score"]) if d.get("score") is not None else None,
            ),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Bu signal allaqachon mavjud"}), 409

    row = conn.execute("SELECT * FROM signals ORDER BY id DESC LIMIT 1").fetchone()
    audit(g.user["id"], "signal.create", str(row["id"]), f"{row['pair']} {row['type']}")
    return jsonify({"signal": signal_row_to_dict(row)}), 201


@app.post("/api/signals/bulk")
@require_moderator
def api_signals_bulk():
    """Frontend'dan foydalanuvchi qo'shgan signallarni serverga saqlash."""
    d = request.get_json(silent=True) or {}
    items = d.get("signals") or []
    if not isinstance(items, list):
        return jsonify({"error": "signals massiv bo'lishi kerak"}), 400

    conn = db()
    saved = 0
    for s in items:
        try:
            cur = conn.execute(
                """INSERT OR IGNORE INTO signals
                   (uid,instrument,pair,type,entry,sl,tp,status,time,note,tv_symbol,source,score)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    s.get("owner", "") or s.get("id", ""), (s.get("instrument") or "").upper(),
                    s.get("pair") or s.get("instrument"), (s.get("type") or "BUY").upper(),
                    s.get("entry"), s.get("sl"), s.get("tp"), s.get("status", "pending"),
                    s.get("time") or now_iso(), s.get("note", ""), s.get("tvSymbol", ""),
                    s.get("source", "manual"), s.get("score"),
                ),
            )
            saved += cur.rowcount if cur.rowcount > 0 else 0
        except Exception:                                  # noqa: BLE001
            continue
    conn.commit()
    return jsonify({"status": "ok", "received": len(items), "inserted": saved})


@app.patch("/api/signals/<int:sid>")
@require_moderator
def api_signals_update(sid: int):
    d = request.get_json(silent=True) or {}
    fields, values, changes = [], [], []
    for key, col in (("status", "status"), ("entry", "entry"), ("sl", "sl"),
                     ("tp", "tp"), ("note", "note"), ("type", "type")):
        if key in d:
            fields.append(f"{col} = ?")
            values.append(d[key])
            changes.append(f"{key}={d[key]}")
    if not fields:
        return jsonify({"error": "Hech narsa yangilanmadi"}), 400

    conn = db()
    conn.execute(f"UPDATE signals SET {', '.join(fields)} WHERE id = ?", (*values, sid))
    conn.commit()
    row = conn.execute("SELECT * FROM signals WHERE id = ?", (sid,)).fetchone()
    if row is None:
        return jsonify({"error": "Signal topilmadi"}), 404
    audit(g.user["id"], "signal.update", str(sid), "; ".join(changes))
    return jsonify({"signal": signal_row_to_dict(row)})


@app.delete("/api/signals/<int:sid>")
@require_moderator
def api_signals_delete(sid: int):
    conn = db()
    row = conn.execute("SELECT pair FROM signals WHERE id = ?", (sid,)).fetchone()
    cur = conn.execute("DELETE FROM signals WHERE id = ?", (sid,))
    conn.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "Signal topilmadi"}), 404
    audit(g.user["id"], "signal.delete", str(sid), row["pair"] if row else "")
    return jsonify({"status": "ok"})


# ------------------------------------------------------------------ STATIC
@app.get("/")
def index():
    p = os.path.join(ROOT_DIR, "index.html")
    if os.path.isfile(p):
        with open(p, "r", encoding="utf-8") as f:
            return Response(f.read(), mimetype="text/html; charset=utf-8")
    return jsonify({"error": "index.html topilmadi", "root": ROOT_DIR}), 404


@app.get("/<path:filename>")
def static_files(filename: str):
    safe = os.path.normpath(filename).lstrip("\\/")
    if safe.startswith(".."):
        return jsonify({"error": "noto'g'ri yo'l"}), 400
    full = os.path.join(ROOT_DIR, safe)
    if not os.path.isfile(full):
        return jsonify({"error": "topilmadi: " + filename}), 404
    ext = os.path.splitext(full)[1].lower()
    mime = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
    }.get(ext, "application/octet-stream")
    return Response(open(full, "rb").read(), mimetype=mime)


@app.errorhandler(404)
def nf(_e):
    return jsonify({"error": "topilmadi"}), 404


@app.errorhandler(500)
def se(e):                                                # noqa: ANN001
    return jsonify({"error": "server xatosi", "detail": str(e)}), 500


# ------------------------------------------------------------------ ishga tushirish
if __name__ == "__main__":
    init_db()
    print("=" * 62)
    print("  ZA_ISLAMIC backend — http://127.0.0.1:%d" % PORT)
    print("  Bazа:      %s" % DB_PATH)
    print("  Admin token: %s" % ADMIN_TOKEN)
    print("=" * 62)
    app.run(host="127.0.0.1", port=PORT, debug=False, threaded=True)