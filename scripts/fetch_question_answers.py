#!/usr/bin/env python3
"""抓取同题其他回答，写入本地 SQLite。可续跑。

开放平台 question_answers 每天 100 次额度，一次请求一个问题，而一份语料有三百多个
问题 —— 一天抓不完，所以必须能续跑：已在库里的问题直接跳过，遇到额度或频率限制
（Code 30001）立即停止并保留已有结果。

接口只返回 ContentType、ContentToken、Url、Summary：没有作者、没有发布时间、
没有赞数。这里如实入库，不猜也不补。

用法：
    python3 scripts/fetch_question_answers.py            # 用满当天预算
    FETCH_BUDGET=20 python3 scripts/fetch_question_answers.py
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = os.environ.get(
    "ZHIHU_CLI",
    os.path.expanduser("~/Library/Application Support/zhihu-cli/current/zhihu-cli"))
DB_PATH = os.environ.get("MINDVERSE_DB_PATH", os.path.join(ROOT, "data/mindverse.db"))
EVIDENCE = os.path.join(ROOT, "testdata/answer_question_evidence.json")
CORPUS = os.path.join(ROOT, "testdata/corpus_sample.json")
LIMIT = int(os.environ.get("FETCH_LIMIT", "30"))
BUDGET = int(os.environ.get("FETCH_BUDGET", "95"))

SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS question_fetch (
  question_id  TEXT    PRIMARY KEY,
  title        TEXT    NOT NULL,
  fetched_at   INTEGER NOT NULL,
  answer_count INTEGER NOT NULL,
  is_end       INTEGER NOT NULL,
  next_offset  INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS question_answer (
  question_id  TEXT    NOT NULL,
  answer_token TEXT    NOT NULL,
  content_type TEXT    NOT NULL,
  url          TEXT    NOT NULL,
  summary      TEXT    NOT NULL,
  fetched_at   INTEGER NOT NULL,
  PRIMARY KEY (question_id, answer_token),
  FOREIGN KEY (question_id) REFERENCES question_fetch(question_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX IF NOT EXISTS idx_question_answer_question ON question_answer(question_id);
"""


def priority():
    """自己回答过的问题优先，其次按赞数。落地第一眼看到的是那些行星。"""
    evidence = json.load(open(EVIDENCE, encoding="utf-8"))
    corpus = json.load(open(CORPUS, encoding="utf-8"))
    question_of = {e["answerId"]: e["questionId"]
                   for e in evidence["entries"] if e.get("questionId")}
    meta = {}
    for item in corpus["items"]:
        if item.get("type") != "answer":
            continue
        match = re.search(r"/answer/(\d+)", item.get("url", ""))
        if not match:
            continue
        qid = question_of.get(match.group(1))
        if not qid:
            continue
        row = meta.setdefault(qid, {"title": item.get("title", ""), "own": 0, "like": 0})
        if item.get("own"):
            row["own"] += 1
        row["like"] = max(row["like"], item.get("likeCount") or 0)
    return sorted(meta.items(), key=lambda kv: (-kv[1]["own"], -kv[1]["like"]))


def put(con, qid, title, items, paging):
    next_offset = paging.get("NextOffset") if paging else None
    next_offset = int(next_offset) if isinstance(next_offset, (int, float)) else -1
    con.execute(
        """INSERT INTO question_fetch (question_id,title,fetched_at,answer_count,is_end,next_offset)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT(question_id) DO UPDATE SET
             title=excluded.title, fetched_at=excluded.fetched_at,
             answer_count=excluded.answer_count, is_end=excluded.is_end,
             next_offset=excluded.next_offset""",
        (qid, title, int(time.time()), len(items),
         1 if (paging or {}).get("IsEnd") else 0, next_offset))
    # 整题替换：接口返回的是该问题当前的回答列表，增量合并会把已删除的回答永久留下。
    con.execute("DELETE FROM question_answer WHERE question_id = ?", (qid,))
    for it in items:
        token = str(it.get("ContentToken") or "").strip()
        if not token:
            continue
        con.execute(
            """INSERT INTO question_answer
               (question_id,answer_token,content_type,url,summary,fetched_at)
               VALUES (?,?,?,?,?,?)""",
            (qid, token, it.get("ContentType") or "", it.get("Url") or "",
             it.get("Summary") or "", int(time.time())))
    con.commit()


def main():
    if not os.path.exists(CLI):
        sys.exit(f"找不到 zhihu-cli：{CLI}（可用 ZHIHU_CLI 指定）")
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    done = {row[0] for row in con.execute("SELECT question_id FROM question_fetch")}
    print(f"库中已有 {len(done)} 个问题，本次预算 {BUDGET} 次")

    spent = 0
    for qid, info in priority():
        if spent >= BUDGET:
            print(f"[stop] 用满本次预算 {BUDGET}")
            break
        if qid in done:
            continue
        url = f"https://www.zhihu.com/question/{qid}"
        result = subprocess.run(
            [CLI, "question", "answers", "--question-url", url, "--limit", str(LIMIT)],
            capture_output=True, text=True, timeout=120)
        spent += 1
        if result.returncode != 0:
            print(f"[err ] {qid} exit={result.returncode} {result.stderr.strip()[:160]}")
            break
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError:
            print(f"[err ] {qid} 非 JSON 响应: {result.stdout[:160]}")
            break
        code = payload.get("Code")
        if code == 30001:
            print("[stop] 额度或频率受限 (30001)")
            break
        if code != 0:
            print(f"[err ] {qid} Code={code} {payload.get('Message')}")
            break
        data = payload.get("Data") or {}
        items = data.get("Items") or []
        put(con, qid, info["title"], items, data.get("Paging"))
        print(f"[ok  ] {spent:3d} {qid} {len(items):2d}条  {info['title'][:26]}")
        time.sleep(0.35)

    questions = con.execute("SELECT COUNT(*) FROM question_fetch").fetchone()[0]
    answers = con.execute("SELECT COUNT(*) FROM question_answer").fetchone()[0]
    con.close()
    print(f"\n库中现有 {questions} 个问题、{answers} 条回答；本次消耗 {spent} 次额度")
    print(f"库位置 {DB_PATH}")


main()
