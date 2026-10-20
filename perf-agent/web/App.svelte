<script lang="ts">
  import { onMount } from 'svelte';
  let state: any = null,
    events: any[] = [],
    tab = 'Overview',
    error = '',
    connected = false,
    pending = '',
    threshold = 180,
    details: any = null,
    trace: any = null;
  const tabs = ['Overview', 'Investigation', 'Fix & Verification'];
  $: incident = state?.incidents?.[0];
  $: telemetryOnly =
    (incident?.investigationMode || state?.config?.investigationMode) === 'telemetry-only';
  $: sample = state?.sample;
  $: history = state?.history || [];
  $: maxY =
    Math.max(250, state?.config?.thresholdMs * 1.5 || 0, ...history.map((m: any) => m.p95Ms || 0)) *
    1.1;
  $: first = history[0]?.at || Date.now();
  $: last = history.at(-1)?.at || first + 1;
  $: segments = chartSegments(history);
  $: points = segments.join(' ');
  function chartSegments(samples: any[]) {
    const result: string[] = [];
    let current: string[] = [];
    let previous = 0;
    for (const m of samples) {
      if (
        m.p95Ms === null ||
        m.quality === 'unavailable' ||
        (previous && m.at - previous > (state?.config.pollSeconds || 3) * 2500)
      ) {
        if (current.length) result.push(current.join(' '));
        current = [];
      }
      if (m.p95Ms !== null && m.quality !== 'unavailable') current.push(`${x(m.at)},${y(m.p95Ms)}`);
      previous = m.at;
    }
    if (current.length) result.push(current.join(' '));
    return result;
  }
  $: markers = events.filter(
    (e) => ['deployment', 'incident', 'recovery'].includes(e.kind) && e.at >= first
  );
  $: displayed = events.filter(
    (e) => !incident || e.incident === incident.id || e.kind === 'deployment'
  );
  $: liveMessage = displayed
    .filter((e) => e.data?.method === 'item/agentMessage/delta')
    .slice(-40)
    .map((e) => e.data.delta)
    .join('');
  $: screenshots = displayed.filter((e) => e.kind === 'screenshot').map((e) => e.data);
  $: evidence = displayed.filter((e) => e.kind === 'evidence').flatMap((e) => e.data.files || []);
  $: timeline = compactEvents(displayed);
  function compactEvents(rows: any[]) {
    const items = new Map<string, any>();
    for (const row of rows) {
      const method = row.data?.method;
      if (
        [
          'item/agentMessage/delta',
          'item/commandExecution/outputDelta',
          'thread/tokenUsage/updated',
        ].includes(method)
      )
        continue;
      const item = row.data?.item;
      if (item?.type === 'agentMessage' && !item.text) continue;
      items.set(item?.id || String(row.id), row);
    }
    return [...items.values()].sort((a, b) => a.id - b.id);
  }
  function logRecords(data: any) {
    return (data?.data?.result || [])
      .flatMap((stream: any) => stream.values || [])
      .map((entry: any) => {
        try {
          return JSON.parse(entry[1]);
        } catch {
          return { message: entry[1] };
        }
      });
  }
  function x(at: number) {
    return 45 + ((at - first) / Math.max(last - first, 1)) * 870;
  }
  function y(ms: number) {
    return 235 - (ms / maxY) * 205;
  }
  const fmt = (n: any, suffix = '') =>
    typeof n === 'number' && Number.isFinite(n) ? `${n.toFixed(n < 10 ? 1 : 0)}${suffix}` : '—';
  const time = (n: number) =>
    new Date(n).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  async function action(name: string, body: any = {}) {
    pending = name;
    error = '';
    try {
      const r = await fetch('/api/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      state = data;
    } catch (e) {
      error = String(e);
    } finally {
      pending = '';
    }
  }
  async function inspect(kind: string) {
    try {
      const r = await fetch('/api/' + kind);
      details = await r.json();
      if (!r.ok) throw new Error(details.error);
    } catch (e) {
      error = String(e);
    }
  }
  async function loadTrace(id: string) {
    const r = await fetch('/api/trace/' + id);
    trace = await r.json();
  }
  function spans(t: any) {
    return (t?.batches || t?.resourceSpans || [])
      .flatMap((r: any) =>
        (r.scopeSpans || r.instrumentationLibrarySpans || []).flatMap((s: any) => s.spans || [])
      )
      .sort((a: any, b: any) => Number(a.startTimeUnixNano) - Number(b.startTimeUnixNano));
  }
  function describe(e: any) {
    const d = e.data;
    if (e.kind === 'app-server') {
      const i = d.item;
      if (i?.type === 'agentMessage') {
        try {
          return JSON.parse(i.text).diagnosis || i.text;
        } catch {
          return i.text;
        }
      }
      if (i?.type === 'mcpToolCall') return `${i.server} / ${i.tool} · ${i.status}`;
      if (i?.type === 'commandExecution') return `$ ${i.command} · ${i.status}`;
      if (i?.type === 'fileChange') return `Source change · ${i.status}`;
      if (d.method === 'item/agentMessage/delta') return d.delta;
      return d.method;
    }
    return d.message || d.phase || d.publishing || e.kind;
  }
  onMount(() => {
    let es: EventSource;
    async function init() {
      try {
        const token = new URLSearchParams(location.hash.slice(1)).get('token');
        if (token) {
          await fetch('/api/session', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
          });
          historyReplace();
        }
        const r = await fetch('/api/state');
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        state = data;
        threshold = data.config.thresholdMs;
        es = new EventSource('/api/events');
        es.onopen = () => (connected = true);
        es.onerror = () => (connected = false);
        es.addEventListener('state', (e) => (state = JSON.parse(e.data)));
        es.addEventListener('activity', (e) => {
          const row = JSON.parse(e.data);
          if (!events.some((x) => x.id === row.id)) events = [...events, row].slice(-1600);
        });
      } catch (e) {
        error = String(e);
      }
    }
    void init();
    return () => es?.close();
  });
  function historyReplace() {
    window.history.replaceState(null, '', location.pathname);
  }
</script>

<svelte:head><title>Performance Agent · {state?.status || 'Local lab'}</title></svelte:head>
<div class="shell">
  <aside>
    <a class="brand" href="/" aria-label="Performance Agent home"
      ><span class="brand-icon">↗</span> pulse<span class="brand-dot">.</span></a
    >
    <div class="rail-caption">PERFORMANCE AGENT</div>
    <nav>
      {#each tabs as t, i}<button class:active={tab === t} onclick={() => (tab = t)}
          ><span>0{i + 1}</span>{t}</button
        >{/each}
    </nav>
    <div class="rail-bottom">
      <span class="live-dot" class:offline={!connected}></span>{connected
        ? 'Local system connected'
        : 'Connecting to controller'}
      <p>Codex app-server<br />Local telemetry · isolated changes</p>
      <span class="pill">DEMO ENVIRONMENT</span>
    </div>
  </aside>
  <main>
    <header>
      <div>
        <div class="eyebrow">LOCAL PERFORMANCE LAB / FORMA STOREFRONT</div>
        <h1>{tab}</h1>
        <p class="subtitle">From a slow request to a measured, reviewable fix.</p>
        {#if state}<span class="pill"
            >{state.config.investigationMode === 'telemetry-only'
              ? 'Telemetry only'
              : 'Browser + telemetry'}</span
          >{/if}
      </div>
      <div class="status">
        <span class="live-dot" class:warn={state?.status === 'Blocked'}></span>{state?.status ||
          'Connecting'}<small>AGENT STATUS</small>
      </div>
    </header>
    {#if error}<div class="notice danger" role="alert">
        {error}<button onclick={() => (error = '')} aria-label="Dismiss error">×</button>
      </div>{/if}
    {#if !state}<section class="panel empty">
        <h2>Your local performance lab</h2>
        <p>
          Start with <code>npm run demo</code>, then use its launch link to connect this browser.
        </p>
      </section>
    {:else if tab === 'Overview'}
      <div class="metric-grid">
        <section class="metric">
          <div class="label">DEPLOYED APP · P95 LATENCY</div>
          <div class="metric-value" class:hot={sample?.quality === 'breaching'}>
            {fmt(sample?.p95Ms)}<span>ms</span>
          </div>
          <span class="badge" class:bad={sample?.quality === 'breaching'}
            >{(
              {
                healthy: 'Within threshold',
                breaching: 'Above threshold',
                insufficient: 'Insufficient data',
                unavailable: 'Telemetry unavailable',
              } as any
            )[sample?.quality] || 'Waiting for telemetry'}</span
          >
        </section>
        <section class="metric">
          <div class="label">ALERT THRESHOLD</div>
          <div class="metric-value">{state.config.thresholdMs}<span>ms</span></div>
          <form
            onsubmit={(e) => {
              e.preventDefault();
              action('settings', { thresholdMs: threshold });
            }}
          >
            <input
              aria-label="Threshold in milliseconds"
              type="number"
              min="1"
              max="10000"
              bind:value={threshold}
            /><button disabled={(!!incident && !incident.recovered) || !!pending}>Update</button>
          </form>
        </section>
        <section class="metric">
          <div class="label">REQUEST RATE</div>
          <div class="metric-value">{fmt(sample?.rps)}<span>req/s</span></div>
          <p>{state.traffic.active ? 'Traffic generator running' : 'Traffic generator stopped'}</p>
        </section>
        <section class="metric">
          <div class="label">SERVER ERROR RATE</div>
          <div class="metric-value">
            {fmt(sample?.errorRate === null ? null : sample?.errorRate * 100)}<span>%</span>
          </div>
          <p>Search requests · HTTP 5xx</p>
        </section>
      </div>
      <section class="panel chart-panel">
        <div class="section-heading">
          <div>
            <h2>Latency, in context</h2>
            <p>Live deployed-app measurements · aggregated request histograms</p>
          </div>
          <div class="legend">
            <span class="line-key"></span>p95 <span class="line-key dashed"></span>threshold
          </div>
        </div>
        <svg
          viewBox="0 0 950 275"
          role="img"
          aria-label="Live p95 latency chart with alert threshold and deployment markers"
          >{#each [0, 0.25, 0.5, 0.75, 1] as r}<line
              x1="45"
              y1={y(maxY * r)}
              x2="920"
              y2={y(maxY * r)}
              stroke="#e7ebe6"
            /><text x="0" y={y(maxY * r) + 4} class="axis">{Math.round(maxY * r)}</text>{/each}<line
            x1="45"
            x2="920"
            y1={y(state.config.thresholdMs)}
            y2={y(state.config.thresholdMs)}
            stroke="#bf8659"
            stroke-dasharray="6 6"
          />{#each markers as marker}<line
              x1={x(marker.at)}
              x2={x(marker.at)}
              y1="20"
              y2="235"
              stroke={marker.kind === 'incident' ? '#c46c4f' : '#98a99c'}
              stroke-dasharray="3 5"
            /><circle
              cx={x(marker.at)}
              cy="20"
              r="4"
              fill={marker.kind === 'incident' ? '#c46c4f' : '#2c775d'}
              ><title>{marker.kind} · {time(marker.at)}</title></circle
            >{/each}{#each segments as segment}<polyline
              points={segment}
              fill="none"
              stroke="#28765a"
              stroke-width="3"
              stroke-linejoin="round"
            />{/each}<text x="45" y="265" class="axis">{time(first)}</text><text
            x="850"
            y="265"
            class="axis">{time(last)}</text
          >{#if !points}<text x="475" y="125" text-anchor="middle" fill="#7c8b82"
              >Waiting for enough fresh requests</text
            >{/if}</svg
        >
        <div class="chart-footer">
          <span>WINDOW <b>{state.config.windowSeconds}s</b></span><span
            >SAMPLES (EST.) <b>{fmt(sample?.count)}</b></span
          ><span>FRESHNESS <b>{fmt(sample?.ageSeconds, 's')}</b></span><span
            >SUSTAINED BREACH <b>{state.config.sustainSeconds}s</b></span
          ><span>REVISION <b>{state.deployment?.revision.slice(0, 8)}</b></span>
        </div>
      </section>
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>Run the story</h2>
            <p>Start healthy. Introduce a regression. Let evidence drive the fix.</p>
          </div>
          <span class="pill">ALL DEPLOYMENTS LOCAL</span>
        </div>
        <div class="controls">
          <button
            class="primary"
            disabled={!!pending}
            onclick={() => action(state.traffic.active ? 'traffic-stop' : 'traffic-start')}
            >{state.traffic.active ? 'Ⅱ Stop Traffic' : '▷ Start Traffic'}</button
          ><button
            disabled={!!pending || (!!incident && !incident.recovered)}
            onclick={() => action('regression')}>↗ Deploy Regression</button
          ><a class="button" href={state.urls.app} target="_blank" rel="noreferrer"
            >Open Demo App ↗</a
          ><a
            class="button"
            href={state.urls.grafana + '/d/storefront/local-storefront'}
            target="_blank"
            rel="noreferrer">Open Grafana ↗</a
          ><button
            disabled={!!pending || incident?.phase !== 'PR Ready' || !incident?.validation?.passed}
            onclick={() => action('candidate', { id: incident.id })}
            >Deploy Candidate Locally</button
          ><button
            class="subtle"
            disabled={!!pending}
            onclick={() => {
              if (
                confirm(
                  'Reset to the healthy revision and clear active incident state? Existing worktrees, branches and evidence will be preserved.'
                )
              )
                action('reset');
            }}>↺ Reset Demo</button
          >
        </div>
        {#if pending}<p class="working">{pending} is running…</p>{/if}
        {#if state.traffic.errors || state.traffic.skipped}<p>
            Traffic generator: {state.traffic.errors} failed requests, {state.traffic.skipped} skipped
            slots. Failed requests can include connection interruptions during local deployment.
          </p>{/if}
      </section>
      <div class="note-row">
        <span>● Real HTTP traffic and local telemetry</span><span
          >Candidate validation never changes the monitored deployment.</span
        >
      </div>
    {:else if tab === 'Investigation'}
      <div class="investigation-grid">
        <section class="panel">
          <div class="section-heading">
            <div>
              <h2>Agent activity</h2>
              <p>Actual app-server events · public findings and tool activity</p>
            </div>
            {#if incident && ['Investigating', 'Fixing', 'Validating'].includes(incident.phase)}<button
                onclick={() => action('cancel')}>Cancel</button
              >{/if}
          </div>
          {#if !incident}<div class="empty">
              <div class="empty-icon">⌁</div>
              <h3>Watching for a sustained breach</h3>
              <p>A fresh, sufficiently sampled breach opens one isolated investigation.</p>
            </div>{:else}<div class="incident-meta">
              <code>{incident.id.slice(0, 8)}</code><span
                >Thread {incident.threadId?.slice(0, 16) || 'pending'}</span
              ><span>{incident.tokens.toLocaleString()} tokens</span>
            </div>
            {#if incident.error}<div class="notice danger">
                {incident.error}{#if incident.phase === 'Blocked'}<button
                    onclick={() => action('retry', { id: incident.id })}>Retry same incident</button
                  >{/if}
              </div>{/if}{#if liveMessage}<details class="live-message">
                <summary>Latest streamed agent message</summary>
                <pre>{liveMessage}</pre>
              </details>{/if}
            <div class="timeline">
              {#each timeline as e}<article>
                  <time>{time(e.at)}</time>
                  <div>
                    <span class="event-kind"
                      >{e.kind === 'app-server' ? e.data.item?.type || 'runtime' : e.kind}</span
                    >
                    <p>{describe(e)}</p>
                    {#if e.data.item?.type === 'mcpToolCall' || e.data.item?.type === 'commandExecution'}<details
                      >
                        <summary>Tool details</summary>
                        <pre>{JSON.stringify(e.data.item, null, 2)}</pre>
                      </details>{/if}
                  </div>
                </article>{/each}
            </div>{/if}
        </section>
        <div class="right-column">
          <section class="panel">
            <h2>Evidence desk</h2>
            <p>Query the same local sources the agent uses.</p>
            <div class="controls compact">
              <button onclick={() => inspect('queries')}>Metric query</button><button
                onclick={() => inspect('logs')}>Logs</button
              ><button onclick={() => inspect('traces')}>Traces</button>
            </div>
            {#if details?.traces}<div class="trace-list">
                {#each details.traces as t}<button onclick={() => loadTrace(t.traceID)}
                    >{t.rootTraceName || 'HTTP request'} <b>{t.durationMs}ms</b><small
                      >{t.traceID.slice(0, 16)}</small
                    ></button
                  >{/each}
              </div>{:else if details?.data?.resultType === 'streams'}
              <div class="log-records">
                {#each logRecords(details) as record}
                  <article>
                    <p>
                      <b>{record.route || record.message}</b> · {fmt(record.duration_ms, ' ms')} · HTTP
                      {record.status}
                    </p>
                    {#if record.trace_id}<button onclick={() => loadTrace(record.trace_id)}
                        >Trace {record.trace_id.slice(0, 16)} ↗</button
                      >{/if}
                  </article>
                {/each}
                {#if !logRecords(details).length}<p>No matching logs in this window.</p>{/if}
              </div>
            {:else if details}<pre class="query-result">{JSON.stringify(
                  details,
                  null,
                  2
                )}</pre>{/if}{#if trace}{@const rows = spans(trace)}{@const start = Number(
                rows[0]?.startTimeUnixNano || 0
              )}{@const end = Math.max(
                ...rows.map((s: any) => Number(s.endTimeUnixNano)),
                start + 1
              )}
              <h3>Trace waterfall</h3>
              <div class="waterfall">
                {#each rows as span}<div>
                    <span title={span.name}>{span.name}</span>
                    <div class="track">
                      <i
                        style={`margin-left:${((Number(span.startTimeUnixNano) - start) / (end - start)) * 100}%;width:${Math.max(1, ((Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) / (end - start)) * 100)}%`}
                      ></i>
                    </div>
                    <small
                      >{(
                        (Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) /
                        1e6
                      ).toFixed(1)}ms</small
                    >
                  </div>{/each}
              </div>{/if}
          </section>
          <section class="panel">
            <h2>{telemetryOnly ? 'Investigation evidence' : 'Browser evidence'}</h2>
            {#if telemetryOnly}<p>
                Telemetry-only investigation: metrics, logs and distributed traces are required.
                Browser interaction, screenshots and browser performance traces are not collected.
              </p>{/if}
            {#each screenshots as s}<a href={s.url} target="_blank" rel="noreferrer"
                ><img src={s.url} alt="Browser screenshot captured by Chrome DevTools MCP" /></a
              >{/each}{#each evidence.filter((e) => /\.(png|jpg|webp)$/.test(e.name) && !screenshots.some((s) => s.url === e.url)) as e}<a
                href={e.url}
                target="_blank"
                rel="noreferrer"><img src={e.url} alt={e.name} /></a
              >{/each}{#if !telemetryOnly && !screenshots.length && !evidence.length}<p>
                Screenshots appear after the agent captures them.
              </p>{/if}{#each evidence as e}<a
                class="evidence-link"
                href={e.url}
                target="_blank"
                rel="noreferrer">{e.name} ↗</a
              >{/each}
          </section>
        </div>
      </div>
    {:else if !incident}<section class="panel empty">
        <div class="empty-icon">⎇</div>
        <h2>A measured fix starts with evidence</h2>
        <p>
          When the agent has a diagnosis and a patch, independent validation results will appear
          here.
        </p>
      </section>{:else}<div class="notice" class:danger={incident.phase === 'Blocked'}>
        {incident.recovered
          ? 'Fresh monitored measurements confirm local recovery.'
          : incident.validation?.passed
            ? 'Candidate improvement validated locally. Recovery requires deployment and fresh monitored measurements.'
            : incident.error || 'A completed Codex turn does not count as a validated fix.'}
      </div>
      <div class="verification-grid">
        <section class="panel">
          <h2>Diagnosis</h2>
          <p>{incident.outcome?.diagnosis || incident.diagnosis || 'Investigation in progress.'}</p>
          <div class="diff-header">
            <h2>Application patch</h2>
            <code>{incident.branch || 'Worktree pending'}</code>
          </div>
          <pre
            class="diff">{#each (incident.diff || 'No patch available yet.').split('\n') as line}<span
                class:add={line.startsWith('+')}
                class:remove={line.startsWith('-')}>{line}{'\n'}</span
              >{/each}</pre>
        </section>
        <section class="panel">
          <h2>Independent verification</h2>
          <p>Separate baseline and candidate instances. Identical fixture and offered load.</p>
          {#if incident.validation}{@const v = incident.validation}
            <div class="compare">
              <div>
                <span>AFFECTED BASELINE</span><b>{fmt(v.baseline.p95Ms)}<small>ms p95</small></b>
              </div>
              <div>
                <span>CANDIDATE ONLY</span><b>{fmt(v.candidate.p95Ms)}<small>ms p95</small></b>
              </div>
            </div>
            <div class="bar">
              <div
                style={`width:${Math.min(100, (v.candidate.p95Ms / v.baseline.p95Ms) * 100)}%`}
              ></div>
            </div>
            <h3>{fmt(v.improvement * 100)}% lower p95</h3>
            <div class="check-row">
              <span>Correctness</span><b>{v.correctness.candidate.checks} cases passed</b>
            </div>
            <div class="check-row">
              <span>Performance gate</span><b>{v.passed ? 'Passed' : 'Blocked'}</b>
            </div>
            <div class="check-row">
              <span>Measured samples</span><b>{v.baseline.requests} / {v.candidate.requests}</b>
            </div>
            <div class="check-row">
              <span>Errors · baseline / candidate</span><b
                >{v.baseline.errors} / {v.candidate.errors}</b
              >
            </div>
            <p>
              {v.methodology.rounds} alternating rounds · {v.methodology.warmupSeconds}s warm-up · {v
                .methodology.secondsPerRound}s per measurement · {v.methodology.rps} req/s
            </p>
            <details>
              <summary>Full methodology and results</summary>
              <pre>{JSON.stringify(v, null, 2)}</pre>
            </details>{:else}<div class="empty">
              <p>Waiting for an application patch and independent benchmark results.</p>
            </div>{/if}
        </section>
      </div>
      <section class="panel publish-panel">
        <div>
          <h2>{incident.prUrl ? 'Draft pull request ready' : 'Review & deployment'}</h2>
          <p>
            {incident.publishing ||
              'Publishing waits for independent correctness and performance gates.'}
          </p>
          {#if incident.error}<p class="error-text">{incident.error}</p>{/if}
        </div>
        <div class="controls">
          {#if incident.prUrl}<a
              class="button"
              href={incident.prUrl}
              target="_blank"
              rel="noreferrer">Open draft PR ↗</a
            >{/if}{#if incident.validation?.passed}<a
              class="button"
              href={`/evidence/${incident.id}/PR.md`}
              target="_blank"
              rel="noreferrer">PR evidence</a
            ><button
              class="primary"
              disabled={!!pending || incident.phase !== 'PR Ready'}
              onclick={() => action('candidate', { id: incident.id })}
              >Deploy Candidate Locally</button
            >{#if state.config.targetRemote}<button
                onclick={() => action('publish', { id: incident.id })}>Retry publishing</button
              >{/if}{/if}
        </div>
      </section>{/if}
    <footer>
      <span>pulse / performance agent</span><span>LOCAL LAB · NO HOSTED OBSERVABILITY</span><span
        >Evidence over assumptions.</span
      >
    </footer>
  </main>
</div>
