import { useState, useCallback, useEffect } from 'react';

import { sendMessage } from 'webext-bridge/popup';

import { extractDomainFromUrl, normalizeDomain } from '~/shared/lib/auto-sync-url-utils';
import { ExtensionLogger } from '~/shared/lib/logger';

const logger = new ExtensionLogger({ scope: 'popup' });

type DomainErrorKey = 'invalidDomain' | 'domainAlreadyExcluded';

interface AddDomainResult {
  success: boolean;
  domain?: string;
  error?: DomainErrorKey;
}

interface UseDomainExclusionsReturn {
  excludedDomains: Array<string>;
  addDomain: (input: string) => AddDomainResult;
  removeDomain: (domain: string) => void;
  isLoading: boolean;
}

export function useDomainExclusions(): UseDomainExclusionsReturn {
  const [excludedDomains, setExcludedDomains] = useState<Array<string>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    sendMessage('auto-sync:get-excluded-domains', {}, 'background')
      .then((response) => {
        if (response && Array.isArray(response.domains)) {
          setExcludedDomains(response.domains);
        }
      })
      .catch((err) => {
        logger.warn('[useDomainExclusions] Failed to load excluded domains:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const addDomain = useCallback(
    (input: string): AddDomainResult => {
      const trimmed = input.trim();
      if (!trimmed) {
        return { success: false, error: 'invalidDomain' };
      }

      let domain = extractDomainFromUrl(trimmed);

      if (!domain) {
        domain = extractDomainFromUrl(`https://${trimmed}`);
      }

      if (!domain) {
        return { success: false, error: 'invalidDomain' };
      }

      domain = normalizeDomain(domain);

      if (excludedDomains.includes(domain)) {
        return { success: false, error: 'domainAlreadyExcluded' };
      }

      const updatedDomains = [...excludedDomains, domain];
      setExcludedDomains(updatedDomains);

      sendMessage(
        'auto-sync:excluded-domains-changed',
        { domains: updatedDomains },
        'background',
      ).catch((err) => {
        logger.warn('[useDomainExclusions] Failed to sync excluded domains:', err);
      });

      return { success: true, domain };
    },
    [excludedDomains],
  );

  const removeDomain = useCallback(
    (domain: string) => {
      const updatedDomains = excludedDomains.filter((d) => d !== domain);
      setExcludedDomains(updatedDomains);

      sendMessage(
        'auto-sync:excluded-domains-changed',
        { domains: updatedDomains },
        'background',
      ).catch((err) => {
        logger.warn('[useDomainExclusions] Failed to sync excluded domains:', err);
      });
    },
    [excludedDomains],
  );

  return { excludedDomains, addDomain, removeDomain, isLoading };
}
