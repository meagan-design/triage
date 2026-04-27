/* ============================================================
   Strategic Triage Board — app.js
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     1. CONSTANTS & CONFIG
  ========================================================== */

  const STORAGE_KEY = 'triage_board_v4';

  /* ----------------------------------------------------------
     SUPABASE CONFIG
     Fill these in after creating your Supabase project.
     See setup instructions in the README.
  ---------------------------------------------------------- */
  const SUPABASE_URL      = 'https://dasmczehszbimiserntk.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhc21jemVoc3piaW1pc2VybnRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTEyNTUsImV4cCI6MjA5Mjg4NzI1NX0.DBjEeN0Yt0OeJ144r5Wp3QMWliX2aG4n8H8yGa7Q-8I';

  /* ----------------------------------------------------------
     PASSWORD GATE
     SHA-256 hash of the access password.
  ---------------------------------------------------------- */
  const AUTH_HASH = '73ab4fd8b55a6812e78948471eda2885fe63e351553f2ba7fa8c8881ce23e3f9';
  const AUTH_SESSION_KEY = 'triage_authed_v1';

  const LANES = [
    { id: 'inbox',           label: 'Inbox' },
    { id: 'needs-placement', label: 'Needs Placement' },
    { id: 'today',           label: 'Today' },
    { id: 'this-week',       label: 'This Week' },
    { id: 'this-month',      label: 'This Month' },
    { id: 'strategic-radar', label: 'Strategic Radar' },
    { id: 'open-loops',      label: 'Open Loops' },
    { id: 'waiting',         label: 'Waiting / Blocked' },
  ];

  const INITIATIVES = [
    'BF Commercial Relationship',
    'Sales Team',
    'Installation Sales Framework',
    'International Distributors',
    'US Distribution / Master Halco',
    'Legal / Web',
    'Meta / CRM Lead Optimization',
    'Distribution Pivot',
    'Picket',
    'Better Websites',
    'Commercial Ops Platform',
  ];

  // Initiatives tabled by default on first run
  const DEFAULT_TABLED = ['Better Websites'];

  const WORK_MODES = [
    { id: 'figure-out',   label: 'Figure out',   abbr: 'FO',
      desc: 'Unclear ask or path — dive in and make sense of it' },
    { id: 'move-forward', label: 'Move forward', abbr: 'MF',
      desc: 'Straightforward progress on a known item' },
    { id: 'communicate',  label: 'Communicate',  abbr: 'CM',
      desc: 'Send, present, explain, launch, hand off, or have a key conversation' },
    { id: 'review',       label: 'Review',       abbr: 'RV',
      desc: 'Read, assess, redline, QA, validate, or pressure-test' },
    { id: 'collaborate',  label: 'Collaborate',  abbr: 'CL',
      desc: 'Working through something with others — alignment or shared progress' },
  ];

  const STAGES = ['Unclear', 'In progress', 'Ready', 'Waiting', 'Blocked', 'Done'];

  /* ----------------------------------------------------------
     CLICKUP STATUS MAP
     Keys are lowercase (matching is case-insensitive).
  ---------------------------------------------------------- */
  const CLICKUP_STATUS_MAP = {
    'doing':        { lane: 'this-week',       weekRelevance: 'this-week', displayGroup: 'Imported — In Progress', itemStage: 'In progress' },
    'in progress':  { lane: 'this-week',       weekRelevance: 'this-week', displayGroup: 'Imported — In Progress', itemStage: 'In progress' },
    'in-progress':  { lane: 'this-week',       weekRelevance: 'this-week', displayGroup: 'Imported — In Progress', itemStage: 'In progress' },
    'to do':        { lane: 'needs-placement', weekRelevance: 'unclear',   displayGroup: 'Imported — To Do',       itemStage: 'Unclear'     },
    'todo':         { lane: 'needs-placement', weekRelevance: 'unclear',   displayGroup: 'Imported — To Do',       itemStage: 'Unclear'     },
    'open':         { lane: 'needs-placement', weekRelevance: 'unclear',   displayGroup: 'Imported — To Do',       itemStage: 'Unclear'     },
    'not started':  { lane: 'needs-placement', weekRelevance: 'unclear',   displayGroup: 'Imported — To Do',       itemStage: 'Unclear'     },
    'blocked':      { lane: 'waiting',         weekRelevance: 'unclear',   displayGroup: 'Imported — Blocked',     itemStage: 'Blocked'     },
    'on hold':      { lane: 'waiting',         weekRelevance: 'unclear',   displayGroup: 'Imported — Blocked',     itemStage: 'Waiting'     },
    'complete':     { lane: 'needs-placement', weekRelevance: 'unclear',   displayGroup: null,                     itemStage: 'Done'        },
    'completed':    { lane: 'needs-placement', weekRelevance: 'unclear',   displayGroup: null,                     itemStage: 'Done'        },
    'done':         { lane: 'needs-placement', weekRelevance: 'unclear',   displayGroup: null,                     itemStage: 'Done'        },
    'closed':       { lane: 'needs-placement', weekRelevance: 'unclear',   displayGroup: null,                     itemStage: 'Done'        },
    'review':       { lane: 'this-week',       weekRelevance: 'this-week', displayGroup: 'Imported — In Progress', itemStage: 'In progress' },
  };

  const CLICKUP_STATUS_DEFAULT = {
    lane: 'needs-placement', weekRelevance: 'unclear',
    displayGroup: 'Imported — To Do', itemStage: 'Unclear',
  };

  const TODAY_MAX = 5;

  /* ==========================================================
     2. STATE
  ========================================================== */

  let state = {
    items:                [],
    tabledInitiatives:    [],
    completedInitiatives: [],
    deletedInitiatives:   [],
    filter:               { initiative: null },
    completedFilter:      { initiative: null, period: 'all' },
    activeItemId:         null,
    ui:                   { editingItemId: null },
  };

  /* ==========================================================
     3. SUPABASE CLIENT
  ========================================================== */

  // Initialised once, after DOMContentLoaded. null if config not yet set.
  let supabaseClient = null;
  let _supabaseSaveTimer = null;

  function initSupabase() {
    if (
      SUPABASE_URL  === 'REPLACE_WITH_YOUR_SUPABASE_URL' ||
      SUPABASE_ANON_KEY === 'REPLACE_WITH_YOUR_SUPABASE_ANON_KEY'
    ) {
      console.info('Supabase not configured — running in local-only mode.');
      return;
    }
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
      console.warn('Supabase init failed:', e);
    }
  }

  function showSyncIndicator(syncing) {
    const el   = document.getElementById('sync-indicator');
    const dot  = document.getElementById('sync-dot');
    const lbl  = document.getElementById('sync-label');
    if (!el) return;
    dot.className  = 'sync-dot' + (syncing ? ' syncing' : '');
    lbl.textContent = syncing ? 'Syncing…' : 'Saved';
    el.classList.add('visible');
    clearTimeout(el._hideTimer);
    if (!syncing) {
      el._hideTimer = setTimeout(() => el.classList.remove('visible'), 2000);
    }
  }

  async function pushToSupabase(data) {
    if (!supabaseClient) return;
    showSyncIndicator(true);
    try {
      const { error } = await supabaseClient
        .from('triage_state')
        .upsert({ id: 'main', data, updated_at: new Date().toISOString() });
      if (error) throw error;
      showSyncIndicator(false);
    } catch (e) {
      console.warn('Supabase push failed:', e);
      showSyncIndicator(false);
    }
  }

  function scheduleSupabasePush(data) {
    clearTimeout(_supabaseSaveTimer);
    _supabaseSaveTimer = setTimeout(() => pushToSupabase(data), 600);
  }

  function setupRealtimeSync() {
    if (!supabaseClient) return;
    supabaseClient
      .channel('triage_realtime')
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'triage_state',
        filter: 'id=eq.main',
      }, payload => {
        if (!payload.new?.data) return;
        // Don't clobber active editing
        if (document.querySelector('dialog[open]')) return;
        restoreStateFromData(payload.new.data);
        // Cache locally
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.new.data)); } catch(e) {}
        render();
        showToast('Board updated from another device', 2000);
      })
      .subscribe();
  }

  /* ==========================================================
     4. STORAGE
  ========================================================== */

  function buildStateData() {
    return {
      version:              2,
      items:                state.items,
      tabledInitiatives:    state.tabledInitiatives,
      completedInitiatives: state.completedInitiatives,
      deletedInitiatives:   state.deletedInitiatives,
    };
  }

  function restoreStateFromData(data) {
    state.items                = data.items                || [];
    state.tabledInitiatives    = data.tabledInitiatives    || [];
    state.completedInitiatives = data.completedInitiatives || [];
    state.deletedInitiatives   = data.deletedInitiatives   || [];
  }

  function saveState() {
    const data = buildStateData();
    // 1. Write to localStorage immediately (keeps UI snappy)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
    // 2. Debounced push to Supabase (background, non-blocking)
    scheduleSupabasePush(data);
  }

  async function loadState() {
    // 1. Restore from localStorage first so UI can render immediately
    const cached = localStorage.getItem(STORAGE_KEY);
    let hasLocalData = false;
    if (cached) {
      try { restoreStateFromData(JSON.parse(cached)); hasLocalData = true; } catch(e) {}
    }

    // 2. Fetch from Supabase (authoritative, most recent across devices)
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('triage_state')
          .select('data')
          .eq('id', 'main')
          .single();
        if (!error && data?.data) {
          restoreStateFromData(data.data);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data.data)); } catch(e) {}
          return;
        }
      } catch (e) {
        console.warn('Supabase load failed, using local data:', e);
      }
    }

    // 3. Fresh install (nothing local, nothing remote)
    if (!hasLocalData) {
      state.items             = getInitialData();
      state.tabledInitiatives = DEFAULT_TABLED.slice();
      saveState();
    }
  }

  // Migrate a v1 item to v2 schema
  function migrateItem(old) {
    const stageMap = {
      active:  'In progress',
      waiting: 'Waiting',
      parked:  'Unclear',
      done:    'Done',
    };
    const workModeMap = {
      thinking:      'figure-out',
      decision:      'figure-out',
      communication: 'communicate',
      admin:         'move-forward',
      'follow-up':   'communicate',
    };
    const item = createItem({
      ...old,
      stage:           stageMap[old.status]          || 'Unclear',
      workMode:        workModeMap[old.executionType] || null,
      waitingOnItemId: old.waitingOnItemId            || null,
      // Remap any stale PICID references
      initiative:      old.initiative === 'PICID' ? 'Picket' : old.initiative,
    });
    delete item.status;
    delete item.mentalWeight;
    delete item.executionType;
    return item;
  }

  /* --- JSON Export / Import --- */

  function exportJSON() {
    const data = {
      ...buildStateData(),
      exportedAt:  new Date().toISOString(),
      description: 'Strategic Triage Board — export this file to move your data between devices.',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().slice(0,10);
    a.href     = url;
    a.download = `triage-board-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported — save this file to Google Drive or iCloud to restore on another device', 5000);
  }

  function handleJSONImport(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.items || !Array.isArray(data.items)) {
          showToast('Invalid file — not a Triage Board export'); return;
        }
        if (!confirm(`Import ${data.items.length} items from ${data.exportedAt || 'this file'}?\n\nThis will replace your current data.`)) return;
        state.items                = data.items;
        state.tabledInitiatives    = data.tabledInitiatives    || [];
        state.completedInitiatives = data.completedInitiatives || [];
        state.deletedInitiatives   = data.deletedInitiatives   || [];
        state.filter.initiative    = null;
        state.activeItemId         = null;
        saveState();
        render();
        showToast(`Imported ${data.items.length} items ✓`, 3500);
      } catch (err) {
        showToast('Could not read file — make sure it is a valid Triage Board JSON export');
        console.error('JSON import error:', err);
      }
    };
    reader.readAsText(file);
  }

  /* ==========================================================
     4. DATA LAYER
  ========================================================== */

  function createItem(overrides = {}) {
    return {
      id:              crypto.randomUUID(),
      title:           '',
      initiative:      null,
      source:          'native',
      clickupStatus:   null,
      clickupSpace:    null,
      clickupFolder:   null,
      clickupList:     null,
      displayGroup:    null,
      lane:            'inbox',
      weekRelevance:   'unclear',
      workMode:        null,
      stage:           'Unclear',
      openLoop:        false,
      dueDate:         null,
      notes:           '',
      nextStep:        '',
      waitingOn:       '',
      waitingOnItemId: null,
      completedAt:     null,
      createdAt:       Date.now(),
      updatedAt:       Date.now(),
      ...overrides,
    };
  }

  function updateItem(id, changes) {
    const idx = state.items.findIndex(i => i.id === id);
    if (idx === -1) return;
    state.items[idx] = { ...state.items[idx], ...changes, updatedAt: Date.now() };
    saveState();
    render();
  }

  function moveItem(id, targetLane) {
    const changes = { lane: targetLane };
    if (targetLane === 'waiting')    changes.stage    = 'Waiting';
    if (targetLane === 'open-loops') changes.openLoop = true;
    updateItem(id, changes);
  }

  function markDone(id) {
    updateItem(id, { stage: 'Done', completedAt: Date.now() });
    showToast('Marked done');
  }

  function addItem(item) {
    state.items.unshift(item);
    saveState();
    render();
  }

  /* --- Initiative Lifecycle --- */

  function tableInitiative(name) {
    if (!state.tabledInitiatives.includes(name)) {
      state.tabledInitiatives.push(name);
      saveState();
      render();
      showToast(`"${name}" tabled`);
    }
  }

  function activateInitiative(name) {
    state.tabledInitiatives    = state.tabledInitiatives.filter(n => n !== name);
    state.completedInitiatives = state.completedInitiatives.filter(n => n !== name);
    saveState();
    render();
    showToast(`"${name}" reactivated`);
  }

  function completeInitiative(name) {
    state.tabledInitiatives = state.tabledInitiatives.filter(n => n !== name);
    if (!state.completedInitiatives.includes(name)) {
      state.completedInitiatives.push(name);
    }
    saveState();
    render();
    showToast(`"${name}" marked complete`);
  }

  function reopenInitiative(name) {
    state.completedInitiatives = state.completedInitiatives.filter(n => n !== name);
    saveState();
    render();
    showToast(`"${name}" reopened`);
  }

  function deleteInitiative(name) {
    state.tabledInitiatives    = state.tabledInitiatives.filter(n => n !== name);
    state.completedInitiatives = state.completedInitiatives.filter(n => n !== name);
    if (!state.deletedInitiatives.includes(name)) {
      state.deletedInitiatives.push(name);
    }
    // Detach initiative from all items — they stay in their lanes, just unassigned
    state.items = state.items.map(i =>
      i.initiative === name ? { ...i, initiative: null, updatedAt: Date.now() } : i
    );
    saveState();
    render();
    showToast(`"${name}" deleted — its items are now unassigned`);
  }

  /* Active visibility: items that should appear in regular lanes */
  function isActiveVisible(item) {
    if (item.stage === 'Done') return false;
    if (item.initiative) {
      if (state.tabledInitiatives.includes(item.initiative))    return false;
      if (state.completedInitiatives.includes(item.initiative)) return false;
    }
    return true;
  }

  function getItemsForLane(laneId) {
    return state.items.filter(item => {
      if (item.lane !== laneId) return false;
      if (!isActiveVisible(item)) return false;
      if (state.filter.initiative && item.initiative !== state.filter.initiative) return false;
      return true;
    });
  }

  function updateLaneMeta(laneId, count) {
    const countEl = document.getElementById('count-' + laneId);
    const badge   = document.getElementById('badge-' + laneId);
    if (countEl) countEl.textContent = count > 0 ? count : '';
    if (badge)   badge.textContent   = count > 0 ? count : '';
  }

  /* ==========================================================
     5. INITIAL DATA  (real ClickUp import — 2026-04-27)
        "Buckley Fence — Sales Department — Meagan Open Items"
        47 tasks: 8 "doing" → this-week, 39 "to do" → needs-placement
        Order: URGENT first, then HIGH, then NORMAL within each lane.
  ========================================================== */

  function getInitialData() {
    const d = s => new Date(s).getTime();
    const CU_BASE = {
      source: 'clickup',
      clickupSpace:  'Sales Department',
      clickupFolder: 'Meagan — Open Items',
    };

    return [

      /* ── THIS WEEK — URGENT ─────────────────────────────── */
      createItem({ ...CU_BASE,
        title: 'Rutjes — Container order: submit this week, email Elke re: mid-June ETA + buffer',
        initiative: 'International Distributors',
        lane: 'this-week', clickupStatus: 'doing', displayGroup: 'Imported — In Progress',
        stage: 'In progress', weekRelevance: 'this-week',
        workMode: 'move-forward', clickupList: 'International Distributors',
        createdAt: d('2026-03-23'), updatedAt: d('2026-04-20'),
      }),
      createItem({ ...CU_BASE,
        title: 'Jo Eller — Create distributor accessory fulfillment SOP for container orders',
        initiative: 'International Distributors',
        lane: 'this-week', clickupStatus: 'doing', displayGroup: 'Imported — In Progress',
        stage: 'In progress', weekRelevance: 'this-week',
        workMode: 'collaborate', clickupList: 'International Distributors',
        createdAt: d('2026-04-09'), updatedAt: d('2026-04-22'),
      }),
      createItem({ ...CU_BASE,
        title: 'EU Retail Price Sheet — Run ex-VAT calculations + send to Marketing',
        initiative: 'International Distributors',
        lane: 'this-week', clickupStatus: 'doing', displayGroup: 'Imported — In Progress',
        stage: 'In progress', weekRelevance: 'this-week',
        workMode: 'move-forward', clickupList: 'International Distributors',
        createdAt: d('2026-03-08'), updatedAt: d('2026-04-27'),
      }),
      createItem({ ...CU_BASE,
        title: 'Follow up with Jo Eller — dual-invoice process (Picket + BF) and CSR briefing',
        initiative: 'Picket',
        lane: 'this-week', clickupStatus: 'doing', displayGroup: 'Imported — In Progress',
        stage: 'In progress', weekRelevance: 'this-week',
        workMode: 'communicate', clickupList: 'Picket',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-11'),
      }),
      createItem({ ...CU_BASE,
        title: 'Verify Picket Stripe account setup and connection to Buckley Fence',
        initiative: 'Picket',
        lane: 'this-week', clickupStatus: 'doing', displayGroup: 'Imported — In Progress',
        stage: 'In progress', weekRelevance: 'this-week',
        workMode: 'review', clickupList: 'Picket',
        createdAt: d('2026-03-23'), updatedAt: d('2026-03-25'),
      }),

      /* ── THIS WEEK — HIGH ───────────────────────────────── */
      createItem({ ...CU_BASE,
        title: 'AG exemption compliance + tariff compliance inquiry',
        initiative: 'BF Commercial Relationship',
        lane: 'this-week', clickupStatus: 'doing', displayGroup: 'Imported — In Progress',
        stage: 'In progress', weekRelevance: 'this-week',
        workMode: 'figure-out', clickupList: 'BF Commercial Relationship',
        createdAt: d('2026-04-09'), updatedAt: d('2026-04-22'),
      }),
      createItem({ ...CU_BASE,
        title: 'Texas A&M visit — schedule prep meeting with Mike, Jaime, and Lindsey',
        initiative: 'Sales Team',
        lane: 'this-week', clickupStatus: 'doing', displayGroup: 'Imported — In Progress',
        stage: 'In progress', weekRelevance: 'this-week',
        workMode: 'collaborate', clickupList: 'Sales Team',
        dueDate: '2026-05-15',
        createdAt: d('2026-04-20'), updatedAt: d('2026-04-27'),
      }),
      createItem({ ...CU_BASE,
        title: "Plan Mike's paternity leave coverage — divide and conquer with Lindsey",
        initiative: 'Sales Team',
        lane: 'this-week', clickupStatus: 'doing', displayGroup: 'Imported — In Progress',
        stage: 'In progress', weekRelevance: 'this-week',
        workMode: 'collaborate', clickupList: 'Sales Team',
        dueDate: '2026-05-01',
        createdAt: d('2026-04-20'), updatedAt: d('2026-04-27'),
      }),

      /* ── NEEDS PLACEMENT — URGENT ────────────────────────── */
      createItem({ ...CU_BASE,
        title: 'Finish prep for Jim conversation — finalize graphic + talking points',
        initiative: 'BF Commercial Relationship',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'BF Commercial Relationship',
        createdAt: d('2026-04-20'), updatedAt: d('2026-04-20'),
      }),
      createItem({ ...CU_BASE,
        title: 'Negotiate buyback price with Master Halco SLC',
        initiative: 'US Distribution / Master Halco',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'US Distribution / Master Halco',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),
      createItem({ ...CU_BASE,
        title: 'Follow up with Anna (tech) on BF Stripe account setup',
        initiative: 'Picket',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'Picket',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),

      /* ── NEEDS PLACEMENT — HIGH: Sales Team ─────────────── */
      createItem({ ...CU_BASE,
        title: 'Finalize and launch CRM hygiene / account ownership rules with sales team',
        initiative: 'Sales Team',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'Sales Team',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),
      createItem({ ...CU_BASE,
        title: 'Container order sales strategy — transition reps to factory-direct / LCL selling',
        initiative: 'Sales Team',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Sales Team',
        createdAt: d('2026-04-20'), updatedAt: d('2026-04-27'),
      }),

      /* ── NEEDS PLACEMENT — HIGH: International Distributors */
      createItem({ ...CU_BASE,
        title: 'Rutjes — Correct invoice INV-012687 ($440 → $240)',
        initiative: 'International Distributors',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'move-forward', clickupList: 'International Distributors',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),
      createItem({ ...CU_BASE,
        title: 'Rutjes post-mortem — review email thread and build international distributor order SOP',
        initiative: 'International Distributors',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'review', clickupList: 'International Distributors',
        createdAt: d('2026-04-09'), updatedAt: d('2026-04-27'),
      }),

      /* ── NEEDS PLACEMENT — HIGH: Installation Sales Framework */
      createItem({ ...CU_BASE,
        title: 'Spend time with Sherie & Mike on updated installation collateral',
        initiative: 'Installation Sales Framework',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'Installation Sales Framework',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),
      createItem({ ...CU_BASE,
        title: 'Negotiate shared pricing matrix with SAL (preferred CO installer)',
        initiative: 'Installation Sales Framework',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'Installation Sales Framework',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),
      createItem({ ...CU_BASE,
        title: 'Define minimum job size for offering installation + Zmaps installer guidelines',
        initiative: 'Installation Sales Framework',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Installation Sales Framework',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),
      createItem({ ...CU_BASE,
        title: 'Draft change order SOP for installation projects',
        initiative: 'Installation Sales Framework',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'move-forward', clickupList: 'Installation Sales Framework',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),
      createItem({ ...CU_BASE,
        title: 'Draft generic installer agreement + per-job bid form (follow up with Anna)',
        initiative: 'Installation Sales Framework',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'move-forward', clickupList: 'Installation Sales Framework',
        createdAt: d('2026-03-08'), updatedAt: d('2026-04-27'),
      }),

      /* ── NEEDS PLACEMENT — HIGH: US Distribution / Master Halco */
      createItem({ ...CU_BASE,
        title: 'Brief CSRs (via Jo) on Master Halco SLC fulfillment workflow',
        initiative: 'US Distribution / Master Halco',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'US Distribution / Master Halco',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),

      /* ── NEEDS PLACEMENT — HIGH: Legal / Web ────────────── */
      createItem({ ...CU_BASE,
        title: 'Nick — US Distribution Agreement (BF + Master Halco SLC)',
        initiative: 'Legal / Web',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'Legal / Web',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),
      createItem({ ...CU_BASE,
        title: 'Nick — Picket Lead Referral Agreement (framework TBD)',
        initiative: 'Legal / Web',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Legal / Web',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),
      createItem({ ...CU_BASE,
        title: 'Write installation terms for BF invoice line items (Buckley-Backed + Standard)',
        initiative: 'Legal / Web',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'move-forward', clickupList: 'Legal / Web',
        createdAt: d('2026-03-08'), updatedAt: d('2026-04-27'),
      }),

      /* ── NEEDS PLACEMENT — HIGH: Meta / CRM ─────────────── */
      createItem({ ...CU_BASE,
        title: 'Dig into Klaviyo — understand available fields, segments, and lead-level data',
        initiative: 'Meta / CRM Lead Optimization',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Meta / CRM Lead Optimization',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),
      createItem({ ...CU_BASE,
        title: 'Match Klaviyo lead records to Zoho closed-won deals',
        initiative: 'Meta / CRM Lead Optimization',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Meta / CRM Lead Optimization',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),
      createItem({ ...CU_BASE,
        title: 'Build expected value formula by lead type + define Meta event values',
        initiative: 'Meta / CRM Lead Optimization',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Meta / CRM Lead Optimization',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),

      /* ── NEEDS PLACEMENT — HIGH: Distribution Pivot ──────── */
      createItem({ ...CU_BASE,
        title: 'Define criteria for qualifying distribution partners',
        initiative: 'Distribution Pivot',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Distribution Pivot',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),
      createItem({ ...CU_BASE,
        title: 'Build financial model / pro forma for distribution pivot',
        initiative: 'Distribution Pivot',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Distribution Pivot',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),
      createItem({ ...CU_BASE,
        title: 'Debrief with Jerrod after SLC visit — capture fulfillment gap insights',
        initiative: 'Distribution Pivot',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'Distribution Pivot',
        dueDate: '2026-03-21', openLoop: true,
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),
      createItem({ ...CU_BASE,
        title: 'Boise / RMF Idaho — Stay looped in + develop fulfillment agreement',
        initiative: 'Distribution Pivot',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'move-forward', clickupList: 'Distribution Pivot',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),
      createItem({ ...CU_BASE,
        title: 'Research and identify Texas distribution partner candidates',
        initiative: 'Distribution Pivot',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Distribution Pivot',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),
      createItem({ ...CU_BASE,
        title: 'Research and identify East Coast / Eastern US distribution partner candidates',
        initiative: 'Distribution Pivot',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Distribution Pivot',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),

      /* ── NEEDS PLACEMENT — HIGH: Better Websites (tabled) ── */
      createItem({ ...CU_BASE,
        title: 'Decide: trade name + Stripe account structure for Better.Website',
        initiative: 'Better Websites',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Better Websites',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),
      createItem({ ...CU_BASE,
        title: "Negotiate Johnny shares: 10% of sale price + 1% revenue (vs. traditional ownership)",
        initiative: 'Better Websites',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'Better Websites',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),
      createItem({ ...CU_BASE,
        title: 'Discuss Better.Website Stripe account structure with Jo Eller',
        initiative: 'Better Websites',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'Better Websites',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),

      /* ── NEEDS PLACEMENT — NORMAL: International Distributors */
      createItem({ ...CU_BASE,
        title: 'Design EU crate return / recycling incentive program',
        initiative: 'International Distributors',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'International Distributors',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),
      createItem({ ...CU_BASE,
        title: 'EU Lead Tracking — Verify Sjoerd using survey consistently + set up Zoho report',
        initiative: 'International Distributors',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'review', clickupList: 'International Distributors',
        createdAt: d('2026-03-08'), updatedAt: d('2026-04-27'),
      }),

      /* ── NEEDS PLACEMENT — NORMAL: Installation Sales Framework */
      createItem({ ...CU_BASE,
        title: 'Follow up with Johnny on trusted installer list — what did he do with it?',
        initiative: 'Installation Sales Framework',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'Installation Sales Framework',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),

      /* ── NEEDS PLACEMENT — NORMAL: Legal / Web ──────────── */
      createItem({ ...CU_BASE,
        title: 'Draft Terms of Use page for Buckley Fence website',
        initiative: 'Legal / Web',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'move-forward', clickupList: 'Legal / Web',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),

      /* ── NEEDS PLACEMENT — NORMAL: Meta / CRM ───────────── */
      createItem({ ...CU_BASE,
        title: 'Hand off event values to tech team for Zoho↔Meta backend integration',
        initiative: 'Meta / CRM Lead Optimization',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'communicate', clickupList: 'Meta / CRM Lead Optimization',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),

      /* ── NEEDS PLACEMENT — NORMAL: Distribution Pivot ────── */
      createItem({ ...CU_BASE,
        title: 'Clarify regional territory boundaries between Master Halco SLC and RMF Idaho',
        initiative: 'Distribution Pivot',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Distribution Pivot',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),

      /* ── NEEDS PLACEMENT — NORMAL: Picket ───────────────── */
      createItem({ ...CU_BASE,
        title: 'Define Picket lead bucket framework formally',
        initiative: 'Picket',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Picket',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),

      /* ── NEEDS PLACEMENT — NORMAL: Better Websites (tabled) */
      createItem({ ...CU_BASE,
        title: 'Determine customer-facing terms of service for Better.Website clients',
        initiative: 'Better Websites',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Better Websites',
        createdAt: d('2026-03-08'), updatedAt: d('2026-03-08'),
      }),
      createItem({ ...CU_BASE,
        title: "Set up Rewardful affiliate program (50% first 1,000 / then 30%)",
        initiative: 'Better Websites',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'move-forward', clickupList: 'Better Websites',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),
      createItem({ ...CU_BASE,
        title: "Explore packaging Johnny's drawing tool into BetterFenceWebsite.com",
        initiative: 'Better Websites',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'figure-out', clickupList: 'Better Websites',
        createdAt: d('2026-03-09'), updatedAt: d('2026-03-09'),
      }),
      createItem({ ...CU_BASE,
        title: "Read and digest Kyle's Fract business plan + Better.Website sales manual",
        initiative: 'Better Websites',
        lane: 'needs-placement', clickupStatus: 'to do', displayGroup: 'Imported — To Do',
        stage: 'Unclear', weekRelevance: 'unclear',
        workMode: 'review', clickupList: 'Better Websites',
        createdAt: d('2026-03-23'), updatedAt: d('2026-03-23'),
      }),

    ];
  }

  /* ==========================================================
     6. UTILITIES
  ========================================================== */

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  function formatWeekLabel(date) {
    const monday = getWeekStart(date);
    return 'Week of ' + new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(monday);
  }

  function getWeekStart(date) {
    const d   = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatDueDate(dateStr) {
    if (!dateStr) return '';
    const due   = new Date(dateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff  = Math.round((due - today) / 86400000);
    if (diff < 0)   return 'Overdue ' + Math.abs(diff) + 'd';
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    if (diff <= 7)  return 'Due in ' + diff + 'd';
    return 'Due ' + new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(due);
  }

  function dueDateClass(dateStr) {
    if (!dateStr) return '';
    const due   = new Date(dateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff  = Math.round((due - today) / 86400000);
    if (diff < 0)  return 'overdue';
    if (diff <= 2) return 'due-soon';
    return '';
  }

  function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
      const val = item[key] || 'Unassigned';
      (acc[val] = acc[val] || []).push(item);
      return acc;
    }, {});
  }

  function showToast(msg, ms = 2600) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    el.classList.remove('hiding');
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.classList.add('hiding');
      setTimeout(() => { el.hidden = true; }, 300);
    }, ms);
  }

  function workModeBadge(mode) {
    if (!mode) return '';
    const wm = WORK_MODES.find(w => w.id === mode);
    if (!wm) return '';
    return `<span class="work-mode-badge wm--${escapeHtml(mode)}" title="${escapeHtml(wm.label)}">${escapeHtml(wm.abbr)}</span>`;
  }

  function stagePillHtml(stage) {
    if (!stage || stage === 'Unclear') return '';
    const cls = {
      'In progress': 'stage--in-progress',
      'Ready':       'stage--ready',
      'Waiting':     'stage--waiting',
      'Blocked':     'stage--blocked',
      'Done':        'stage--done',
    }[stage] || '';
    return cls ? `<span class="stage-pill ${cls}">${escapeHtml(stage)}</span>` : '';
  }

  function formatCompletedDate(ts) {
    if (!ts) return '';
    const d    = new Date(ts);
    const now  = new Date();
    const diff = Math.round((now - d) / 86400000);
    if (diff === 0) return 'Completed today';
    if (diff === 1) return 'Completed yesterday';
    if (diff <= 7)  return `Completed ${diff}d ago`;
    return 'Completed ' + new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
  }

  /* ==========================================================
     7. CARD RENDERER
  ========================================================== */

  function renderCard(item, { tabled = false, completed = false, showCompletedDate = false } = {}) {
    const isExpanded  = state.activeItemId === item.id;
    const dueDateStr  = formatDueDate(item.dueDate);
    const dueCls      = dueDateClass(item.dueDate);

    const isInProgress = item.source === 'clickup' && item.displayGroup === 'Imported — In Progress';
    const isDone       = item.stage === 'Done';
    const cardCls = [
      'card',
      tabled                              ? 'card--tabled'      : '',
      completed                           ? 'card--completed'   : '',
      !tabled && !completed && item.openLoop && !isDone ? 'card--open-loop'   : '',
      !tabled && !completed && item.stage === 'Waiting' && !isDone ? 'card--waiting'     : '',
      !tabled && !completed && item.stage === 'Blocked' && !isDone ? 'card--blocked'     : '',
      !tabled && !completed && isInProgress && !isDone  ? 'card--in-progress' : '',
      isDone                              ? 'card--done'        : '',
    ].filter(Boolean).join(' ');

    const completedDateStr = (showCompletedDate || completed) && isDone
      ? formatCompletedDate(item.completedAt || item.updatedAt)
      : '';

    return `
      <article class="${cardCls}" data-id="${escapeHtml(item.id)}">
        <div class="card-main" role="button" tabindex="0" aria-expanded="${isExpanded}">
          <div class="card-header-row">
            ${item.source === 'clickup' ? '<span class="source-badge">CU</span>' : ''}
            <h4 class="card-title">${escapeHtml(item.title)}</h4>
          </div>
          <div class="card-meta">
            ${item.initiative
              ? `<span class="initiative-tag" title="${escapeHtml(item.initiative)}">${escapeHtml(item.initiative)}</span>`
              : ''}
            ${workModeBadge(item.workMode)}
            ${stagePillHtml(item.stage)}
            ${dueDateStr ? `<span class="due-date ${dueCls}">${escapeHtml(dueDateStr)}</span>` : ''}
            ${completedDateStr ? `<span class="completed-date-badge">${escapeHtml(completedDateStr)}</span>` : ''}
            ${item.clickupStatus ? `<span class="clickup-status-badge">${escapeHtml(item.clickupStatus)}</span>` : ''}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-move" data-id="${escapeHtml(item.id)}" data-action="move">Move</button>
          <button class="btn-edit" data-id="${escapeHtml(item.id)}" data-action="edit">Edit</button>
          ${!isDone
            ? `<button class="btn-done" data-id="${escapeHtml(item.id)}" data-action="done">Done</button>`
            : ''}
        </div>
        ${isExpanded ? renderCardDetail(item) : ''}
      </article>`;
  }

  function renderCardDetail(item) {
    const fields = [];

    // ClickUp source breadcrumb
    const crumbParts = [item.clickupSpace, item.clickupFolder, item.clickupList].filter(Boolean);
    if (crumbParts.length) {
      fields.push({
        label:     'Source',
        valueHtml: `<span class="card-detail-breadcrumb">${crumbParts.map(escapeHtml).join(' › ')}</span>`,
      });
    }

    if (item.notes)    fields.push({ label: 'Notes',     valueHtml: escapeHtml(item.notes) });
    if (item.nextStep) fields.push({ label: 'Next Step', valueHtml: escapeHtml(item.nextStep) });

    // Waiting On — plain text or linked item
    if (item.waitingOn || item.waitingOnItemId) {
      let waitHtml = '';
      if (item.waitingOnItemId) {
        const linked = state.items.find(i => i.id === item.waitingOnItemId);
        if (linked) {
          waitHtml = `
            <span class="dep-item-link" data-id="${escapeHtml(linked.id)}" role="button" tabindex="0"
                  title="Open linked item">
              <span class="dep-item-link-arrow">→</span>
              ${escapeHtml(linked.title)}
              ${stagePillHtml(linked.stage)}
            </span>`;
        } else {
          waitHtml = escapeHtml(item.waitingOn || '[Linked item removed]');
        }
      } else {
        waitHtml = escapeHtml(item.waitingOn);
      }
      fields.push({ label: 'Waiting On', valueHtml: waitHtml });
    }

    if (!fields.length) return '';

    return `
      <div class="card-detail">
        ${fields.map(f => `
          <div class="card-detail-field">
            <div class="card-detail-label">${escapeHtml(f.label)}</div>
            <div class="card-detail-value">${f.valueHtml}</div>
          </div>`).join('')}
      </div>`;
  }

  /* ==========================================================
     8. LANE RENDERERS
  ========================================================== */

  function render() {
    renderSidebar();
    LANES.forEach(lane => renderLane(lane.id));
    renderTabledInitiatives();
    renderCompletedInitiatives();
    renderCompletedItems();
    renderWeeklyReview();
    // Keep detail modal live if it's open
    const detailModal = document.getElementById('initiative-detail-modal');
    if (detailModal && detailModal.open) {
      const name = document.getElementById('init-detail-name').textContent;
      if (name) renderInitiativeDetailBody(name);
    }
  }

  function renderLane(laneId) {
    if (laneId === 'strategic-radar') { renderStrategicRadar(); return; }
    if (laneId === 'needs-placement') { renderNeedsPlacementLane(); return; }
    if (laneId === 'this-week')       { renderThisWeekLane(); return; }

    const container = document.getElementById('cards-' + laneId);
    if (!container) return;

    const items        = getItemsForLane(laneId);
    const displayItems = laneId === 'today' ? items.slice(0, TODAY_MAX) : items;

    updateLaneMeta(laneId, items.length);

    if (laneId === 'today') {
      const warn = document.getElementById('today-cap-warning');
      if (warn) warn.hidden = items.length <= TODAY_MAX;
    }

    container.innerHTML = displayItems.length
      ? displayItems.map(i => renderCard(i)).join('')
      : '<p class="lane-empty">Nothing here</p>';
  }

  /* Needs Placement — groups ClickUp "To Do" and native items */
  function renderNeedsPlacementLane() {
    const container = document.getElementById('cards-needs-placement');
    if (!container) return;

    const items = getItemsForLane('needs-placement');
    updateLaneMeta('needs-placement', items.length);

    if (!items.length) {
      container.innerHTML = '<p class="lane-empty">Nothing here</p>';
      return;
    }

    const imported = items.filter(i => i.source === 'clickup');
    const native   = items.filter(i => i.source !== 'clickup');
    let html = '';

    if (imported.length) html += renderCardGroup('Imported — To Do', 'to-do', imported);
    if (native.length)   html += renderCardGroup(imported.length ? 'Unplaced Captures' : null, 'native', native);

    container.innerHTML = html;
  }

  /* This Week — groups ClickUp "Doing" (In Progress) separately */
  function renderThisWeekLane() {
    const container = document.getElementById('cards-this-week');
    if (!container) return;

    const items = getItemsForLane('this-week');
    updateLaneMeta('this-week', items.length);

    if (!items.length) {
      container.innerHTML = '<p class="lane-empty">Nothing here</p>';
      return;
    }

    const inProgress = items.filter(i => i.source === 'clickup' && i.displayGroup === 'Imported — In Progress');
    const other      = items.filter(i => !(i.source === 'clickup' && i.displayGroup === 'Imported — In Progress'));
    let html = '';

    if (inProgress.length) html += renderCardGroup('Imported — In Progress', 'in-progress', inProgress);
    if (other.length)      html += renderCardGroup(inProgress.length ? 'Other This Week' : null, 'native', other);

    container.innerHTML = html;
  }

  function renderCardGroup(label, styleKey, items) {
    const labelHtml = label
      ? `<div class="card-group-label card-group-label--${styleKey}">
           ${escapeHtml(label)} <span class="card-group-count">${items.length}</span>
         </div>`
      : '';
    return `
      <div class="card-group">
        ${labelHtml}
        <div class="card-list">${items.map(i => renderCard(i)).join('')}</div>
      </div>`;
  }

  function renderStrategicRadar() {
    const container = document.getElementById('cards-strategic-radar');
    if (!container) return;

    // Only show non-tabled, non-completed initiatives in radar
    const activeInits = INITIATIVES.filter(i =>
      !state.tabledInitiatives.includes(i) && !state.completedInitiatives.includes(i)
    );
    const items   = getItemsForLane('strategic-radar');
    updateLaneMeta('strategic-radar', items.length);

    const byInit = groupBy(items, 'initiative');

    container.innerHTML = activeInits.map(init => {
      const initItems = byInit[init] || [];
      return `
        <div class="initiative-block ${initItems.length === 0 ? 'initiative-block--empty' : ''}">
          <div class="initiative-label">${escapeHtml(init)}</div>
          <div class="initiative-cards">
            ${initItems.length
              ? initItems.map(i => renderCard(i)).join('')
              : '<p class="no-items-placeholder">No items in radar</p>'}
          </div>
        </div>`;
    }).join('');
  }

  function renderTabledInitiatives() {
    const section   = document.getElementById('tabled-initiatives');
    const container = document.getElementById('cards-tabled-initiatives');
    const navLink   = document.getElementById('nav-tabled');
    const badge     = document.getElementById('badge-tabled');
    const countEl   = document.getElementById('count-tabled');

    if (!container) return;

    const hasTabled = state.tabledInitiatives.length > 0;
    if (section)  section.hidden  = !hasTabled;
    if (navLink)  navLink.hidden  = !hasTabled;
    if (!hasTabled) {
      if (badge)   badge.textContent   = '';
      if (countEl) countEl.textContent = '';
      return;
    }

    const tabledItems = state.items.filter(i =>
      i.initiative && state.tabledInitiatives.includes(i.initiative) && i.stage !== 'Done'
    );
    const total = tabledItems.length;

    if (badge)   badge.textContent   = total > 0 ? total : '';
    if (countEl) countEl.textContent = total > 0 ? total : '';

    container.innerHTML = state.tabledInitiatives.map(initName => {
      const items = tabledItems.filter(i => i.initiative === initName);
      return `
        <div class="tabled-block">
          <div class="tabled-block-header">
            <span class="tabled-block-name">${escapeHtml(initName)}</span>
            <button class="btn-activate" data-initiative="${escapeHtml(initName)}" data-action="activate">
              Activate
            </button>
          </div>
          ${items.length
            ? `<div class="card-list">${items.map(i => renderCard(i, { tabled: true })).join('')}</div>`
            : '<p class="tabled-empty">No open items</p>'}
        </div>`;
    }).join('');
  }

  function renderCompletedInitiatives() {
    const section   = document.getElementById('completed-initiatives');
    const container = document.getElementById('cards-completed-initiatives');
    const navLink   = document.getElementById('nav-completed-init');
    const badge     = document.getElementById('badge-completed-init');
    const countEl   = document.getElementById('count-completed-init');

    if (!container) return;

    const hasCompleted = state.completedInitiatives.length > 0;
    if (section)  section.hidden  = !hasCompleted;
    if (navLink)  navLink.hidden  = !hasCompleted;
    if (!hasCompleted) {
      if (badge)   badge.textContent   = '';
      if (countEl) countEl.textContent = '';
      return;
    }

    const allCompletedItems = state.items.filter(i =>
      i.initiative && state.completedInitiatives.includes(i.initiative)
    );
    const total = allCompletedItems.length;
    if (badge)   badge.textContent   = total > 0 ? total : '';
    if (countEl) countEl.textContent = total > 0 ? total : '';

    container.innerHTML = state.completedInitiatives.map(initName => {
      const items      = allCompletedItems.filter(i => i.initiative === initName);
      const doneCount  = items.filter(i => i.stage === 'Done').length;
      const activeCount = items.filter(i => i.stage !== 'Done').length;
      return `
        <div class="completed-init-block">
          <div class="completed-init-block-header">
            <div class="completed-init-block-meta">
              <span class="completed-init-block-name">${escapeHtml(initName)}</span>
              <span class="completed-init-block-stats">${doneCount} done${activeCount > 0 ? ` · ${activeCount} open` : ''}</span>
            </div>
            <button class="btn-reopen-init" data-initiative="${escapeHtml(initName)}" data-action="reopen-completed">
              Reopen
            </button>
          </div>
          ${items.length
            ? `<div class="card-list">${items.map(i => renderCard(i, { completed: true, showCompletedDate: true })).join('')}</div>`
            : '<p class="completed-init-empty">No items</p>'}
        </div>`;
    }).join('');
  }

  function renderCompletedItems() {
    const container = document.getElementById('cards-completed-items');
    if (!container) return;

    const now        = Date.now();
    const weekStart  = getWeekStart(new Date()).getTime();
    const monthStart = (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.getTime(); })();
    const past3m     = now - 90 * 86400000;

    // All done items, excluding items that belong to completed initiatives
    // (those are shown in the Completed Initiatives section)
    let items = state.items.filter(i =>
      i.stage === 'Done' &&
      (!i.initiative || !state.completedInitiatives.includes(i.initiative))
    );

    // Period filter
    const period = state.completedFilter.period;
    if (period === 'this-week') {
      items = items.filter(i => (i.completedAt || i.updatedAt) >= weekStart);
    } else if (period === 'this-month') {
      items = items.filter(i => (i.completedAt || i.updatedAt) >= monthStart);
    } else if (period === 'past-3m') {
      items = items.filter(i => (i.completedAt || i.updatedAt) >= past3m);
    }

    // Initiative filter
    if (state.completedFilter.initiative) {
      items = items.filter(i => i.initiative === state.completedFilter.initiative);
    }

    // Sort newest first
    items.sort((a, b) => (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt));

    updateLaneMeta('completed-items', items.length);

    // Populate initiative dropdown with all initiatives that have done items
    const allDone    = state.items.filter(i =>
      i.stage === 'Done' && (!i.initiative || !state.completedInitiatives.includes(i.initiative))
    );
    const initOptions = [...new Set(allDone.map(i => i.initiative).filter(Boolean))].sort();
    const initSel = document.getElementById('completed-initiative-filter');
    if (initSel) {
      const currentVal = state.completedFilter.initiative || '';
      initSel.innerHTML = `<option value="">All initiatives</option>` +
        initOptions.map(i =>
          `<option value="${escapeHtml(i)}"${i === currentVal ? ' selected' : ''}>${escapeHtml(i)}</option>`
        ).join('');
    }

    container.innerHTML = items.length
      ? items.map(i => renderCard(i, { showCompletedDate: true })).join('')
      : '<p class="lane-empty">No completed items match the current filter</p>';
  }

  function renderSidebar() {
    const wl = document.getElementById('week-label');
    if (wl) wl.textContent = formatWeekLabel(new Date());

    // Active initiatives
    const list = document.getElementById('initiative-list');
    if (list) {
      const activeInits = INITIATIVES.filter(i =>
        !state.tabledInitiatives.includes(i) &&
        !state.completedInitiatives.includes(i) &&
        !state.deletedInitiatives.includes(i)
      );
      list.innerHTML = activeInits.map(init => {
        const count  = state.items.filter(i => i.initiative === init && isActiveVisible(i)).length;
        const active = state.filter.initiative === init;
        return `<li>
          <div class="initiative-chip-row">
            <button class="initiative-chip ${active ? 'active' : ''}"
                    data-initiative="${escapeHtml(init)}"
                    title="${escapeHtml(init)}">
              ${escapeHtml(init)}${count ? `<span class="initiative-chip-count">(${count})</span>` : ''}
            </button>
            <button class="btn-init-action" data-initiative="${escapeHtml(init)}" data-category="active"
                    title="Initiative actions" aria-label="Actions for ${escapeHtml(init)}">···</button>
          </div>
        </li>`;
      }).join('');
    }

    // Tabled panel
    const tabledPanel = document.getElementById('tabled-init-panel');
    const tabledList  = document.getElementById('tabled-initiative-list');
    const hasTabled   = state.tabledInitiatives.length > 0;
    if (tabledPanel) tabledPanel.hidden = !hasTabled;
    if (tabledList && hasTabled) {
      tabledList.innerHTML = state.tabledInitiatives.map(init => `
        <li>
          <div class="initiative-chip-row">
            <button class="initiative-chip initiative-chip--secondary"
                    data-initiative="${escapeHtml(init)}" title="${escapeHtml(init)}">
              ${escapeHtml(init)}
            </button>
            <button class="btn-init-action" data-initiative="${escapeHtml(init)}" data-category="tabled"
                    title="Initiative actions" aria-label="Actions for ${escapeHtml(init)}">···</button>
          </div>
        </li>`).join('');
    }

    // Completed panel
    const completedPanel = document.getElementById('completed-init-panel');
    const completedList  = document.getElementById('completed-initiative-list');
    const hasCompleted   = state.completedInitiatives.length > 0;
    if (completedPanel) completedPanel.hidden = !hasCompleted;
    if (completedList && hasCompleted) {
      completedList.innerHTML = state.completedInitiatives.map(init => `
        <li>
          <div class="initiative-chip-row">
            <button class="initiative-chip initiative-chip--completed"
                    data-initiative="${escapeHtml(init)}" title="${escapeHtml(init)}">
              ${escapeHtml(init)}
            </button>
            <button class="btn-init-action" data-initiative="${escapeHtml(init)}" data-category="completed"
                    title="Initiative actions" aria-label="Actions for ${escapeHtml(init)}">···</button>
          </div>
        </li>`).join('');
    }

    const clearBtn = document.getElementById('clear-filter-btn');
    if (clearBtn) clearBtn.hidden = !state.filter.initiative;
  }

  function renderWeeklyReview() {
    const summaryEl = document.getElementById('review-summary');
    if (!summaryEl) return;

    const weekStart = getWeekStart(new Date()).getTime();

    // Exclude tabled AND completed initiative items from weekly review
    const isReviewable = i =>
      !i.initiative ||
      (!state.tabledInitiatives.includes(i.initiative) &&
       !state.completedInitiatives.includes(i.initiative));

    const all            = state.items.filter(isReviewable);
    const completedWeek  = all.filter(i => i.stage === 'Done' && (i.completedAt || i.updatedAt) >= weekStart);
    const active         = all.filter(i => isActiveVisible(i));
    const waiting        = all.filter(i => (i.stage === 'Waiting' || i.stage === 'Blocked') && i.stage !== 'Done');
    const openLoops      = all.filter(i => i.openLoop && i.stage !== 'Done');
    const needsPlacement = all.filter(i => i.lane === 'needs-placement' && i.stage !== 'Done');

    summaryEl.innerHTML = `
      <div class="review-stat-card">
        <div class="review-stat-label">Completed This Week</div>
        <div class="review-stat-value done">${completedWeek.length}</div>
      </div>
      <div class="review-stat-card">
        <div class="review-stat-label">Active Items</div>
        <div class="review-stat-value">${active.length}</div>
      </div>
      <div class="review-stat-card">
        <div class="review-stat-label">Waiting / Blocked</div>
        <div class="review-stat-value waiting">${waiting.length}</div>
      </div>
      <div class="review-stat-card">
        <div class="review-stat-label">Open Loops</div>
        <div class="review-stat-value open-loops">${openLoops.length}</div>
      </div>
      <div class="review-stat-card">
        <div class="review-stat-label">Needs Placement</div>
        <div class="review-stat-value">${needsPlacement.length}</div>
      </div>`;
  }

  /* ==========================================================
     9. MODAL HANDLERS
  ========================================================== */

  function populateFormSelects() {
    const initSel = document.getElementById('form-initiative');
    if (initSel) {
      const activeInits = INITIATIVES.filter(i =>
        !state.deletedInitiatives.includes(i)
      );
      initSel.innerHTML = `<option value="">— Unassigned —</option>` +
        activeInits.map(i => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join('');
    }
    const laneSel = document.getElementById('form-lane');
    if (laneSel) {
      laneSel.innerHTML = LANES.map(l =>
        `<option value="${escapeHtml(l.id)}">${escapeHtml(l.label)}</option>`).join('');
    }
  }

  function openCaptureModal(prefill = {}) {
    const dialog    = document.getElementById('capture-modal');
    const form      = document.getElementById('capture-form');
    const titleEl   = document.getElementById('modal-title');
    const submitBtn = document.getElementById('form-submit-btn');

    populateFormSelects();
    form.reset();
    resetDepField();

    if (prefill.id) {
      const item = state.items.find(i => i.id === prefill.id);
      if (!item) return;
      state.ui.editingItemId = prefill.id;
      titleEl.textContent    = 'Edit Item';
      submitBtn.textContent  = 'Save Changes';

      document.getElementById('form-id').value             = item.id;
      document.getElementById('form-title').value          = item.title;
      document.getElementById('form-initiative').value     = item.initiative || '';
      document.getElementById('form-lane').value           = item.lane;
      document.getElementById('form-work-mode').value      = item.workMode || '';
      document.getElementById('form-stage').value          = item.stage || 'Unclear';
      document.getElementById('form-week-relevance').value = item.weekRelevance || 'unclear';
      document.getElementById('form-due-date').value       = item.dueDate || '';
      document.getElementById('form-notes').value          = item.notes || '';
      document.getElementById('form-next-step').value      = item.nextStep || '';
      document.getElementById('form-open-loop').checked    = item.openLoop;

      if (item.waitingOnItemId) {
        const linked = state.items.find(i => i.id === item.waitingOnItemId);
        if (linked) {
          setDepLink(linked);
          document.getElementById('form-waiting-on').value = item.waitingOn || linked.title;
        } else {
          document.getElementById('form-waiting-on').value = item.waitingOn || '';
        }
      } else {
        document.getElementById('form-waiting-on').value = item.waitingOn || '';
      }
    } else {
      state.ui.editingItemId = null;
      titleEl.textContent    = 'Capture Item';
      submitBtn.textContent  = 'Save Item';
      if (prefill.lane)       document.getElementById('form-lane').value       = prefill.lane;
      if (prefill.initiative) document.getElementById('form-initiative').value = prefill.initiative;
    }

    dialog.showModal();
    setTimeout(() => document.getElementById('form-title').focus(), 60);
  }

  function closeCaptureModal() {
    document.getElementById('capture-modal').close();
    document.getElementById('dep-dropdown').hidden = true;
    state.ui.editingItemId = null;
  }

  function handleCaptureSubmit(e) {
    e.preventDefault();
    const data  = new FormData(e.target);
    const title = (data.get('title') || '').trim();
    if (!title) { document.getElementById('form-title').focus(); return; }

    const values = {
      title,
      initiative:      data.get('initiative')      || null,
      lane:            data.get('lane')            || 'inbox',
      workMode:        data.get('workMode')        || null,
      stage:           data.get('stage')           || 'Unclear',
      weekRelevance:   data.get('weekRelevance')   || 'unclear',
      dueDate:         data.get('dueDate')         || null,
      notes:           (data.get('notes')          || '').trim(),
      nextStep:        (data.get('nextStep')       || '').trim(),
      waitingOn:       (data.get('waitingOn')      || '').trim(),
      waitingOnItemId: data.get('waitingOnItemId') || null,
      openLoop:        !!data.get('openLoop'),
    };

    if (state.ui.editingItemId) {
      updateItem(state.ui.editingItemId, values);
      showToast('Item updated');
    } else {
      addItem(createItem(values));
      showToast('Item added');
    }
    closeCaptureModal();
  }

  function handleQuickCapture() {
    const input = document.getElementById('quick-capture-input');
    const title = input.value.trim();
    if (!title) return;
    addItem(createItem({ title, lane: 'inbox' }));
    input.value = '';
    showToast('Added to Inbox');
  }

  /* --- Dependency Field --- */

  function resetDepField() {
    const chip   = document.getElementById('dep-linked-chip');
    const hidden = document.getElementById('form-waiting-on-item-id');
    const input  = document.getElementById('form-waiting-on');
    const dd     = document.getElementById('dep-dropdown');
    if (chip)   chip.hidden  = true;
    if (hidden) hidden.value = '';
    if (input)  input.value  = '';
    if (dd)     dd.hidden    = true;
  }

  function setDepLink(item) {
    const chip      = document.getElementById('dep-linked-chip');
    const chipTitle = document.getElementById('dep-linked-title');
    const hidden    = document.getElementById('form-waiting-on-item-id');
    if (!chip || !chipTitle || !hidden) return;
    hidden.value          = item.id;
    chipTitle.textContent = item.title;
    chip.hidden           = false;
  }

  function setupDependencySearch() {
    const input    = document.getElementById('form-waiting-on');
    const dropdown = document.getElementById('dep-dropdown');
    const hiddenId = document.getElementById('form-waiting-on-item-id');
    const chip     = document.getElementById('dep-linked-chip');
    const clearBtn = document.getElementById('dep-clear-btn');

    if (!input) return;

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();

      if (hiddenId.value) {
        const linked = state.items.find(i => i.id === hiddenId.value);
        if (input.value !== (linked ? linked.title : '')) {
          hiddenId.value = '';
          if (chip) chip.hidden = true;
        }
      }

      if (q.length < 2) { dropdown.hidden = true; return; }

      const editingId = state.ui.editingItemId;
      const results   = state.items
        .filter(i => i.id !== editingId && i.stage !== 'Done' && i.title.toLowerCase().includes(q))
        .slice(0, 7);

      if (!results.length) { dropdown.hidden = true; return; }

      dropdown.innerHTML = results.map(item => {
        const laneLabel = LANES.find(l => l.id === item.lane)?.label || item.lane;
        const meta      = [item.initiative, laneLabel].filter(Boolean).join(' · ');
        return `
          <button type="button" class="dep-option" data-id="${escapeHtml(item.id)}">
            <span class="dep-option-title">${escapeHtml(item.title)}</span>
            ${meta ? `<span class="dep-option-meta">${escapeHtml(meta)}</span>` : ''}
          </button>`;
      }).join('');
      dropdown.hidden = false;
    });

    dropdown.addEventListener('click', e => {
      const btn = e.target.closest('.dep-option');
      if (!btn) return;
      const item = state.items.find(i => i.id === btn.dataset.id);
      if (!item) return;
      setDepLink(item);
      input.value     = item.title;
      dropdown.hidden = true;
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        hiddenId.value  = '';
        input.value     = '';
        if (chip) chip.hidden = true;
        dropdown.hidden = true;
        input.focus();
      });
    }

    document.addEventListener('click', e => {
      if (!e.target.closest('.dependency-field')) dropdown.hidden = true;
    });
  }

  /* ==========================================================
     10. MOVE POPOVER
  ========================================================== */

  let _popoverId    = null;
  let _popoverClose = null;

  function openMovePopover(itemId, triggerEl) {
    _popoverId = itemId;
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;

    const popover = document.getElementById('move-popover');
    const opts    = document.getElementById('move-popover-options');

    opts.innerHTML = LANES.map(lane =>
      `<button class="move-option ${item.lane === lane.id ? 'current-lane' : ''}"
               data-lane="${escapeHtml(lane.id)}">${escapeHtml(lane.label)}</button>`).join('');

    const rect = triggerEl.getBoundingClientRect();
    popover.style.top  = rect.bottom + 6 + 'px';
    popover.style.left = rect.left + 'px';
    popover.hidden = false;

    if (_popoverClose) document.removeEventListener('click', _popoverClose);
    _popoverClose = e => { if (!popover.contains(e.target)) closeMovePopover(); };
    setTimeout(() => document.addEventListener('click', _popoverClose), 0);
  }

  function closeMovePopover() {
    document.getElementById('move-popover').hidden = true;
    _popoverId = null;
    if (_popoverClose) { document.removeEventListener('click', _popoverClose); _popoverClose = null; }
  }

  /* ==========================================================
     11. INITIATIVE ACTION POPOVER
  ========================================================== */

  let _initPopover = { initiative: null, category: null, closeHandler: null };

  function openInitiativeActionPopover(initName, category, triggerEl) {
    closeInitiativeActionPopover();

    _initPopover.initiative = initName;
    _initPopover.category   = category;

    const popover   = document.getElementById('initiative-action-popover');
    const nameEl    = document.getElementById('init-action-name');
    const optionsEl = document.getElementById('init-action-options');

    nameEl.textContent = initName;

    const options = [];
    options.push({ action: 'view', label: 'View all tasks', cls: 'init-action--view' });
    if (category === 'active') {
      options.push({ action: 'table',    label: 'Table',    cls: '' });
      options.push({ action: 'complete', label: 'Complete', cls: 'init-action--complete' });
      options.push({ action: 'delete',   label: 'Delete',   cls: 'init-action--delete' });
    } else if (category === 'tabled') {
      options.push({ action: 'activate', label: 'Activate', cls: 'init-action--activate' });
      options.push({ action: 'complete', label: 'Complete', cls: 'init-action--complete' });
      options.push({ action: 'delete',   label: 'Delete',   cls: 'init-action--delete' });
    } else if (category === 'completed') {
      options.push({ action: 'reopen',   label: 'Reopen',   cls: 'init-action--activate' });
      options.push({ action: 'delete',   label: 'Delete',   cls: 'init-action--delete' });
    }

    optionsEl.innerHTML = options.map(o =>
      `<button class="init-action-btn ${o.cls}" data-action="${o.action}">${o.label}</button>`
    ).join('');

    // Position: below the trigger, right-aligned
    const rect    = triggerEl.getBoundingClientRect();
    const popW    = 180;
    const rawLeft = rect.right - popW;
    const left    = Math.max(8, Math.min(rawLeft, window.innerWidth - popW - 8));
    popover.style.top  = (rect.bottom + 4) + 'px';
    popover.style.left = left + 'px';
    popover.hidden = false;

    _initPopover.closeHandler = e => {
      if (!popover.contains(e.target) && e.target !== triggerEl) {
        closeInitiativeActionPopover();
      }
    };
    setTimeout(() => document.addEventListener('click', _initPopover.closeHandler), 0);
  }

  function closeInitiativeActionPopover() {
    const popover = document.getElementById('initiative-action-popover');
    if (popover) popover.hidden = true;
    if (_initPopover.closeHandler) {
      document.removeEventListener('click', _initPopover.closeHandler);
      _initPopover.closeHandler = null;
    }
    _initPopover.initiative = null;
    _initPopover.category   = null;
  }

  function handleInitiativeAction(action) {
    const name = _initPopover.initiative;
    closeInitiativeActionPopover();
    if (!name) return;

    if (action === 'view') {
      openInitiativeDetail(name);
      return;
    }

    if (action === 'table') {
      if (confirm(`Table "${name}"?\n\nIts open items will be preserved in the Tabled section until reactivated.`)) {
        tableInitiative(name);
      }
    } else if (action === 'activate') {
      activateInitiative(name);
    } else if (action === 'complete') {
      if (confirm(`Mark "${name}" as Complete?\n\nIts items will move to the Completed Initiatives section.`)) {
        completeInitiative(name);
      }
    } else if (action === 'reopen') {
      reopenInitiative(name);
    } else if (action === 'delete') {
      if (confirm(`Delete "${name}"?\n\nAll its items will remain in their current lanes but become unassigned. This cannot be undone.`)) {
        deleteInitiative(name);
      }
    }
  }

  /* ==========================================================
     12. INITIATIVE DETAIL MODAL
  ========================================================== */

  function openInitiativeDetail(name) {
    const dialog = document.getElementById('initiative-detail-modal');
    document.getElementById('init-detail-name').textContent = name;
    renderInitiativeDetailBody(name);
    dialog.showModal();
  }

  function renderInitiativeDetailBody(name) {
    const body      = document.getElementById('init-detail-body');
    const summaryEl = document.getElementById('init-detail-summary');
    if (!body || !summaryEl) return;

    const allItems = state.items.filter(i => i.initiative === name);
    const active   = allItems.filter(i => i.stage !== 'Done');
    const done     = allItems.filter(i => i.stage === 'Done')
      .sort((a, b) => (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt));

    const waitingCount = active.filter(i => i.stage === 'Waiting' || i.stage === 'Blocked').length;
    const openLoopCount = active.filter(i => i.openLoop).length;
    const parts = [`${active.length} active`, `${done.length} done`];
    if (waitingCount)  parts.push(`${waitingCount} waiting/blocked`);
    if (openLoopCount) parts.push(`${openLoopCount} open loop${openLoopCount > 1 ? 's' : ''}`);
    summaryEl.textContent = parts.join(' · ');

    if (!allItems.length) {
      body.innerHTML = '<p class="init-detail-empty">No items for this initiative yet.</p>';
      return;
    }

    let html = '';

    // Active items grouped by lane
    LANES.forEach(lane => {
      const laneItems = active.filter(i => i.lane === lane.id);
      if (!laneItems.length) return;
      html += `
        <div class="init-detail-group">
          <div class="init-detail-group-label">
            ${escapeHtml(lane.label)}
            <span class="card-group-count">${laneItems.length}</span>
          </div>
          <div class="card-list">${laneItems.map(i => renderCard(i)).join('')}</div>
        </div>`;
    });

    // Done items
    if (done.length) {
      html += `
        <div class="init-detail-group init-detail-group--done">
          <div class="init-detail-group-label init-detail-group-label--done">
            Done
            <span class="card-group-count">${done.length}</span>
          </div>
          <div class="card-list">${done.map(i => renderCard(i, { showCompletedDate: true })).join('')}</div>
        </div>`;
    }

    body.innerHTML = html;
  }

  function closeInitiativeDetail() {
    document.getElementById('initiative-detail-modal').close();
  }

  /* ==========================================================
     13. CSV IMPORT (internal — not exposed in UI)
  ========================================================== */

  function parseCSV(text) {
    const lines = [];
    let row = [], field = '', inQ = false, i = 0;

    while (i < text.length) {
      const ch = text[i], nx = text[i + 1];
      if (inQ) {
        if (ch === '"' && nx === '"') { field += '"'; i += 2; continue; }
        if (ch === '"') { inQ = false; i++; continue; }
        field += ch;
      } else {
        if (ch === '"')         { inQ = true; i++; continue; }
        if (ch === ',')         { row.push(field); field = ''; i++; continue; }
        if (ch === '\r' && nx === '\n') { row.push(field); lines.push(row); row = []; field = ''; i += 2; continue; }
        if (ch === '\n' || ch === '\r') { row.push(field); lines.push(row); row = []; field = ''; i++; continue; }
        field += ch;
      }
      i++;
    }
    if (field || row.length) { row.push(field); lines.push(row); }

    if (lines.length < 2) return [];
    const headers = lines[0].map(h => h.trim());
    return lines.slice(1)
      .filter(r => r.some(c => c.trim()))
      .map(r => {
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = (r[idx] || '').trim(); });
        return obj;
      });
  }

  function parseClickUpDate(s) {
    if (!s) return null;
    const MONTHS = { january:1, february:2, march:3, april:4, may:5, june:6,
                     july:7, august:8, september:9, october:10, november:11, december:12 };
    // "Friday, May 15th 2026" or "May 15th 2026"
    const longFmt = s.match(/(?:\w+,\s+)?(\w+)\s+(\d{1,2})(?:st|nd|rd|th)\s+(\d{4})/i);
    if (longFmt) {
      const mo = MONTHS[longFmt[1].toLowerCase()];
      if (mo) return `${longFmt[3]}-${String(mo).padStart(2,'0')}-${String(longFmt[2]).padStart(2,'0')}`;
    }
    // MM/DD/YYYY
    const mmdd = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mmdd) return `${mmdd[3]}-${mmdd[1].padStart(2,'0')}-${mmdd[2].padStart(2,'0')}`;
    // ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
  }

  function matchInitiative(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    return INITIATIVES.find(init =>
      init.toLowerCase().split(' ').filter(w => w.length > 3).some(w => lower.includes(w))
    ) || null;
  }

  function resolveClickUpStatus(rawStatus) {
    const key = (rawStatus || '').toLowerCase().trim();
    return CLICKUP_STATUS_MAP[key] || CLICKUP_STATUS_DEFAULT;
  }

  function mapClickUpRow(row) {
    const title = (row['Task Name'] || row['Name'] || row['title'] || '').trim();
    if (!title) return null;

    const rawStatus  = row['Status'] || '';
    const mapping    = resolveClickUpStatus(rawStatus);
    const space      = (row['Space']  || '').trim() || null;
    const folder     = (row['Folder'] || '').trim() || null;
    const list       = (row['List']   || row['List Name'] || '').trim() || null;
    const initiative = matchInitiative(list) || matchInitiative(folder) || matchInitiative(title);

    const noteParts = [];
    const assignee  = row['Assignee'] || row['Assignees'] || '';
    if (assignee && assignee !== '[]') noteParts.push('Assigned: ' + assignee);
    if (list && list !== folder)       noteParts.push('List: ' + list);
    const desc = row['Task Content'] || row['Description'] || row['Notes'] || '';
    if (desc.trim()) noteParts.push(desc.trim());

    return createItem({
      title,
      source:        'clickup',
      clickupStatus: rawStatus || null,
      clickupSpace:  space,
      clickupFolder: folder,
      clickupList:   list,
      displayGroup:  mapping.displayGroup,
      lane:          mapping.lane,
      weekRelevance: mapping.weekRelevance,
      stage:         mapping.itemStage,
      initiative,
      dueDate:       parseClickUpDate(row['Due Date'] || row['due_date'] || row['Due date'] || ''),
      notes:         noteParts.join('\n'),
    });
  }

  function handleCSVImport(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const rows  = parseCSV(e.target.result);
        const items = rows.map(mapClickUpRow).filter(Boolean);
        if (!items.length) { showToast('No importable items found in CSV'); return; }

        items.forEach(item => state.items.push(item));
        saveState();
        render();

        const inProgress = items.filter(i => i.displayGroup === 'Imported — In Progress').length;
        const toDo       = items.filter(i => i.displayGroup === 'Imported — To Do').length;
        const parts      = [];
        if (inProgress) parts.push(inProgress + ' in progress → This Week');
        if (toDo)       parts.push(toDo + ' to do → Needs Placement');

        showToast('Imported ' + items.length + ' items' + (parts.length ? ': ' + parts.join(', ') : ''), 4000);
        setTimeout(() => {
          const target = inProgress
            ? document.getElementById('this-week')
            : document.getElementById('needs-placement');
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      } catch (err) {
        showToast('Error parsing CSV — check file format');
        console.error('CSV import error:', err);
      }
    };
    reader.readAsText(file);
  }

  /* ==========================================================
     13. WEEKLY REPORT GENERATOR
  ========================================================== */

  function generateAttentionSummary(active, waiting, openLoops, overdue) {
    const lines = [];

    if (overdue.length) {
      const titles = overdue.slice(0, 2).map(i => '"' + i.title + '"').join(' and ');
      lines.push(`You have ${overdue.length} overdue item${overdue.length > 1 ? 's' : ''} requiring immediate attention: ${titles}.`);
    }

    if (waiting.length) {
      const withDeps = waiting.filter(i => i.waitingOn || i.waitingOnItemId);
      if (withDeps.length) {
        const names = [...new Set(withDeps.map(i => {
          if (i.waitingOnItemId) {
            const linked = state.items.find(x => x.id === i.waitingOnItemId);
            return linked ? linked.title : i.waitingOn;
          }
          return i.waitingOn;
        }))].filter(Boolean).slice(0, 2).join(' and ');
        lines.push(`${withDeps.length} item${withDeps.length > 1 ? 's are' : ' is'} blocked — follow up with ${names} if you haven't already.`);
      }
    }

    const oldLoops = openLoops.filter(i => i.createdAt < Date.now() - 7 * 86400000);
    if (oldLoops.length) {
      lines.push(`${oldLoops.length} open loop${oldLoops.length > 1 ? 's have' : ' has'} been unresolved for over a week — decide this week whether to act, delegate, or explicitly park ${oldLoops.length > 1 ? 'them' : 'it'}.`);
    }

    const weekItems = active.filter(i => i.lane === 'this-week' || i.lane === 'today');
    if (!lines.length && weekItems.length) {
      lines.push(`You have ${weekItems.length} active items in Today and This Week — a focused week ahead.`);
    }
    if (!lines.length) {
      lines.push('The board looks relatively clear. Use this week to make progress on strategic radar items or clear open loops.');
    }

    return lines.join('\n');
  }

  function generateWeeklyReport() {
    const now       = new Date();
    const weekStart = getWeekStart(now).getTime();
    const LINE      = '─'.repeat(52);

    // Exclude tabled and completed initiative items
    const isReviewable = i =>
      !i.initiative ||
      (!state.tabledInitiatives.includes(i.initiative) &&
       !state.completedInitiatives.includes(i.initiative));

    const all           = state.items.filter(isReviewable);
    const completedWeek = all.filter(i => i.stage === 'Done' && (i.completedAt || i.updatedAt) >= weekStart);
    const active        = all.filter(i => isActiveVisible(i));
    const waiting       = all.filter(i => (i.stage === 'Waiting' || i.stage === 'Blocked') && i.stage !== 'Done');
    const openLoops     = all.filter(i => i.openLoop && i.stage !== 'Done');
    const overdue       = active.filter(i => i.dueDate && new Date(i.dueDate + 'T00:00:00') < now);
    const byInit        = groupBy(active, 'initiative');

    let r = `STRATEGIC TRIAGE BOARD — WEEKLY REVIEW\n${formatDate(now)}\n${LINE}\n\n`;

    r += `COMPLETED THIS WEEK (${completedWeek.length})\n`;
    if (completedWeek.length) completedWeek.forEach(i => { r += `  ✓  ${i.title}\n`; });
    else r += `  None marked done yet this week.\n`;
    r += '\n';

    r += `ACTIVE BY INITIATIVE\n`;
    let hasAny = false;
    INITIATIVES
      .filter(i => !state.tabledInitiatives.includes(i) && !state.completedInitiatives.includes(i))
      .forEach(init => {
        const items = byInit[init];
        if (!items?.length) return;
        hasAny = true;
        r += `\n  ${init.toUpperCase()}\n`;
        items.forEach(i => {
          const laneName = LANES.find(l => l.id === i.lane)?.label || i.lane;
          r += `  ·  ${i.title}  [${laneName}${i.stage && i.stage !== 'Unclear' ? ' · ' + i.stage : ''}]\n`;
          if (i.nextStep) r += `     → ${i.nextStep}\n`;
        });
      });
    if (!hasAny) r += `  No active items.\n`;
    r += '\n';

    if (waiting.length) {
      r += `WAITING / BLOCKED (${waiting.length})\n`;
      waiting.forEach(i => {
        r += `  ⊘  ${i.title}`;
        if (i.waitingOnItemId) {
          const linked = state.items.find(x => x.id === i.waitingOnItemId);
          if (linked) r += `  ← ${linked.title}`;
        } else if (i.waitingOn) {
          r += `  ← ${i.waitingOn}`;
        }
        r += '\n';
      });
      r += '\n';
    }

    if (openLoops.length) {
      r += `OPEN LOOPS (${openLoops.length})\n`;
      openLoops.forEach(i => {
        const age = Math.round((Date.now() - i.createdAt) / 86400000);
        r += `  ◌  ${i.title}  (${age}d)\n`;
      });
      r += '\n';
    }

    if (overdue.length) {
      r += `OVERDUE (${overdue.length})\n`;
      overdue.forEach(i => { r += `  !  ${i.title}  [due: ${i.dueDate}]\n`; });
      r += '\n';
    }

    if (state.tabledInitiatives.length) {
      r += `TABLED (${state.tabledInitiatives.length})\n`;
      state.tabledInitiatives.forEach(init => { r += `  ⊟  ${init}\n`; });
      r += '\n';
    }

    if (state.completedInitiatives.length) {
      r += `COMPLETED INITIATIVES (${state.completedInitiatives.length})\n`;
      state.completedInitiatives.forEach(init => { r += `  ✓  ${init}\n`; });
      r += '\n';
    }

    r += `${LINE}\nWHAT NEEDS ATTENTION THIS WEEK\n\n`;
    r += generateAttentionSummary(active, waiting, openLoops, overdue);
    r += '\n';

    return r;
  }

  /* ==========================================================
     14. SCROLL SPY
  ========================================================== */

  function setupScrollSpy() {
    const sections = document.querySelectorAll('.lane[id]');
    const navItems = document.querySelectorAll('.nav-item');
    if (!('IntersectionObserver' in window)) return;

    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navItems.forEach(n => n.classList.remove('active'));
        const match = document.querySelector(`.nav-item[data-section="${entry.target.id}"]`);
        if (match) match.classList.add('active');
      });
    }, { threshold: 0.25, rootMargin: '-15% 0px -75% 0px' });

    sections.forEach(s => obs.observe(s));
  }

  /* ==========================================================
     15. EVENT DELEGATION
  ========================================================== */

  function setupEvents() {

    /* --- Main content --- */
    document.getElementById('main-content').addEventListener('click', e => {
      // Reopen completed initiative (button in completed-initiatives section)
      const reopenBtn = e.target.closest('[data-action="reopen-completed"]');
      if (reopenBtn && reopenBtn.dataset.initiative) {
        e.stopPropagation();
        reopenInitiative(reopenBtn.dataset.initiative);
        return;
      }

      // Activate button (tabled section)
      const activateBtn = e.target.closest('[data-action="activate"]');
      if (activateBtn && activateBtn.dataset.initiative) {
        e.stopPropagation();
        activateInitiative(activateBtn.dataset.initiative);
        return;
      }

      // Card action buttons
      const moveBtn = e.target.closest('[data-action="move"]');
      if (moveBtn) { e.stopPropagation(); openMovePopover(moveBtn.dataset.id, moveBtn); return; }

      const editBtn = e.target.closest('[data-action="edit"]');
      if (editBtn) { e.stopPropagation(); openCaptureModal({ id: editBtn.dataset.id }); return; }

      const doneBtn = e.target.closest('[data-action="done"]');
      if (doneBtn) { e.stopPropagation(); markDone(doneBtn.dataset.id); return; }

      // Dependency link in card detail
      const depLink = e.target.closest('.dep-item-link');
      if (depLink && depLink.dataset.id) {
        e.stopPropagation();
        openCaptureModal({ id: depLink.dataset.id });
        return;
      }

      // Card expand/collapse
      const cardMain = e.target.closest('.card-main');
      if (cardMain) {
        const card = cardMain.closest('.card');
        if (!card) return;
        state.activeItemId = state.activeItemId === card.dataset.id ? null : card.dataset.id;
        render();
        return;
      }

      // Add to lane button
      const addBtn = e.target.closest('.add-to-lane-btn');
      if (addBtn) { openCaptureModal({ lane: addBtn.dataset.lane }); return; }
    });

    /* --- Sidebar: initiative list and sub-panels --- */
    const sidebarPanel = document.querySelector('.initiative-panel');
    if (sidebarPanel) {
      sidebarPanel.addEventListener('click', e => {
        // ··· initiative action button
        const actionBtn = e.target.closest('.btn-init-action');
        if (actionBtn) {
          e.stopPropagation();
          openInitiativeActionPopover(
            actionBtn.dataset.initiative,
            actionBtn.dataset.category,
            actionBtn
          );
          return;
        }

        // Initiative chip — open detail view
        const chip = e.target.closest('.initiative-chip');
        if (chip && chip.dataset.initiative) {
          openInitiativeDetail(chip.dataset.initiative);
          return;
        }
      });
    }

    /* --- Initiative action popover buttons --- */
    document.getElementById('initiative-action-popover').addEventListener('click', e => {
      const btn = e.target.closest('.init-action-btn');
      if (btn) handleInitiativeAction(btn.dataset.action);
    });

    /* --- Clear filter --- */
    document.getElementById('clear-filter-btn').addEventListener('click', () => {
      state.filter.initiative = null;
      render();
    });

    /* --- Move popover --- */
    document.getElementById('move-popover-options').addEventListener('click', e => {
      const opt = e.target.closest('.move-option');
      if (!opt || !_popoverId) return;
      const laneLabel = LANES.find(l => l.id === opt.dataset.lane)?.label || opt.dataset.lane;
      moveItem(_popoverId, opt.dataset.lane);
      closeMovePopover();
      showToast('Moved to ' + laneLabel);
    });

    /* --- Quick capture --- */
    document.getElementById('quick-capture-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleQuickCapture();
    });
    document.getElementById('quick-capture-submit').addEventListener('click', handleQuickCapture);

    /* --- Capture modal --- */
    document.getElementById('capture-form').addEventListener('submit', handleCaptureSubmit);
    document.getElementById('modal-close-btn').addEventListener('click', closeCaptureModal);
    document.getElementById('modal-cancel-btn').addEventListener('click', closeCaptureModal);

    /* --- Initiative detail modal --- */
    document.getElementById('init-detail-close-btn').addEventListener('click', closeInitiativeDetail);
    document.getElementById('initiative-detail-modal').addEventListener('click', e => {
      const d    = e.currentTarget;
      const rect = d.getBoundingClientRect();
      const outside = e.clientX < rect.left || e.clientX > rect.right ||
                      e.clientY < rect.top  || e.clientY > rect.bottom;
      if (outside) closeInitiativeDetail();
    });

    document.getElementById('capture-modal').addEventListener('click', e => {
      const d    = e.currentTarget;
      const rect = d.getBoundingClientRect();
      const outside = e.clientX < rect.left || e.clientX > rect.right ||
                      e.clientY < rect.top  || e.clientY > rect.bottom;
      if (outside) closeCaptureModal();
    });

    /* --- Completed items period filter chips --- */
    const periodChips = document.getElementById('completed-period-chips');
    if (periodChips) {
      periodChips.addEventListener('click', e => {
        const chip = e.target.closest('.filter-chip[data-period]');
        if (!chip) return;
        state.completedFilter.period = chip.dataset.period;
        periodChips.querySelectorAll('.filter-chip').forEach(c =>
          c.classList.toggle('active', c.dataset.period === chip.dataset.period)
        );
        renderCompletedItems();
      });
    }

    /* --- Completed items initiative filter --- */
    const completedInitSel = document.getElementById('completed-initiative-filter');
    if (completedInitSel) {
      completedInitSel.addEventListener('change', () => {
        state.completedFilter.initiative = completedInitSel.value || null;
        renderCompletedItems();
      });
    }

    /* --- JSON export / import --- */
    document.getElementById('export-json-btn').addEventListener('click', exportJSON);
    document.getElementById('import-json-btn').addEventListener('click', () => {
      document.getElementById('json-file-input').click();
    });
    document.getElementById('json-file-input').addEventListener('change', e => {
      if (e.target.files[0]) { handleJSONImport(e.target.files[0]); e.target.value = ''; }
    });

    /* --- Weekly review --- */
    document.getElementById('generate-report-btn').addEventListener('click', () => {
      const report = generateWeeklyReport();
      document.getElementById('report-text').textContent = report;
      const out = document.getElementById('review-report-output');
      out.hidden = false;
      document.getElementById('copy-report-btn').hidden = false;
      out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    document.getElementById('copy-report-btn').addEventListener('click', () => {
      navigator.clipboard
        .writeText(document.getElementById('report-text').textContent)
        .then(() => showToast('Report copied to clipboard'))
        .catch(() => showToast('Copy failed — select and copy manually'));
    });

    /* --- Clear all data --- */
    document.getElementById('reset-data-btn').addEventListener('click', () => {
      if (!confirm('Clear all data? This cannot be undone.')) return;
      localStorage.removeItem(STORAGE_KEY);
      state.items                = [];
      state.tabledInitiatives    = DEFAULT_TABLED.slice();
      state.completedInitiatives = [];
      state.deletedInitiatives   = [];
      state.filter.initiative    = null;
      state.completedFilter      = { initiative: null, period: 'all' };
      state.activeItemId         = null;
      saveState();
      render();
      showToast('Board cleared');
    });

    /* --- Global keyboard shortcuts --- */
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault(); openCaptureModal(); return;
      }
      if (e.key === 'Escape') {
        const detail = document.getElementById('initiative-detail-modal');
        if (detail.open) { closeInitiativeDetail(); return; }
        const d = document.getElementById('capture-modal');
        if (d.open) { closeCaptureModal(); return; }
        if (!document.getElementById('move-popover').hidden) { closeMovePopover(); return; }
        const ip = document.getElementById('initiative-action-popover');
        if (!ip.hidden) { closeInitiativeActionPopover(); return; }
      }
      if (e.key === 'n' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
        openCaptureModal();
      }
    });
  }

  /* ==========================================================
     16. PASSWORD GATE
  ========================================================== */

  async function sha256(str) {
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function setupPasswordGate(onSuccess) {
    const gate  = document.getElementById('password-gate');
    const form  = document.getElementById('password-form');
    const input = document.getElementById('password-input');
    const err   = document.getElementById('password-error');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const hash = await sha256(input.value);
      if (hash === AUTH_HASH) {
        sessionStorage.setItem(AUTH_SESSION_KEY, '1');
        input.classList.remove('input-error');
        err.hidden = true;
        gate.classList.add('unlocking');
        setTimeout(() => {
          gate.hidden = true;
          document.body.classList.remove('app-locked');
          onSuccess();
        }, 260);
      } else {
        input.value = '';
        input.classList.add('input-error');
        err.hidden = false;
        setTimeout(() => input.classList.remove('input-error'), 500);
        input.focus();
      }
    });
  }

  /* ==========================================================
     17. INIT
  ========================================================== */

  async function init() {
    initSupabase();
    await loadState();
    populateFormSelects();
    render();
    setupScrollSpy();
    setupDependencySearch();
    setupEvents();
    setupRealtimeSync();

    setTimeout(() => {
      document.getElementById('today')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Already authenticated this session?
    if (sessionStorage.getItem(AUTH_SESSION_KEY) === '1') {
      document.getElementById('password-gate').hidden = true;
      document.body.classList.remove('app-locked');
      init();
      return;
    }
    // Show password gate; run init on success
    setupPasswordGate(init);
  });

})();
