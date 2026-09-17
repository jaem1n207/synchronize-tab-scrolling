const DEFAULT_PROPOSAL_LIFETIME_MS = 30_000;

export type SuggestionProposalKind = 'sync' | 'add-tab';

interface ProposalClaims {
  kind: SuggestionProposalKind;
  normalizedUrl: string;
  expectedRevision: number;
  suggestedTabId?: number;
}

interface IssueProposalInput extends ProposalClaims {
  responderTabIds: ReadonlyArray<number>;
}

interface ConsumeProposalInput extends ProposalClaims {
  token: unknown;
  senderContext: unknown;
  senderTabId: unknown;
}

interface ProposalRecord extends ProposalClaims {
  expiresAt: number;
  proposalKey: string;
  responderTabId: number;
  token: string;
}

export interface SuggestionProposalRegistry {
  clear(): void;
  consume(input: ConsumeProposalInput): boolean;
  issue(input: IssueProposalInput): Map<number, string>;
  revoke(token: string): void;
}

interface ProposalRegistryDependencies {
  createToken: () => string;
  lifetimeMs?: number;
  now: () => number;
}

function getProposalKey(claims: ProposalClaims): string {
  return JSON.stringify([
    claims.kind,
    claims.normalizedUrl,
    claims.expectedRevision,
    claims.suggestedTabId ?? null,
  ]);
}

function claimsMatch(record: ProposalRecord, input: ConsumeProposalInput): boolean {
  return (
    record.kind === input.kind &&
    record.normalizedUrl === input.normalizedUrl &&
    record.expectedRevision === input.expectedRevision &&
    record.suggestedTabId === input.suggestedTabId
  );
}

export function createProposalRegistry(
  dependencies: ProposalRegistryDependencies,
): SuggestionProposalRegistry {
  const lifetimeMs = dependencies.lifetimeMs ?? DEFAULT_PROPOSAL_LIFETIME_MS;
  const proposals = new Map<string, ProposalRecord>();
  const tokensByProposal = new Map<string, Map<number, string>>();

  function deleteProposal(proposalKey: string): void {
    const responderTokens = tokensByProposal.get(proposalKey);
    if (!responderTokens) {
      return;
    }

    for (const token of responderTokens.values()) {
      proposals.delete(token);
    }
    tokensByProposal.delete(proposalKey);
  }

  function revokeToken(token: string): void {
    const proposal = proposals.get(token);
    if (!proposal) {
      return;
    }

    proposals.delete(token);
    const responderTokens = tokensByProposal.get(proposal.proposalKey);
    if (!responderTokens) {
      return;
    }

    responderTokens.delete(proposal.responderTabId);
    if (responderTokens.size === 0) {
      tokensByProposal.delete(proposal.proposalKey);
    }
  }

  function removeExpired(now: number): void {
    const expiredTokens: Array<string> = [];
    for (const [token, proposal] of proposals) {
      if (proposal.expiresAt <= now) {
        expiredTokens.push(token);
      }
    }
    for (const token of expiredTokens) {
      revokeToken(token);
    }
  }

  return {
    clear() {
      proposals.clear();
      tokensByProposal.clear();
    },
    consume(input) {
      const now = dependencies.now();
      removeExpired(now);
      if (
        input.senderContext !== 'content-script' ||
        !Number.isSafeInteger(input.senderTabId) ||
        typeof input.token !== 'string'
      ) {
        return false;
      }

      const proposal = proposals.get(input.token);
      if (
        !proposal ||
        proposal.expiresAt <= now ||
        proposal.responderTabId !== input.senderTabId ||
        !claimsMatch(proposal, input)
      ) {
        return false;
      }

      deleteProposal(proposal.proposalKey);
      return true;
    },
    issue(input) {
      const now = dependencies.now();
      removeExpired(now);
      const proposalKey = getProposalKey(input);
      const responderTokens = tokensByProposal.get(proposalKey) ?? new Map<number, string>();
      tokensByProposal.set(proposalKey, responderTokens);
      const issuedTokens = new Map<number, string>();

      for (const responderTabId of new Set(input.responderTabIds)) {
        if (!Number.isSafeInteger(responderTabId)) {
          continue;
        }

        const previousToken = responderTokens.get(responderTabId);
        if (previousToken) {
          proposals.delete(previousToken);
        }

        const token = dependencies.createToken();
        responderTokens.set(responderTabId, token);
        proposals.set(token, {
          kind: input.kind,
          normalizedUrl: input.normalizedUrl,
          expectedRevision: input.expectedRevision,
          ...(input.suggestedTabId === undefined ? {} : { suggestedTabId: input.suggestedTabId }),
          expiresAt: now + lifetimeMs,
          proposalKey,
          responderTabId,
          token,
        });
        issuedTokens.set(responderTabId, token);
      }

      return issuedTokens;
    },
    revoke: revokeToken,
  };
}

export const suggestionProposalRegistry = createProposalRegistry({
  createToken: () => crypto.randomUUID(),
  now: () => Date.now(),
});
