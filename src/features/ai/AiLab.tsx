import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUp, Bot, BrainCircuit, Check, ChevronRight, Clock3, Database, FileSearch, Globe2, Layers3, Lightbulb, LockKeyhole, MessageSquarePlus, Network, Paperclip, Plus, Radar, RotateCcw, ShieldCheck, Sparkles, Target, WandSparkles } from 'lucide-react';
import { ApiError, streamAiChat, useBootstrap, useHealth, type AiStreamResult } from '../../app/api';
import { SafeMarkdown } from '../../components/SafeMarkdown';
import { Button, Card, PageHeader, Provenance, StatusPill, SymbolAvatar, cn } from '../../components/UI';

const prompts = [
  { icon: Target, title: 'Stress-test my portfolio', detail: 'Map downside concentration and catalysts' },
  { icon: FileSearch, title: 'Research NVDA', detail: 'Build a balanced bull and bear brief' },
  { icon: Globe2, title: 'Compare HK technology leaders', detail: 'Fundamentals, momentum, and risk' },
  { icon: Network, title: 'Scan cross-market signals', detail: 'Find linked themes across US, HK, and CN' },
];

type AiState = 'idle' | 'connecting' | 'streaming' | 'done' | 'error';

interface SubmittedEvidence {
  readonly available: boolean;
  readonly classification: string;
  readonly source: string;
  readonly asOf: string;
  readonly ageSeconds: number | null;
  readonly marketCoverage: string[];
  readonly equity: number | null;
  readonly currency: string;
  readonly positions: Array<{ symbol: string; region: string; shares: number }>;
}

function formatDataAge(totalSeconds: number) {
  const age = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(age / 86_400);
  const hours = Math.floor((age % 86_400) / 3_600);
  const minutes = Math.floor((age % 3_600) / 60);
  const seconds = age % 60;
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${seconds}s`].filter(Boolean).join(' ');
}

function captureSubmittedEvidence(data: ReturnType<typeof useBootstrap>['data']): SubmittedEvidence {
  if (!data) {
    return {
      available: false,
      classification: 'Unavailable',
      source: 'Local bootstrap did not respond',
      asOf: 'Unavailable',
      ageSeconds: null,
      marketCoverage: [],
      equity: null,
      currency: 'USD',
      positions: [],
    };
  }
  return {
    available: true,
    classification: data.provenance.classification,
    source: data.provenance.source,
    asOf: data.provenance.asOf,
    ageSeconds: data.provenance.ageSeconds,
    marketCoverage: [...data.capabilities.markets],
    equity: data.portfolio.equity,
    currency: data.portfolio.baseCurrency ?? 'USD',
    positions: data.portfolio.positions.map(({ symbol, region, shares }) => ({ symbol, region, shares })),
  };
}

function formatEvidenceAsOf(value: string) {
  if (!Number.isFinite(Date.parse(value))) return value;
  return `${new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(value))} UTC`;
}

function SubmittedEvidenceDeck({ evidence }: { evidence: SubmittedEvidence }) {
  const portfolioValue = evidence.equity === null
    ? 'Unavailable'
    : `${evidence.currency} ${evidence.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <section className="ai-evidence-deck" aria-labelledby="ai-evidence-title" data-testid="ai-evidence-deck">
      <div className="ai-evidence-head">
        <div>
          <span className="eyebrow"><ShieldCheck size={12} /> SUBMITTED EVIDENCE</span>
          <h3 id="ai-evidence-title">Trace every factual claim</h3>
          <p>Exact request snapshot. These records support the response; they do not independently verify the market.</p>
        </div>
        <StatusPill tone="neutral">2 anchored inputs</StatusPill>
      </div>

      <div className="ai-evidence-map" role="img" aria-label="Submitted market context and submitted paper portfolio flow into a qualitative research synthesis. This is not a forecast.">
        <span><b>S1</b><small>Market context</small></span>
        <ArrowRight aria-hidden="true" />
        <span className="ai-evidence-synthesis"><Radar size={15} /><strong>Qualitative synthesis</strong><small>NON-FORECAST</small></span>
        <ArrowRight className="reverse" aria-hidden="true" />
        <span><b>S2</b><small>Paper portfolio</small></span>
      </div>

      <div className="ai-evidence-grid">
        <article id="ai-evidence-s1" className="ai-evidence-card" tabIndex={-1} data-testid="ai-evidence-s1">
          <header><span><Database size={15} /></span><div><b>S1</b><strong>Synthetic market snapshot</strong><small>Provenance · coverage · submitted time</small></div></header>
          <dl>
            <div><dt>Classification</dt><dd>{evidence.classification}</dd></div>
            <div><dt>Coverage</dt><dd>{evidence.marketCoverage.length ? evidence.marketCoverage.join(' · ') : 'Unavailable'}</dd></div>
            <div className="wide"><dt>Source</dt><dd>{evidence.source}</dd></div>
            <div className="wide"><dt>Submitted as of</dt><dd>{formatEvidenceAsOf(evidence.asOf)}</dd></div>
          </dl>
          <p className="ai-freshness-note"><Clock3 size={13} /><span><strong>Freshness boundary</strong>Timestamp supplied by the simulator—not proof that data is fresh or live.</span></p>
        </article>

        <article id="ai-evidence-s2" className="ai-evidence-card" tabIndex={-1} data-testid="ai-evidence-s2">
          <header><span><Layers3 size={15} /></span><div><b>S2</b><strong>Paper portfolio snapshot</strong><small>Account state attached to this request</small></div></header>
          <dl>
            <div><dt>Net equity</dt><dd>{portfolioValue}</dd></div>
            <div><dt>Positions</dt><dd>{evidence.available ? evidence.positions.length : 'Unavailable'}</dd></div>
          </dl>
          <div className="ai-evidence-holdings" aria-label="Submitted position share counts">
            {evidence.positions.length ? evidence.positions.slice(0, 5).map((position) => <span key={`${position.region}-${position.symbol}`}><SymbolAvatar symbol={position.symbol} size="sm" /><b>{position.symbol}</b><small>{position.region} · {position.shares.toLocaleString()} sh</small></span>) : <p>{evidence.available ? 'No open positions in the submitted snapshot.' : 'Portfolio details were unavailable at submission.'}</p>}
            {evidence.positions.length > 5 && <p>+{evidence.positions.length - 5} additional submitted positions</p>}
          </div>
          <p className="ai-evidence-limit"><ShieldCheck size={13} /> Symbols and share counts are context—not inferred weights or a recommendation.</p>
        </article>
      </div>
    </section>
  );
}

export function AiLab() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [state, setState] = useState<AiState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiStreamResult | null>(null);
  const [submittedEvidence, setSubmittedEvidence] = useState<SubmittedEvidence | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const health = useHealth();
  const bootstrap = useBootstrap();
  const provenance = bootstrap.data?.provenance;
  const positions = bootstrap.data?.portfolio.positions ?? [];
  const asOf = provenance ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(provenance.asOf)) : null;
  const exactAsOf = provenance ? new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(provenance.asOf)) : null;
  const completedMode = result ? (result.synthetic ? 'Deterministic demo response' : 'Connected DeepSeek response') : null;
  const configuredMode = health.isSuccess ? (health.data.aiMode === 'deepseek-proxy' ? 'DeepSeek proxy configured' : 'Deterministic demo configured') : health.isError ? 'AI service unavailable' : 'Checking AI service';

  const reset = () => {
    abortRef.current?.abort();
    setQuery(''); setSubmittedQuery(''); setAnswer(''); setResult(null); setSubmittedEvidence(null); setError(null); setState('idle');
  };

  const run = async (text?: string) => {
    const question = (text ?? query).trim();
    if (!question) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setQuery(question);
    setSubmittedQuery(question);
    setAnswer('');
    setResult(null);
    setError(null);
    setState('connecting');
    const evidence = captureSubmittedEvidence(bootstrap.data);
    setSubmittedEvidence(evidence);
    const context = [
      `Data classification: ${evidence.classification}.`,
      `Source: ${evidence.source}.`,
      `Data as of: ${evidence.asOf}.`,
      `Market coverage: ${evidence.marketCoverage.join(', ') || 'unavailable'}.`,
      `Paper portfolio equity: ${evidence.equity === null ? 'unavailable' : `${evidence.equity} ${evidence.currency}`}.`,
      `Positions: ${evidence.positions.map((position) => `${position.symbol} ${position.shares} shares (${position.region})`).join(', ') || (evidence.available ? 'none' : 'unavailable')}.`,
    ].join(' ');
    try {
      setState('streaming');
      const response = await streamAiChat([{ role: 'user', content: `${question}\n\nSimulator context supplied by Beta-Stock: ${context}` }], (chunk) => setAnswer((current) => current + chunk), controller.signal);
      setResult(response);
      setState('done');
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof ApiError ? `${caught.message}${caught.code ? ` (${caught.code})` : ''}` : 'The AI service could not complete this request.');
      setState('error');
    }
  };

  return (
    <div className="page ai-page" data-testid="ai-page">
      <PageHeader eyebrow="RESEARCH COPILOT" title="AI Lab" description="Ask the local AI route to reason over the exact synthetic context shown here." actions={<StatusPill tone={completedMode ? 'good' : health.isError ? 'warn' : 'neutral'}><ShieldCheck size={13} /><span data-testid="ai-mode">{completedMode ?? configuredMode}</span></StatusPill>} />
      <div className="ai-security-strip"><div><LockKeyhole size={15} /><span><strong>Server credential boundary.</strong> The browser calls only the local Beta-Stock API. It never receives or stores a model credential.</span></div><Provenance compact /></div>
      <div className="ai-mobile-context" aria-label="Submitted AI data context" data-testid="ai-mobile-context">
        <span><small>Classification</small><strong>{provenance?.classification ?? 'Unavailable'}</strong></span>
        <span><small>Data age</small><strong>{provenance ? formatDataAge(provenance.ageSeconds) : 'Unavailable'}</strong></span>
        <span><small>Exact as of</small><strong>{exactAsOf ? `${exactAsOf} UTC` : 'Unavailable'}</strong></span>
        <span><small>Source</small><strong>{provenance?.source ?? 'Bootstrap did not respond'}</strong></span>
      </div>

      <div className="ai-workspace">
        <Card className="ai-sidebar">
          <Button variant="secondary" className="new-thread" onClick={reset}><MessageSquarePlus size={15} /> New research thread</Button>
          <div className="thread-label">EXAMPLE TOPICS</div>
          <div className="thread-list">{prompts.map((prompt) => <button key={prompt.title} onClick={() => void run(prompt.title)}><span><Bot size={14} /><strong>{prompt.title}</strong></span><small>Run new request</small></button>)}</div>
          <div className="ai-sidebar-footer"><div className="model-indicator"><span className="ai-glyph"><BrainCircuit size={17} /></span><span><strong>{health.isSuccess ? health.data.aiMode : 'Unverified'}</strong><small>{completedMode ?? configuredMode}</small></span><StatusPill tone={completedMode ? 'good' : 'neutral'}>{completedMode ? 'Responded' : 'Not called'}</StatusPill></div><button onClick={reset}><RotateCcw size={14} /> Clear local thread</button></div>
        </Card>

        <Card className="ai-conversation">
          {state === 'idle' ? <div className="ai-welcome">
            <motion.div className="ai-hero-glyph" initial={{ scale: .92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><WandSparkles size={25} /></motion.div>
            <span className="eyebrow">SERVER-GENERATED ANALYSIS</span>
            <h2>What are we testing today?</h2>
            <p>The response mode is disclosed only after the local API responds: deterministic demo when no key is configured, or connected DeepSeek when the proxy succeeds.</p>
            <div className="prompt-grid">{prompts.map((prompt) => <button key={prompt.title} onClick={() => void run(prompt.title)}><span><prompt.icon size={17} /></span><strong>{prompt.title}</strong><small>{prompt.detail}</small><ChevronRight size={14} /></button>)}</div>
          </div> : <div className="ai-chat">
            <div className="user-message"><span>DA</span><div><small>DEMO ACCOUNT</small><p>{submittedQuery}</p></div></div>
            <div className={cn('assistant-message', (state === 'connecting' || (state === 'streaming' && !answer)) && 'thinking')}><span className="ai-glyph"><BrainCircuit size={17} /></span><div><small>{state === 'done' ? completedMode?.toUpperCase() : state === 'error' ? 'REQUEST FAILED' : 'LOCAL AI ROUTE - RESPONDING'}</small>{state === 'error' ? <div className="ai-request-error" role="alert" data-testid="ai-error"><strong>Analysis unavailable</strong><p>{error}</p><Button variant="secondary" onClick={() => void run(submittedQuery)}>Retry request</Button></div> : answer ? <SafeMarkdown source={answer} className="ai-response-content" data-testid="ai-response" /> : <p><i /><i /><i /> Waiting for the first verified response chunk...</p>}{state === 'done' && submittedEvidence && <SubmittedEvidenceDeck evidence={submittedEvidence} />}{state === 'done' && <div className="ai-answer-footer"><span><Check size={13} /> {completedMode} - no order execution capability</span><button onClick={() => void navigator.clipboard?.writeText(answer)}>Copy response</button></div>}</div></div>
          </div>}
          <div className="ai-composer"><div className="context-chips">{provenance ? <><span><Target size={13} /> {provenance.classification}</span><span><Clock3 size={13} /> {asOf} UTC</span><span><FileSearch size={13} /> {provenance.source}</span></> : <span><Clock3 size={13} /> Context unavailable</span>}</div><div className="composer-input"><button aria-label="Attachments are not available" disabled title="Attachments are not available yet"><Paperclip size={17} /></button><textarea data-testid="ai-input" rows={1} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void run(); } }} placeholder="Ask about a stock, portfolio, or scenario..." /><button className="send-button" data-testid="ai-send" onClick={() => void run()} disabled={!query.trim() || state === 'connecting' || state === 'streaming'} aria-label="Send"><ArrowUp size={17} /></button></div><div className="composer-footer"><span><Sparkles size={12} /> Verify all model output. Synthetic data is not investment advice.</span><span>Enter send - Shift+Enter new line</span></div></div>
        </Card>

        <aside className="ai-context-panel">
          <Card>
            <div className="context-panel-head"><span><Lightbulb size={15} /> Submitted context</span><button disabled title="Additional context is not available yet"><Plus size={14} /></button></div>
            <div className="context-block"><span className="context-label">PAPER PORTFOLIO</span><div className="context-equity"><span>Net equity</span><strong>{bootstrap.data ? `$${bootstrap.data.portfolio.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'Unavailable'}</strong></div><div className="context-equity"><span>Positions</span><strong>{positions.length}</strong></div></div>
            <div className="context-block"><span className="context-label">TOP POSITIONS</span>{positions.slice(0, 4).map((position) => <div className="context-position" key={position.symbol}><SymbolAvatar symbol={position.symbol} size="sm" /><span><strong>{position.symbol}</strong><small>{position.region}</small></span><b>{position.shares.toLocaleString()} sh</b></div>)}</div>
            <div className="context-block"><span className="context-label">DATA SOURCE</span><div className="regime-card"><i className={cn(!provenance && 'unknown')} /><span><strong>{provenance?.classification ?? 'Unavailable'}</strong><small>{provenance?.source ?? 'Bootstrap did not respond'}</small></span></div></div>
          </Card>
          <Card className="ai-usage-card"><div><Clock3 size={14} /><span><strong>Data as of</strong><small>{asOf ? `${asOf} UTC` : 'Unavailable'}</small></span></div><div><Sparkles size={14} /><span><strong>Model authority</strong><small>Research only - cannot execute</small></span></div></Card>
        </aside>
      </div>
    </div>
  );
}
