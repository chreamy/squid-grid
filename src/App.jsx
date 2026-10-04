import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Hexagon,
  Shield,
  Radio,
  Skull,
  Wallet,
  Clock3,
  Search,
  ChevronRight,
  X,
  Volume2,
  VolumeX,
  ExternalLink,
  RefreshCw,
  LoaderCircle,
  Check,
  Copy,
  Terminal,
  Activity,
  Crown,
  Download,
  Link2,
} from "lucide-react";
import {
  CHAIN_ID,
  EXPLORER,
  luckFor,
  probabilities,
  demoPlayers,
} from "./game.js";
import {
  connect,
  readArena,
  gameWrite,
  parseEther,
  deployFromWallet,
  deliverResult,
  quoteDeposit,
  readGameConfig,
} from "./chain.js";
import { POT } from "./network.js";
import Rules from "./Rules.jsx";
import Prisoner from "./Prisoner.jsx";
const pad = (n) => String(n).padStart(3, "0");
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
const fmt = (n) =>
  Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });
const Glyph = () => (
  <span className="glyphs">
    <i />
    <i />
    <i />
  </span>
);
const Polygon = ({ x, y }) =>
  `${x},${y - 13} ${x + 11.3},${y - 6.5} ${x + 11.3},${y + 6.5} ${x},${y + 13} ${x - 11.3},${y + 6.5} ${x - 11.3},${y - 6.5}`;
function HexGrid({ players, selected, onSelect, filter, account }) {
  const ref = useRef();
  return (
    <div className="grid-shell">
      <svg
        ref={ref}
        className="hex-grid"
        viewBox="0 0 1140 631"
        role="group"
        aria-label="Arena: 1,000 NFT slots. Use arrow keys to inspect players."
      >
        <defs>
          <radialGradient id="gridGlow">
            <stop stopColor="#ed277e" stopOpacity=".09" />
            <stop offset="1" stopColor="#ed277e" stopOpacity="0" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <ellipse cx="540" cy="310" rx="500" ry="300" fill="url(#gridGlow)" />
        {players.map((p, i) => {
          const row = Math.floor(i / 40),
            col = i % 40,
            x = 15 + col * 28 + (row % 2) * 14,
            y = 17 + row * 24.8,
            mine = account && p.owner?.toLowerCase() === account.toLowerCase(),
            active = p.id === selected,
            dim =
              (filter === "alive" && !p.alive) ||
              (filter === "dead" && (!p.minted || p.alive)) ||
              (filter === "mine" && !mine);
          return (
            <g
              key={p.id}
              className={`hex ${!p.minted ? "unminted" : p.alive ? "alive" : "dead"} ${active ? "selected" : ""} ${mine ? "mine" : ""} ${dim ? "dim" : ""}`}
              role="button"
              aria-label={`Player ${p.id}, ${!p.minted ? "unclaimed" : p.alive ? "alive" : "eliminated"}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                ) {
                  e.preventDefault();
                  const move = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -40,
                    ArrowDown: 40,
                  }[e.key];
                  onSelect(Math.max(1, Math.min(1000, p.id + move)));
                  requestAnimationFrame(() =>
                    ref.current?.querySelector('[tabindex="0"]')?.focus(),
                  );
                }
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(p.id);
                }
              }}
            >
              <title>
                #{pad(p.id)} ·{" "}
                {!p.minted ? "UNCLAIMED" : p.alive ? "ALIVE" : "ELIMINATED"} ·
                Luck {fmt(p.luck)}
              </title>
              <polygon
                points={Polygon({ x, y })}
                style={
                  p.alive
                    ? {
                        fill: active
                          ? "#ed277e"
                          : p.deposited > 0
                            ? "#287b69"
                            : undefined,
                      }
                    : undefined
                }
              />
              {p.minted && !p.alive && (
                <path d={`M${x - 3} ${y - 3}l6 6m0-6-6 6`} />
              )}
              {active && (
                <text x={x} y={y + 3.3} textAnchor="middle">
                  {pad(p.id)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="grid-coordinates">
        <span>SECTOR 01—40</span>
        <span>1,000 UNIQUE SIGNALS / ONE SURVIVOR</span>
        <span>SECTOR 01—25</span>
      </div>
    </div>
  );
}
export default function App() {
  const [config, setConfig] = useState(null),
    [quote, setQuote] = useState(null),
    [live, setLive] = useState(null),
    [wallet, setWallet] = useState(null),
    [selected, setSelected] = useState(456),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [amount, setAmount] = useState("0.01"),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(null),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now() / 1000),
    [demoEnd, setDemoEnd] = useState(Date.now() / 1000 + 467),
    [demo, setDemo] = useState(demoPlayers),
    [demoRound, setDemoRound] = useState(155),
    [sound, setSound] = useState(false),
    [demoMode, setDemoMode] = useState(0),
    [view, setView] = useState("arena"),
    [customAddress, setCustomAddress] = useState(""),
    [refreshKey, setRefreshKey] = useState(0);
  const configRef = useRef(null);
  useEffect(() => setQuote(null), [amount, selected, config]);
  useEffect(() => {
    if (!modal) return;
    const prev = document.activeElement,
      dialog = document.querySelector(".modal");
    dialog?.querySelector("button")?.focus();
    const key = (e) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const items = [
            ...dialog.querySelectorAll("button:not(:disabled),a[href],input"),
          ],
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, [modal]);
  useEffect(() => {
    fetch("/deployment.json")
      .then((r) => r.json())
      .then((c) => {
        const saved = localStorage.getItem("squid-grid-active");
        if (saved) {
          try {
            const v = JSON.parse(saved);
            if (v.chainId === CHAIN_ID && v.schemaVersion === 4) c = v;
          } catch {}
        }
        setConfig(c);
      })
      .catch(() => setError("Could not load network configuration."));
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!window.ethereum) return;
    const reset = () => {
      setWallet(null);
      setNotice({
        text: "Wallet account or network changed. Reconnect to continue.",
      });
    };
    window.ethereum.on?.("accountsChanged", reset);
    window.ethereum.on?.("chainChanged", reset);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", reset);
      window.ethereum.removeListener?.("chainChanged", reset);
    };
  }, []);
  useEffect(() => {
    configRef.current = config;
    if (!config?.game) {
      setLive(null);
      return;
    }
    let active = true;
    const update = () =>
      readArena(config)
        .then((v) => {
          if (active) {
            setLive(v);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError("Live data unavailable: " + e.message);
        });
    update();
    const id = setInterval(update, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [config, refreshKey]);
  const preview = !config?.game,
    players = preview
      ? demo
      : live?.players ||
        Array.from({ length: 1000 }, (_, i) => ({
          id: i + 1,
          minted: false,
          alive: false,
          luck: 0,
          roundLuck: 0,
          deposited: 0,
        })),
    p = players[selected - 1];
  const odds = useMemo(() => probabilities(players), [players]);
  const nextOdds = useMemo(
    () => probabilities(players, { snapshot: false }),
    [players],
  );
  const alive = players.filter((p) => p.alive).length,
    minted = players.filter((p) => p.minted).length,
    dead = minted - alive;
  const deadline = preview ? demoEnd : live?.deadline || 0,
    left = Math.max(0, Math.ceil(deadline - now)),
    minutes = Math.floor(left / 60),
    seconds = left % 60;
  const round = preview ? demoRound : live?.round || 0,
    finished = !!live?.winner,
    waiting = !preview && !!live?.pending,
    loading = !preview && !live;
  const phase = loading
    ? "SYNCING"
    : finished
      ? "SEASON COMPLETE"
      : !preview && minted < 1000
        ? "ENROLLMENT OPEN"
        : waiting
          ? "VERIFYING RANDOMNESS"
          : left === 0
            ? "AWAITING KEEPER"
            : "NEXT ELIMINATION";
  const treasury = preview
    ? 1 + demo.reduce((s, p) => s + p.deposited, 0)
    : live?.potReceived || 0;
  const chance = odds.get(selected) || 0,
    nextChance = nextOdds.get(selected) || 0,
    added = Number(amount),
    validAmount = Number.isFinite(added) && added > 0;
  const after = validAmount
    ? probabilities(
        players.map((q) =>
          q.id === selected ? { ...q, luck: luckFor(q.deposited + added) } : q,
        ),
        { snapshot: false },
      ).get(selected) || 0
    : chance;
  const mine = preview
    ? selected === 456
    : wallet && p.owner?.toLowerCase() === wallet.address.toLowerCase();
  const locked = finished || (alive === 2 && round > 0);
  const fieldLuck = players
    .filter((q) => q.alive)
    .reduce((sum, q) => sum + q.luck, 0);
  const luckShare = fieldLuck > 0 && p.alive ? p.luck / fieldLuck : 0;
  const protection = 1 / (1 - 0.5 * luckShare);
  const transact = async (label, fn) => {
    setBusy(label);
    setError("");
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(e.shortMessage || e.message || "Transaction failed.");
    } finally {
      setBusy("");
    }
  };
  const connectWallet = () =>
    transact("Connecting wallet", async () => setWallet(await connect()));
  const notify = (text, hash) => setNotice({ text, hash });
  const refresh = () => setRefreshKey((x) => x + 1);
  const boost = () =>
    transact("Confirm protection deposit", async () => {
      if (!validAmount)
        throw new Error(
          "Enter a positive ETH amount with at most 18 decimal places.",
        );
      if (preview) {
        setDemo((a) =>
          a.map((q) =>
            q.id === selected
              ? {
                  ...q,
                  deposited: q.deposited + added,
                  luck: luckFor(q.deposited + added),
                }
              : q,
          ),
        );
        notify(
          "Preview updated. Next-round odds recalculated; this round stays fixed. No ETH moved.",
        );
        return;
      }
      if (!wallet) throw new Error("Connect your wallet first.");
      if (
        !quote ||
        quote.amount !== amount ||
        quote.expiresAt <= Date.now() / 1000
      ) {
        setQuote(await quoteDeposit(config, amount));
        notify(
          "Quote ready. Review the minimum NFLX output, then confirm the deposit.",
        );
        return;
      }
      const hash = await gameWrite(
        config,
        wallet,
        "boost",
        [selected, quote.minimum, quote.expiresAt],
        quote.input,
      );
      setQuote(null);
      notify(
        "Sponsorship confirmed. Luck takes effect next round if this Player survives.",
        hash,
      );
      refresh();
    });
  const mint = () =>
    transact("Confirm mint", async () => {
      if (!wallet) throw new Error("Connect your wallet first.");
      const hash = await gameWrite(
        config,
        wallet,
        "mint",
        [1],
        live?.mintPrice ?? parseEther("0.001"),
      );
      notify(
        "Player minted for 0.001 ETH. Revenue was sent to the protocol pot.",
        hash,
      );
      refresh();
    });
  const advance = () =>
    transact("Advance round", async () => {
      if (!wallet) throw new Error("Connect your wallet first.");
      let hash;
      if (live?.received) {
        hash = await gameWrite(config, wallet, "settleRound");
        notify("Elimination settled.", hash);
      } else if (live?.pending) {
        hash = await deliverResult(config, wallet, live.requestId);
        notify("Random result delivered. Settle the elimination next.", hash);
      } else {
        hash = await gameWrite(config, wallet, "requestRound");
        notify("Randomness requested.", hash);
      }
      refresh();
    });
  const deploy = () =>
    transact("Preparing deployment", async () => {
      if (!wallet) throw new Error("Connect a funded testnet wallet first.");
      const c = await deployFromWallet(wallet, config, setBusy);
      setConfig(c);
      localStorage.setItem("squid-grid-active", JSON.stringify(c));
      setSelected(1);
      notify("Contracts deployed. Enrollment is open.");
    });
  const loadContract = () =>
    transact("Loading arena", async () => {
      if (!/^0x[0-9a-fA-F]{40}$/.test(customAddress))
        throw new Error("Enter a valid game contract address.");
      const c = await readGameConfig(customAddress);
      await readArena(c);
      setConfig(c);
      localStorage.setItem("squid-grid-active", JSON.stringify(c));
      setSelected(1);
      setModal(null);
    });
  const demoEliminate = () => {
    const lives = demo.filter((q) => q.alive),
      distribution = probabilities(demo);
    let r = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
      victim = lives.at(-1);
    for (const q of lives) {
      r -= distribution.get(q.id);
      if (r < 0) {
        victim = q;
        break;
      }
    }
    setDemo((a) =>
      a.map((q) =>
        q.id === victim.id
          ? {
              ...q,
              alive: false,
              luck: 0,
              roundLuck: 0,
              eliminatedRound: demoRound,
              finishPosition: lives.length,
            }
          : { ...q, roundLuck: q.luck },
      ),
    );
    setDemoRound((x) => x + 1);
    setDemoEnd(Date.now() / 1000 + 600);
    notify("Preview: player #" + pad(victim.id) + " eliminated.");
    if (sound) {
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        const ctx = new Audio(),
          o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 180;
        g.gain.value = 0.07;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        o.stop(ctx.currentTime + 0.3);
        setTimeout(() => ctx.close(), 500);
      } catch {}
    }
  };
  return (
    <div className="app">
      <div className="ambient" />
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("arena");
          }}
        >
          <span className="brand-symbol">
            <Hexagon size={28} />
            <X size={16} />
          </span>
          SQUID<span>GRID</span>
          <span className="edition">SEASON 01</span>
        </a>
        <nav aria-label="Primary">
          <button
            className={view === "arena" ? "active" : ""}
            onClick={() => setView("arena")}
          >
            The arena
          </button>
          <button
            className={view === "activity" ? "active" : ""}
            onClick={() => setView("activity")}
          >
            Elimination log
          </button>
          <button onClick={() => setModal("rules")}>
            The rules <ArrowUpRight size={12} />
          </button>
        </nav>
        <div className="header-right">
          <span className="network">
            <i />
            SEPOLIA TESTNET
          </span>
          <button
            className="wallet-button"
            onClick={connectWallet}
            disabled={!!busy}
          >
            <Wallet size={14} />
            {wallet ? short(wallet.address) : "Connect wallet"}
          </button>
        </div>
      </header>
      <main>
        <div className="topline">
          <span>
            <Radio size={12} />{" "}
            {preview ? "INTERACTIVE PREVIEW" : "ON-CHAIN SURVIVAL EXPERIMENT"}{" "}
            <b>/</b> VOL. 001
          </span>
          <button onClick={() => setModal("deploy")}>
            {preview ? "Connect a live arena" : "Contract & network"}{" "}
            <ArrowUpRight size={13} />
          </button>
        </div>
        {preview && (
          <div className="preview-banner">
            <span>
              <i /> SIMULATION MODE
            </span>{" "}
            Explore the arena. Preview numbers are illustrative; no wallet or
            ETH required.
            <button onClick={() => setModal("deploy")}>
              Go on-chain <ArrowRight size={13} />
            </button>
          </div>
        )}
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tag">LET THE GAMES BEGIN</span>
              <Glyph />
            </div>
            <h1>
              1,000 enter.
              <br />
              <em>1 survives.</em>
            </h1>
            <p>
              Ten minutes. One elimination. No second chances.
              <br />
              Back your number. Bend the odds. Survive the grid.
            </p>
            <div className="hero-meta">
              <span>
                <Shield size={13} /> Verifiable randomness
              </span>
              <span>
                <Hexagon size={13} /> Immutable rules
              </span>
            </div>
          </div>
          <div className={"countdown " + (left === 0 ? "expired" : "")}>
            <div className="timer-label">
              <span className="pulse-dot" />
              {phase}
              <span className="round">
                ROUND {String(round).padStart(3, "0")}
              </span>
            </div>
            <div className="timer">
              {!preview && minted < 1000 ? (
                <>
                  <span>{String(minted).padStart(3, "0")}</span>
                  <small>/1000</small>
                </>
              ) : finished ? (
                <Crown size={90} />
              ) : (
                <>
                  <span>{String(minutes).padStart(2, "0")}</span>
                  <b>:</b>
                  <span>{String(seconds).padStart(2, "0")}</span>
                </>
              )}
            </div>
            <div className="timer-bottom">
              <span>
                {!preview && minted < 1000
                  ? "MINTED · COUNTDOWN STARTS WHEN FULL"
                  : waiting
                    ? "SCORES LOCKED · PROOF DELIVERY PENDING"
                    : finished
                      ? "THE GRID HAS A WINNER"
                      : "UNTIL THE NEXT SIGNAL IS SELECTED"}
              </span>
              <button
                aria-label={sound ? "Mute sound" : "Enable preview sound"}
                onClick={() => setSound((v) => !v)}
              >
                {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>
            <div className="time-track">
              <div style={{ width: Math.min(600, left) / 6 + "%" }} />
            </div>
          </div>
        </section>
        <section className="metrics" aria-label="Game statistics">
          <div>
            <span>
              <Activity size={13} /> SIGNALS ALIVE
            </span>
            <strong>
              {loading ? "—" : alive.toLocaleString()}
              <small>/ 1,000</small>
            </strong>
            <div className="micro-bars">
              {Array.from({ length: 40 }, (_, i) => (
                <i key={i} className={i < alive / 25 ? "lit" : ""} />
              ))}
            </div>
          </div>
          <div>
            <span>
              <Skull size={13} /> ELIMINATED
            </span>
            <strong className="pink">
              {loading ? "—" : String(dead).padStart(3, "0")}
            </strong>
            <p>One disappears every round</p>
          </div>
          <div>
            <span>
              <Hexagon size={13} /> ETH CONTRIBUTED
            </span>
            <strong>
              {loading ? "—" : fmt(treasury)}
              <small>ETH</small>
            </strong>
            <p>
              {preview
                ? "Preview contributions · swaps not simulated"
                : fmt(live?.tokenReceived || 0) +
                  " " +
                  (config?.tokenSymbol || "NFLX") +
                  " sent to pot"}
            </p>
          </div>
          <div>
            <span>
              <Clock3 size={13} /> ROUND INTERVAL
            </span>
            <strong>
              10<small>MINUTES</small>
            </strong>
            <p>+ randomness & settlement time</p>
          </div>
        </section>
        {error && (
          <div className="message error" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {notice && (
          <div className="message success" role="status">
            <span>
              <Check size={14} />
              {notice.text}
            </span>
            {notice.hash && (
              <a
                href={EXPLORER + "/tx/" + notice.hash}
                target="_blank"
                rel="noreferrer"
              >
                Transaction <ArrowUpRight size={14} />
              </a>
            )}
            <button aria-label="Dismiss notice" onClick={() => setNotice(null)}>
              <X size={15} />
            </button>
          </div>
        )}
        <div className="arena-layout">
          <section className="arena-panel">
            <div className="panel-heading">
              <div>
                <span className="section-index">01 /</span>
                <h2>{view === "activity" ? "Elimination log" : "The arena"}</h2>
                <span className="live-pill">
                  <i />
                  {preview
                    ? "PREVIEW"
                    : error
                      ? "OFFLINE"
                      : loading
                        ? "SYNCING"
                        : "LIVE"}
                </span>
              </div>
              <span className="small-mono">
                {finished
                  ? "WINNER #" + pad(live.winner)
                  : "EVERY HEXAGON IS A LIFE"}
              </span>
            </div>
            {view === "arena" ? (
              <>
                <div className="grid-controls">
                  <div className="segmented">
                    {[
                      ["all", "All players"],
                      ["alive", "Surviving"],
                      ["dead", "Eliminated"],
                      ["mine", "My signals"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        className={filter === key ? "selected" : ""}
                        onClick={() => setFilter(key)}
                      >
                        {label}
                        {key === "all" && <span>1000</span>}
                      </button>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = Number(query);
                      if (Number.isInteger(n) && n >= 1 && n <= 1000) {
                        setSelected(n);
                        setFilter("all");
                      } else
                        setError("Player number must be between 1 and 1,000.");
                    }}
                  >
                    <Search size={13} />
                    <input
                      aria-label="Find player by number"
                      placeholder="Find a player"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      inputMode="numeric"
                    />
                    <button aria-label="Find player">
                      <ArrowRight size={12} />
                    </button>
                  </form>
                </div>
                <HexGrid
                  players={players}
                  selected={selected}
                  onSelect={setSelected}
                  filter={filter}
                  account={preview ? "YOUR PREVIEW NFT" : wallet?.address}
                />
                <div className="grid-footer">
                  <div className="legend">
                    <span>
                      <i className="alive-dot" />
                      Alive
                    </span>
                    <span>
                      <i className="dead-dot" />
                      Eliminated
                    </span>
                    <span>
                      <i className="you-dot" />
                      Your signal
                    </span>
                    {!preview && minted < 1000 && (
                      <span>
                        <i className="empty-dot" />
                        Unclaimed
                      </span>
                    )}
                  </div>
                  <span>
                    Click a signal to inspect <ArrowUpRight size={12} />
                  </span>
                </div>
              </>
            ) : (
              <div className="activity-list">
                {dead === 0 ? (
                  <div className="empty-state">
                    <Radio size={30} />
                    <h3>The grid is quiet.</h3>
                    <p>Eliminations will appear here once the season starts.</p>
                  </div>
                ) : (
                  players
                    .filter((q) => q.minted && !q.alive)
                    .sort((a, b) => b.eliminatedRound - a.eliminatedRound)
                    .slice(0, 30)
                    .map((q) => (
                      <button
                        key={q.id}
                        onClick={() => {
                          setSelected(q.id);
                          setView("arena");
                        }}
                      >
                        <span className="death-icon">
                          <Skull size={15} />
                        </span>
                        <span>
                          Signal <b>#{pad(q.id)}</b> terminated
                          <small>
                            ELIMINATED · ROUND {pad(q.eliminatedRound)}{" "}
                            {preview ? "· PREVIEW" : ""}
                          </small>
                        </span>
                        <span>{fmt(q.luck)} LUCK</span>
                        <ChevronRight size={14} />
                      </button>
                    ))
                )}
              </div>
            )}
          </section>
          <aside className="player-panel">
            <div className="panel-heading">
              <span className="small-mono">SIGNAL INSPECTOR</span>
              <span className="three-dots">•••</span>
            </div>
            <div className="player-identity">
              <div className="prisoner-portrait">
                <Prisoner number={selected} />
                {!p.alive && p.minted && (
                  <span className="dead-stamp">
                    ELIMINATED · R{pad(p.eliminatedRound)}
                  </span>
                )}
              </div>
              <span className={"status-badge " + (!p.alive ? "out" : "")}>
                <i />
                {!p.minted
                  ? "UNCLAIMED"
                  : p.alive
                    ? "SIGNAL ACTIVE"
                    : "ELIMINATED"}
              </span>
              <h2>Player #{pad(selected)}</h2>
              <p>
                {mine ? (
                  <>
                    <Wallet size={11} />{" "}
                    {preview ? "Your preview signal" : "Your signal"}
                  </>
                ) : p.owner ? (
                  short(p.owner)
                ) : (
                  "Waiting for a player"
                )}
              </p>
            </div>
            <dl className="player-stats">
              <div>
                <dt>
                  Luck score <Shield size={12} />
                </dt>
                <dd>{fmt(p.roundLuck ?? p.luck)}</dd>
              </div>
              <div>
                <dt>Queued luck</dt>
                <dd className="lime">
                  +{fmt(Math.max(0, p.luck - (p.roundLuck ?? p.luck)))}
                </dd>
              </div>
              <div>
                <dt>ETH deposited</dt>
                <dd>
                  {fmt(p.deposited)} <small>ETH</small>
                </dd>
              </div>
              <div>
                <dt>
                  This round <small>FIXED</small>
                </dt>
                <dd className={!p.alive ? "muted" : ""}>
                  {p.minted && p.alive ? (chance * 100).toFixed(6) + "%" : "—"}
                </dd>
              </div>
              <div className="next-round-odds">
                <dt>
                  Next round <small>ESTIMATE</small>
                </dt>
                <dd className={p.alive ? "lime" : "muted"}>
                  {p.minted && p.alive && !locked
                    ? (nextChance * 100).toFixed(6) + "%"
                    : "—"}
                </dd>
              </div>
            </dl>
            <div className="share-panel">
              <div>
                <span>SHARE OF LIVING LUCK</span>
                <b>{(luckShare * 100).toFixed(2)}%</b>
              </div>
              <div className="share-track">
                <i style={{ width: luckShare * 100 + "%" }} />
              </div>
              <p>
                {protection.toFixed(2)}× protection vs. zero luck{" "}
                <span>2× CAP</span>
              </p>
              <small>
                {luckShare === 1
                  ? "Protection is at the cap for this field. More ETH will not reduce current estimated risk."
                  : "Other deposits and eliminations change your share."}
              </small>
            </div>
            <div className="protection">
              <div className="protection-title">
                <Shield size={15} />
                <h3>Alter your odds</h3>
              </div>
              <p>
                {alive === 2 && round > 0
                  ? "Final-round odds are locked. New deposits cannot affect the final draw."
                  : "Buy protection, never immunity. Every Player still has a chance."}
              </p>
              <label htmlFor="amount">PROTECTION DEPOSIT</label>
              <div className="amount-input">
                <span>Ξ</span>
                <input
                  id="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  type="number"
                  min="0"
                  step=".001"
                />
                <span>ETH</span>
              </div>
              <div className="presets">
                {["0.001", "0.01", "0.05", "0.1"].map((v) => (
                  <button
                    key={v}
                    className={amount === v ? "chosen" : ""}
                    onClick={() => setAmount(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="odds-preview">
                <span>Next-round odds after this deposit</span>
                <strong>
                  {(nextChance * 100).toFixed(6)}% <ArrowRight size={10} />{" "}
                  <b>{(after * 100).toFixed(6)}%</b>
                </strong>
              </div>
              {!preview && !p.minted ? (
                <button
                  className="primary"
                  disabled={!!busy || !wallet || loading}
                  onClick={mint}
                >
                  Mint · 0.001 ETH <ArrowUpRight size={16} />
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={boost}
                  disabled={
                    !!busy ||
                    !p.alive ||
                    (!preview && !wallet) ||
                    locked ||
                    !validAmount ||
                    loading
                  }
                >
                  {busy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Shield size={16} />
                  )}{" "}
                  {!p.alive
                    ? "Signal terminated"
                    : locked
                      ? finished
                        ? "Game complete"
                        : "Final-round odds locked"
                      : !preview && !wallet
                        ? "Connect wallet to sponsor"
                        : preview
                          ? "Preview protection"
                          : quote && quote.expiresAt > now
                            ? "Confirm swap & buy luck"
                            : "Get NFLX swap quote"}
                  <ArrowUpRight size={15} />
                </button>
              )}
              {quote && !preview && (
                <div className="swap-quote">
                  <span>ETH → {config.tokenSymbol || "NFLX"}</span>
                  <b>Expected {fmt(quote.outputLabel)}</b>
                  <span>Minimum {fmt(quote.minimumLabel)} · 0.5% slippage</span>
                  <span>
                    {Math.max(0, Math.ceil(quote.expiresAt - now))}s remaining ·
                    recipient {short(POT)}
                  </span>
                </div>
              )}
              <div className="deposit-note">
                <span>↳</span>{" "}
                {preview
                  ? "Preview only. Next-round estimates update as you deposit. This round is locked. No ETH moves."
                  : "Swapped to NFLX and sent to the pot. This round stays locked. Next-round odds also depend on who survives and other deposits."}
              </div>
            </div>
            <div className="player-bottom">
              <i /> YOUR NUMBER. YOUR LUCK. YOUR LIFE.
            </div>
          </aside>
        </div>
        <section className="collection-strip">
          <div>
            <Glyph />
            <span className="eyebrow">THE PLAYERS</span>
            <h2>
              Same suit.
              <br />
              Different fate.
            </h2>
            <p>
              One thousand identical prisoners.
              <br />
              Only the number changes.
            </p>
            <a href="/nft/456.svg" target="_blank" rel="noreferrer">
              View Player 456 artwork <ArrowUpRight size={14} />
            </a>
          </div>
          {[1, 67, 456].map((id) => (
            <article key={id}>
              <Prisoner number={id} />
              <span>PLAYER {pad(id)}</span>
            </article>
          ))}
        </section>
        <section className="bottom-strip">
          <div>
            <span className="crosshair">＋</span>
            <div>
              <h3>The rules are cold. The odds are yours.</h3>
              <p>
                Your luck is measured against all surviving Players. Only one
                signal survives.
              </p>
            </div>
          </div>
          <button onClick={() => setModal("rules")}>
            Understand the game <ArrowUpRight size={15} />
          </button>
        </section>
        <div className="operator-bar">
          <span>
            <Terminal size={13} />
            {preview
              ? "SANDBOX CONTROLS"
              : loading
                ? "CONNECTING TO CHAIN"
                : finished
                  ? "SEASON COMPLETE"
                  : round === 0
                    ? "ENROLLMENT"
                    : waiting
                      ? "RANDOMNESS DELIVERY"
                      : "ROUND OPERATIONS"}
          </span>
          {preview ? (
            <button onClick={demoEliminate} disabled={alive <= 1}>
              Simulate elimination <ArrowRight size={13} />
            </button>
          ) : (
            <>
              {minted < 1000 && (
                <button disabled={!wallet || !!busy || loading} onClick={mint}>
                  Mint Player · 0.001 ETH <ArrowRight size={13} />
                </button>
              )}
              {round > 0 && !finished && (
                <button
                  disabled={!wallet || !!busy || loading || left > 0}
                  onClick={advance}
                >
                  {live?.received
                    ? "Settle elimination"
                    : waiting
                      ? "Deliver random result"
                      : "Request elimination"}{" "}
                  <ArrowRight size={13} />
                </button>
              )}
              <button onClick={refresh} aria-label="Refresh chain data">
                <RefreshCw size={13} />
              </button>
            </>
          )}
        </div>
      </main>
      <footer>
        <div className="footer-brand">
          <Glyph /> SQUID GRID<span>A GAME OF CHANCE. A TEST OF NERVE.</span>
        </div>
        <div>
          <span>BUILT ON ETHEREUM SEPOLIA</span>
          <button onClick={() => setModal("deploy")}>
            TESTNET {CHAIN_ID} <ArrowUpRight size={11} />
          </button>
        </div>
      </footer>

      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal === "rules" ? "Game rules" : "Deployment console"}
          >
            <button
              className="close"
              onClick={() => setModal(null)}
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>
            <span className="eyebrow">
              {modal === "rules" ? "THE RULES" : "TESTNET DEPLOYMENT"}
            </span>
            <h2>{modal === "rules" ? "Know the game." : "Enter the game."}</h2>
            {modal === "rules" ? (
              <Rules />
            ) : (
              <>
                <p>
                  Mint price: 0.001 Sepolia ETH. Mint revenue is sent as ETH.
                  Luck deposits swap ETH for NFLX and send it to the pot. Prize
                  handling is manual.
                </p>
                <a
                  className="pot-address"
                  href={EXPLORER + "/address/" + POT}
                  target="_blank"
                  rel="noreferrer"
                >
                  PROTOCOL POT <code>{POT}</code>
                  <ExternalLink size={13} />
                </a>
                <div className="deploy-status">
                  <span className="pulse-dot" />
                  {config?.game
                    ? "ARENA DEPLOYED"
                    : "NFLX POOL & FUNDED WALLET REQUIRED"}
                </div>
                {config?.game ? (
                  <>
                    <div className="address-list">
                      {["game", "oracle", "converter", "potAddress"].map(
                        (k) =>
                          config[k] && (
                            <a
                              key={k}
                              href={EXPLORER + "/address/" + config[k]}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span>
                                {k === "potAddress"
                                  ? "PROTOCOL POT"
                                  : k.toUpperCase()}
                              </span>
                              <code>{short(config[k])}</code>
                              <ExternalLink size={12} />
                            </a>
                          ),
                      )}
                    </div>
                    <button
                      className="secondary"
                      onClick={() => {
                        const blob = new Blob(
                            [JSON.stringify(config, null, 2)],
                            { type: "application/json" },
                          ),
                          url = URL.createObjectURL(blob),
                          a = document.createElement("a");
                        a.href = url;
                        a.download = "deployment.json";
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download size={15} /> Download deployment config
                    </button>
                  </>
                ) : (
                  <>
                    <div className="deployment-fields">
                      <label>
                        NFLX TOKEN ADDRESS
                        <input
                          aria-label="NFLX token address"
                          value={config?.token || ""}
                          onChange={(e) =>
                            setConfig((c) => ({ ...c, token: e.target.value }))
                          }
                          placeholder="0x…"
                        />
                      </label>
                      <label>
                        UNISWAP V3 POOL FEE
                        <select
                          aria-label="Pool fee"
                          value={config?.poolFee || ""}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              poolFee: Number(e.target.value),
                            }))
                          }
                        >
                          <option value="">Choose pool fee</option>
                          <option value="100">0.01%</option>
                          <option value="500">0.05%</option>
                          <option value="3000">0.30%</option>
                          <option value="10000">1.00%</option>
                        </select>
                      </label>
                      <label>
                        PUBLIC NFT IMAGE BASE URI
                        <input
                          aria-label="NFT image base URI"
                          value={config?.imageBaseURI || ""}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              imageBaseURI: e.target.value,
                            }))
                          }
                          placeholder="ipfs://…/"
                        />
                      </label>
                      <p>
                        Use the intended NFLX issuer’s Sepolia token and a
                        liquid WETH pool. These settings are fixed at
                        deployment.
                      </p>
                    </div>
                    <a
                      className="faucet"
                      href="https://faucets.chain.link/sepolia"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Get Sepolia testnet ETH <ArrowUpRight size={14} />
                    </a>
                    <button
                      className="primary"
                      disabled={
                        !!busy ||
                        (!!wallet &&
                          (!config?.token ||
                            !config?.poolFee ||
                            !config?.imageBaseURI))
                      }
                      onClick={wallet ? deploy : connectWallet}
                    >
                      {busy ||
                        (!wallet
                          ? "Connect wallet"
                          : !config?.token
                            ? "NFLX token & pool needed"
                            : !config?.imageBaseURI
                              ? "Public NFT image URI needed"
                              : "Deploy with wallet")}
                      <ArrowUpRight size={16} />
                    </button>
                  </>
                )}
                <div className="load-contract">
                  <label>ALREADY DEPLOYED? SEPOLIA GAME ADDRESS</label>
                  <div>
                    <input
                      value={customAddress}
                      onChange={(e) => setCustomAddress(e.target.value)}
                      placeholder="0x…"
                      aria-label="Game contract address"
                    />
                    <button
                      className="secondary"
                      onClick={loadContract}
                      disabled={!!busy}
                    >
                      Load <Link2 size={14} />
                    </button>
                  </div>
                </div>
                {config?.game && (
                  <button
                    className="text-button"
                    onClick={() => {
                      localStorage.removeItem("squid-grid-active");
                      setConfig({ ...config, game: null });
                      setModal(null);
                    }}
                  >
                    Return to preview
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
