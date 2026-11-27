/**
 * Studio Web HTTP & SSE client strictly validated by shared Zod v4 contracts from @llman-sdd/core
 * (studio-web r144, r145). Carries X-Studio-Token, X-Studio-Client-Id (self-echo suppression),
 * and If-Match optimistic revision lock.
 */
import {
  bootstrapResponseSchema,
  exportProposalResponseSchema,
  previewDiffResponseSchema,
  putStateResponseSchema,
  specDetailResponseSchema,
  studioSseEventSchema,
  textfoldResponseSchema,
  viewsResponseSchema,
  workspacesResponseSchema,
  type BootstrapResponse,
  type EdgeBendOffset,
  type ExportProposalRequest,
  type ExportProposalResponse,
  type NodePosition,
  type PreviewDiffResponse,
  type PutStateResponse,
  type SpecDetailResponse,
  type StudioSseEvent,
  type StudioStateDoc,
  type StudioViewsDoc,
  type TextfoldResponse,
  type ViewsResponse,
  type WorkspacesResponse,
} from '@llman-sdd/core/studio';

export class StudioConflictError extends Error {
  readonly currentRevision: number;
  readonly latestDoc: StudioStateDoc;

  constructor(message: string, currentRevision: number, latestDoc: StudioStateDoc) {
    super(message);
    this.name = 'StudioConflictError';
    this.currentRevision = currentRevision;
    this.latestDoc = latestDoc;
  }
}

export const STUDIO_CLIENT_ID = `studio-tab-${Math.random().toString(36).slice(2, 10)}`;

export class StudioApiClient {
  private token = '';

  setToken(token: string): void {
    this.token = token;
  }

  getToken(): string {
    return this.token;
  }

  private writeHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-studio-token': this.token,
      'x-studio-client-id': STUDIO_CLIENT_ID,
    };
  }

  async fetchWorkspaces(): Promise<WorkspacesResponse> {
    const res = await fetch('/api/workspaces');
    if (!res.ok) throw new Error(`GET /api/workspaces failed (${String(res.status)})`);
    return workspacesResponseSchema.parse(await res.json());
  }

  async fetchBootstrap(wsKey?: string): Promise<BootstrapResponse> {
    const url = wsKey ? `/api/p/${encodeURIComponent(wsKey)}/bootstrap` : '/api/bootstrap';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} failed (${String(res.status)})`);
    const parsed = bootstrapResponseSchema.parse(await res.json());
    this.token = parsed.token;
    return parsed;
  }

  async fetchSpecDetail(capId: string, wsKey?: string): Promise<SpecDetailResponse> {
    const url = wsKey
      ? `/api/p/${encodeURIComponent(wsKey)}/specs/${encodeURIComponent(capId)}`
      : `/api/specs/${encodeURIComponent(capId)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} failed (${String(res.status)})`);
    return specDetailResponseSchema.parse(await res.json());
  }

  async putState(
    doc: StudioStateDoc,
    expectedRevision: number | undefined,
    wsKey?: string,
    opts?: { keepalive?: boolean },
  ): Promise<PutStateResponse> {
    const url = wsKey
      ? `/api/p/${encodeURIComponent(wsKey)}/states/${encodeURIComponent(doc.id)}`
      : `/api/states/${encodeURIComponent(doc.id)}`;
    const headers: Record<string, string> = this.writeHeaders();
    if (expectedRevision !== undefined) {
      headers['if-match'] = String(expectedRevision);
    }
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ doc, expectedRevision }),
      keepalive: opts?.keepalive === true,
    });
    if (res.status === 409) {
      const body = (await res.json()) as {
        error?: string;
        currentRevision: number;
        latestDoc: StudioStateDoc;
      };
      throw new StudioConflictError(
        body.error ?? 'revision conflict',
        body.currentRevision,
        body.latestDoc,
      );
    }
    if (!res.ok) throw new Error(`PUT ${url} failed (${String(res.status)})`);
    return putStateResponseSchema.parse(await res.json());
  }

  async putLayout(
    machineKey: string,
    positions: Record<string, NodePosition>,
    edgeBends?: Record<string, EdgeBendOffset>,
    wsKey?: string,
    opts?: { keepalive?: boolean },
  ): Promise<void> {
    const qs = wsKey ? `?wsKey=${encodeURIComponent(wsKey)}` : '';
    const res = await fetch(`/api/layouts/${encodeURIComponent(machineKey)}${qs}`, {
      method: 'PUT',
      headers: this.writeHeaders(),
      body: JSON.stringify({ positions, ...(edgeBends ? { edgeBends } : {}) }),
      keepalive: opts?.keepalive === true,
    });
    if (!res.ok) throw new Error(`PUT /api/layouts failed (${String(res.status)})`);
  }

  async decideRevision(
    stateId: string,
    revId: string,
    action: 'accept' | 'reject',
    wsKey?: string,
  ): Promise<StudioStateDoc> {
    const qs = wsKey ? `?wsKey=${encodeURIComponent(wsKey)}` : '';
    const res = await fetch(
      `/api/states/${encodeURIComponent(stateId)}/revisions/${encodeURIComponent(revId)}/${action}${qs}`,
      { method: 'POST', headers: this.writeHeaders() },
    );
    if (!res.ok) throw new Error(`POST revision ${action} failed (${String(res.status)})`);
    const body = (await res.json()) as { doc: StudioStateDoc };
    return body.doc;
  }

  async previewDiff(stateId: string, wsKey?: string): Promise<PreviewDiffResponse> {
    const qs = wsKey ? `?wsKey=${encodeURIComponent(wsKey)}` : '';
    const res = await fetch(`/api/states/${encodeURIComponent(stateId)}/preview-diff${qs}`, {
      method: 'POST',
      headers: this.writeHeaders(),
    });
    if (!res.ok) throw new Error(`POST preview-diff failed (${String(res.status)})`);
    return previewDiffResponseSchema.parse(await res.json());
  }

  async exportProposal(
    stateId: string,
    input: ExportProposalRequest,
    wsKey?: string,
  ): Promise<ExportProposalResponse> {
    const qs = wsKey ? `?wsKey=${encodeURIComponent(wsKey)}` : '';
    const res = await fetch(`/api/states/${encodeURIComponent(stateId)}/export-proposal${qs}`, {
      method: 'POST',
      headers: this.writeHeaders(),
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`POST export-proposal failed (${String(res.status)})`);
    return exportProposalResponseSchema.parse(await res.json());
  }

  async foldText(
    content: string,
    capability?: string,
    endpoint?: string,
    wsKey?: string,
  ): Promise<TextfoldResponse> {
    const qs = wsKey ? `?wsKey=${encodeURIComponent(wsKey)}` : '';
    const res = await fetch(`/api/textfold/fold${qs}`, {
      method: 'POST',
      headers: this.writeHeaders(),
      body: JSON.stringify({
        content,
        ...(capability ? { capability } : {}),
        ...(endpoint ? { endpoint } : {}),
      }),
    });
    if (!res.ok) throw new Error(`POST /api/textfold/fold failed (${String(res.status)})`);
    return textfoldResponseSchema.parse(await res.json());
  }

  async fetchViews(wsKey?: string): Promise<ViewsResponse> {
    const url = wsKey ? `/api/p/${encodeURIComponent(wsKey)}/views` : '/api/views';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} failed (${String(res.status)})`);
    return viewsResponseSchema.parse(await res.json());
  }

  async putViews(
    viewsDoc: StudioViewsDoc,
    wsKey?: string,
    opts?: { keepalive?: boolean },
  ): Promise<ViewsResponse> {
    const url = wsKey ? `/api/p/${encodeURIComponent(wsKey)}/views` : '/api/views';
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.writeHeaders(),
      body: JSON.stringify({ viewsDoc }),
      keepalive: opts?.keepalive === true,
    });
    if (!res.ok) throw new Error(`PUT ${url} failed (${String(res.status)})`);
    return viewsResponseSchema.parse(await res.json());
  }

  subscribeEvents(onEvent: (event: StudioSseEvent) => void): () => void {
    const es = new EventSource('/api/events');
    const handle = (ev: MessageEvent<string>): void => {
      try {
        const parsed = studioSseEventSchema.safeParse(JSON.parse(ev.data));
        if (!parsed.success) return;
        // Self-echo suppression: ignore our own state/views write echo
        if (
          (parsed.data.type === 'state-updated' || parsed.data.type === 'views-updated') &&
          parsed.data.originClientId === STUDIO_CLIENT_ID
        ) {
          return;
        }
        onEvent(parsed.data);
      } catch {
        // Ignore malformed SSE payload
      }
    };
    es.addEventListener('state-updated', handle as EventListener);
    es.addEventListener('views-updated', handle as EventListener);
    es.addEventListener('specs-changed', handle as EventListener);
    es.addEventListener('git-head-changed', handle as EventListener);
    return () => es.close();
  }
}

export const studioApi = new StudioApiClient();
