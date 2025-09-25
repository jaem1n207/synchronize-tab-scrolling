import { ExtensionLogger } from '~/shared/lib/logger';

const logger = new ExtensionLogger({ scope: 'element-sync' });

export interface ElementSignature {
  tag: string;
  id?: string;
  className?: string;
  textContent?: string;
  depth: number;
  index: number;
}

interface ElementMap {
  headings: ElementSignature[];
  images: ElementSignature[];
  tables: ElementSignature[];
  sections: ElementSignature[];
}

// Analyze DOM structure and create element map
export function analyzePageStructure(): ElementMap {
  const elementMap: ElementMap = {
    headings: [],
    images: [],
    tables: [],
    sections: [],
  };

  // Find all headings (h1-h6)
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach((heading, index) => {
    elementMap.headings.push(createElementSignature(heading as HTMLElement, index));
  });

  // Find all images
  const images = document.querySelectorAll('img');
  images.forEach((img, index) => {
    elementMap.images.push(createElementSignature(img as HTMLElement, index));
  });

  // Find all tables
  const tables = document.querySelectorAll('table');
  tables.forEach((table, index) => {
    elementMap.tables.push(createElementSignature(table as HTMLElement, index));
  });

  // Find semantic sections
  const sections = document.querySelectorAll('section, article, main, aside');
  sections.forEach((section, index) => {
    elementMap.sections.push(createElementSignature(section as HTMLElement, index));
  });

  logger.info('Page structure analyzed', {
    headingsCount: elementMap.headings.length,
    imagesCount: elementMap.images.length,
    tablesCount: elementMap.tables.length,
    sectionsCount: elementMap.sections.length,
  });

  return elementMap;
}

// Create a signature for an element
function createElementSignature(element: HTMLElement, index: number): ElementSignature {
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: element.className || undefined,
    textContent: element.textContent?.slice(0, 100) || undefined, // First 100 chars
    depth: getElementDepth(element),
    index,
  };
}

// Get the depth of an element in the DOM tree
function getElementDepth(element: HTMLElement): number {
  let depth = 0;
  let current = element.parentElement;

  while (current && current !== document.body) {
    depth++;
    current = current.parentElement;
  }

  return depth;
}

// Find the closest matching element based on current scroll position
export function findClosestElement(scrollTop: number): ElementSignature | null {
  const elementMap = analyzePageStructure();
  const allElements = [
    ...elementMap.headings,
    ...elementMap.sections,
    ...elementMap.tables,
    ...elementMap.images,
  ];

  if (allElements.length === 0) {
    return null;
  }

  // Sort by vertical position
  const elementsWithPosition = allElements
    .map((sig) => {
      const element = findElementBySignature(sig);
      if (!element) return null;

      const rect = element.getBoundingClientRect();
      const absoluteTop = rect.top + window.pageYOffset;

      return {
        signature: sig,
        top: absoluteTop,
        distance: Math.abs(absoluteTop - scrollTop),
      };
    })
    .filter(Boolean) as Array<{
    signature: ElementSignature;
    top: number;
    distance: number;
  }>;

  // Find the element closest to current scroll position
  elementsWithPosition.sort((a, b) => a.distance - b.distance);

  return elementsWithPosition[0]?.signature || null;
}

// Find an element in the DOM by its signature
export function findElementBySignature(signature: ElementSignature): HTMLElement | null {
  // Try to find by ID first (most reliable)
  if (signature.id) {
    const element = document.getElementById(signature.id);
    if (element) return element as HTMLElement;
  }

  // Find by tag and index
  const elements = document.querySelectorAll(signature.tag);
  if (signature.index < elements.length) {
    const element = elements[signature.index] as HTMLElement;

    // Verify it's likely the same element by checking class or content
    if (signature.className && element.className === signature.className) {
      return element;
    }

    if (
      signature.textContent &&
      element.textContent?.startsWith(signature.textContent.slice(0, 50))
    ) {
      return element;
    }

    // If no additional checks, return the element at the same index
    return element;
  }

  return null;
}

// Calculate the target scroll position for a matching element
export function calculateElementBasedScrollPosition(sourceSignature: ElementSignature): number {
  // Find the matching element in the current page
  const targetElement = findMatchingElement(sourceSignature);

  if (!targetElement) {
    // Fallback to ratio-based if no matching element found
    logger.warn('No matching element found, falling back to ratio-based sync');
    return -1;
  }

  const rect = targetElement.getBoundingClientRect();
  const absoluteTop = rect.top + window.pageYOffset;

  // Add a small offset to position the element nicely in the viewport
  const viewportOffset = window.innerHeight * 0.1; // 10% from top of viewport

  return Math.max(0, absoluteTop - viewportOffset);
}

// Find a matching element in the current page based on signature from another page
function findMatchingElement(sourceSignature: ElementSignature): HTMLElement | null {
  // Strategy 1: Try to find by ID
  if (sourceSignature.id) {
    const element = document.getElementById(sourceSignature.id);
    if (element) {
      logger.info('Matched element by ID', { id: sourceSignature.id });
      return element as HTMLElement;
    }
  }

  // Strategy 2: Find by tag and similar content
  const candidates = document.querySelectorAll(sourceSignature.tag);

  if (sourceSignature.textContent) {
    // Look for elements with similar text content
    const sourceText = sourceSignature.textContent.toLowerCase().trim();

    for (const candidate of Array.from(candidates)) {
      const candidateText = (candidate as HTMLElement).textContent?.toLowerCase().trim();

      if (
        candidateText &&
        (candidateText === sourceText ||
          candidateText.includes(sourceText.slice(0, 30)) ||
          sourceText.includes(candidateText.slice(0, 30)))
      ) {
        logger.info('Matched element by content similarity');
        return candidate as HTMLElement;
      }
    }
  }

  // Strategy 3: Find by tag, class, and index
  if (sourceSignature.className) {
    const classElements = document.querySelectorAll(
      `${sourceSignature.tag}.${sourceSignature.className.split(' ')[0]}`,
    );

    if (sourceSignature.index < classElements.length) {
      logger.info('Matched element by class and index');
      return classElements[sourceSignature.index] as HTMLElement;
    }
  }

  // Strategy 4: Find by tag and similar position (index)
  if (sourceSignature.index < candidates.length) {
    logger.info('Matched element by tag and index');
    return candidates[sourceSignature.index] as HTMLElement;
  }

  return null;
}

// Export element signature to send to other tabs
export function exportCurrentElementContext(): {
  signature: ElementSignature | null;
  scrollTop: number;
  pageHeight: number;
} {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const closestElement = findClosestElement(scrollTop);

  return {
    signature: closestElement,
    scrollTop,
    pageHeight: document.documentElement.scrollHeight,
  };
}

// Apply element-based scroll position from another tab
export function applyElementBasedSync(sourceContext: {
  signature: ElementSignature | null;
  scrollTop: number;
  pageHeight: number;
}): boolean {
  if (!sourceContext.signature) {
    return false;
  }

  const targetPosition = calculateElementBasedScrollPosition(sourceContext.signature);

  if (targetPosition >= 0) {
    window.scrollTo({
      top: targetPosition,
      behavior: 'instant',
    });
    return true;
  }

  return false;
}
