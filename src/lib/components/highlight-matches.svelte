<script lang="ts">
  import { browser } from '$app/environment';
  import escapeStringRegexp from 'escape-string-regexp';

  let className: string;
  let highlightedEl: HTMLDivElement | null = null;

  export let match = '';
  export let value = '';
  export { className as class };

  /**
   * Safely convert a user's search query to a regular expression.
   * @see https://github.com/jaem1n207/lazy-dev/issues/65
   */
  const processSearchTerm = (searchTerm: string): RegExp => {
    const trimmedSearchTerm = searchTerm.trim();
    const searchWords = trimmedSearchTerm.split(/\s+/).filter(Boolean);

    if (searchWords.length > 0) {
      const escapedSearch = searchWords.map(escapeStringRegexp).join('|');
      return new RegExp(escapedSearch, 'ig');
    }

    return /$.^/gi;
  };

  /**
   * Generate search results, and highlight the parts that match your search terms.
   */
  const createSearchResult = (value: string, regexp: RegExp) => {
    const splitValue = value.split('');
    let index = 0;
    const content: (string | Node)[] = [];

    let result = regexp.exec(value);
    while (result) {
      if (result.index === regexp.lastIndex) {
        regexp.lastIndex++;
      } else {
        const before = splitValue.splice(0, result.index - index).join('');
        const matched = splitValue.splice(0, regexp.lastIndex - result.index).join('');
        content.push(before, `<span class="text-tertiary">${matched}</span>`);
        index = regexp.lastIndex;
      }

      result = regexp.exec(value);
    }

    return { content, remaining: splitValue.join('') };
  };

  $: {
    if (browser && value) {
      const regexp = processSearchTerm(match);
      const { content, remaining } = createSearchResult(value, regexp);

      if (highlightedEl) {
        highlightedEl.innerHTML = content.join('') + remaining;
      }
    }
  }
</script>

<div class={className} bind:this={highlightedEl}></div>
