-- ゲーム1回分の状態。ver はどこかが変わるたびに +1 し、画面はこれを見て読み直すか決める。
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY, gm TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
  demo INTEGER NOT NULL DEFAULT 0, opts TEXT NOT NULL DEFAULT '{}',
  term INTEGER NOT NULL DEFAULT 0, phase TEXT NOT NULL DEFAULT 'setup', -- setup brief action meeting vote result end
  phase_at INTEGER, action_at INTEGER, bot_at INTEGER,
  ver INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL, scen TEXT
);
-- シナリオ。id = 'main' が編集中のもの、'g:<ゲームのid>' がゲームを作ったときに写したもの
CREATE TABLE IF NOT EXISTS scen (id TEXT PRIMARY KEY, title TEXT, data TEXT NOT NULL, updated INTEGER);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, game TEXT NOT NULL, tok TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, seat INTEGER NOT NULL, bot INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS players_game ON players(game);
-- role が NULL のターム＝休み
CREATE TABLE IF NOT EXISTS roles (
  game TEXT NOT NULL, term INTEGER NOT NULL, player TEXT NOT NULL, team TEXT, role TEXT,
  PRIMARY KEY (game, term, player)
);
CREATE TABLE IF NOT EXISTS odai (
  game TEXT NOT NULL, term INTEGER NOT NULL, no INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'wait', opened_at INTEGER, taken_at INTEGER, team TEXT, sub INTEGER, ord INTEGER,
  PRIMARY KEY (game, term, no)
);
-- 写真の投稿。kind: odai（お題）/ kinkyu（緊急任務）/ harikomi（張り込み）/ kakuho（確保写真）
CREATE TABLE IF NOT EXISTS subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL, term INTEGER NOT NULL,
  kind TEXT NOT NULL, ref INTEGER, player TEXT NOT NULL, team TEXT NOT NULL,
  at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending', -- pending ok ng late
  note TEXT, judged_at INTEGER, photo INTEGER
);
CREATE INDEX IF NOT EXISTS subs_game ON subs(game, term);
CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL, data BLOB NOT NULL);
CREATE INDEX IF NOT EXISTS photos_game ON photos(game);
-- 個人ページに届く知らせ（手掛かり・割符・接触の結果・判定の結果など）
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL, player TEXT NOT NULL, term INTEGER NOT NULL,
  kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS inbox_game ON inbox(game, player);
CREATE TABLE IF NOT EXISTS contacts (
  game TEXT NOT NULL, term INTEGER NOT NULL, role TEXT NOT NULL, slot INTEGER NOT NULL, player TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (game, term, role, slot, player)
);
-- 妨害の権利。source: contact / harikomi。used_at が入ったら使用済み
CREATE TABLE IF NOT EXISTS rights (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL, term INTEGER NOT NULL, player TEXT NOT NULL,
  source TEXT NOT NULL, at INTEGER NOT NULL, used_at INTEGER
);
CREATE TABLE IF NOT EXISTS sabotage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL, term INTEGER NOT NULL, team TEXT NOT NULL,
  by TEXT NOT NULL, floor TEXT NOT NULL, at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'active', cleared_at INTEGER
);
CREATE TABLE IF NOT EXISTS harikomi (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL, term INTEGER NOT NULL, team TEXT NOT NULL,
  target TEXT NOT NULL, action TEXT NOT NULL, done INTEGER
);
CREATE TABLE IF NOT EXISTS kakuho (
  game TEXT NOT NULL, term INTEGER NOT NULL, team TEXT NOT NULL, sub INTEGER NOT NULL,
  checks TEXT, score INTEGER, PRIMARY KEY (game, term, team)
);
CREATE TABLE IF NOT EXISTS votes (
  game TEXT NOT NULL, term INTEGER NOT NULL, player TEXT NOT NULL, s TEXT, b TEXT, t TEXT, at INTEGER NOT NULL,
  PRIMARY KEY (game, term, player)
);
-- 読み出しを減らすための索引（D1の無料枠は1日500万行の読み出し）
CREATE INDEX IF NOT EXISTS subs_team ON subs(game, term, team);
CREATE INDEX IF NOT EXISTS rights_player ON rights(game, term, player);
CREATE INDEX IF NOT EXISTS harikomi_term ON harikomi(game, term);
CREATE INDEX IF NOT EXISTS sabotage_term ON sabotage(game, term);
CREATE INDEX IF NOT EXISTS games_demo ON games(demo, created);
