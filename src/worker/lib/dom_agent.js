// DOM-aware action generator for Janhit
// Produces a structured JSON action describing highlight/answer/fill/scroll/focus/click/none

function sanitizeText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function findBestElement(elements, needle) {
  if (!Array.isArray(elements) || !needle) return null;
  const key = needle.toLowerCase();
  const normalizedNeedle = key.replace(/^(the|a|an)\s+/, '');
  let best = null;
  let bestScore = 0;

  for (const el of elements) {
    const label = sanitizeText(el.label || el.name || el.text || el.placeholder || '');
    const hay = (label + ' ' + (el.placeholder || '') + ' ' + (el.role || '')).toLowerCase();
    if (!hay) continue;

    let score = 0;
    if (hay === key) score += 10;
    if (hay.includes(key)) score += 6;
    if (normalizedNeedle && hay.includes(normalizedNeedle)) score += 8;

    const tokens = key.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (hay.includes(token)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

function findFallbackElement(elements, transcript) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return null;
  }

  const lower = transcript.toLowerCase();
  const priorityTerms = ['search', 'url', 'link', 'submit', 'next', 'menu', 'open', 'login', 'sign in', 'search box', 'input', 'field'];

  for (const term of priorityTerms) {
    if (!lower.includes(term)) continue;
    const match = elements.find((element) => {
      const hay = sanitizeText(element.label || element.name || element.text || element.placeholder || '').toLowerCase();
      return hay.includes(term);
    });
    if (match) return match;
  }

  return elements.find((element) => {
    const hay = sanitizeText(element.label || element.name || element.text || element.placeholder || '').toLowerCase();
    return hay && (element.clickable === true || element.role === 'button' || element.role === 'link' || element.type === 'text' || element.type === 'search' || element.type === 'email');
  }) || null;
}

function extractQuoted(text) {
  const m = text.match(/"([^"]+)"|'([^']+)'/);
  return m ? (m[1] || m[2]) : null;
}

function extractEmail(text) {
  const m = text.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? m[1] : null;
}

function extractPhone(text) {
  const m = text.match(/(?:\+91[-\s]?)?[6-9]\d{9}\b/);
  return m ? m[0] : null;
}

export function generateDomAction(params) {
  const transcript = sanitizeText(params.transcript || '');
  const page = params.dom_snapshot || {};
  const interactive = Array.isArray(params.interactive_elements) ? params.interactive_elements : (page.elements || []);
  const profile = params.user_profile || {};

  let action = 'none';
  if (/(highlight|show me|point to|where is|where's|locate|find)/i.test(transcript)) action = 'highlight';
  else if (/(what|who|where|when|how|describe|tell me)/i.test(transcript) && !/(click|fill|type|enter|scroll|focus)/i.test(transcript)) action = 'answer_question';
  else if (/(fill|enter|type|set|populate|autofill)/i.test(transcript)) action = 'fill_form';
  else if (/(scroll|go to|bring me to)/i.test(transcript)) action = 'scroll';
  else if (/(focus|focus on|put cursor|focus the)/i.test(transcript)) action = 'focus';
  else if (/(click|press|tap|submit|open|next)/i.test(transcript)) action = 'click';

  const result = {
    spoken_text: '',
    action,
    target_selector: null,
    fills: [],
    scroll_first: false,
    follow_up: null,
  };

  const isSearchRequest = /(search|search for|search box|url|link|find url|where to search|where can i search|search input|search field)/i.test(transcript);
  const isGeneralLocateRequest = /(where is|where's|locate|find|show me|point to|highlight)/i.test(transcript);
  const elementHint = (() => {
    const quoted = extractQuoted(transcript);
    if (quoted) return quoted;
    const stripped = transcript
      .replace(/^(can you|could you|please|hey|hi)\b/i, '')
      .replace(/\b(show me|point to|where is|where's|locate|find|highlight|focus on|click|open|go to)\b/i, '')
      .replace(/\b(the|a|an)\b/i, '')
      .replace(/\b(button|link|field|input|box|search|url|menu|tab)\b/i, '')
      .trim();
    return stripped || transcript.split(/[.,?]/)[0];
  })();

  function bestSelectorFor(el) {
    if (!el) return null;
    if (el.selector) return el.selector;
    if (el.id) return `#${el.id}`;
    if (el.name) return `[name="${el.name}"]`;
    return null;
  }

  if (action === 'answer_question') {
    const title = sanitizeText(params.page_title || page.title || 'this page');
    const snippet = sanitizeText(page.visibleText || '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 6).join(' ');
    result.action = 'answer_question';
    result.target_selector = null;
    result.scroll_first = false;
    result.spoken_text = snippet || (title ? `This page appears to be titled ${title}.` : 'I do not have enough visible information on this page.');
    result.follow_up = 'Want me to find or highlight something?';
    return result;
  }

  const targetHint = (() => {
    if (isSearchRequest || isGeneralLocateRequest) return elementHint;
    const candidates = transcript.match(/(?:the\s)?([\w\s'-]{2,80})(?: button| link| field| input| section| area| form| box| search)?/i);
    return (candidates && candidates[1]) ? candidates[1].trim() : elementHint;
  })();

  const resolved = findBestElement(interactive, targetHint || transcript) || findFallbackElement(interactive, transcript);
  if (!resolved) {
    result.action = 'none';
    result.spoken_text = `I couldn’t find "${targetHint || transcript}" on this page.`;
    result.follow_up = 'Try the label or visible text.';
    return result;
  }

  const selector = bestSelectorFor(resolved) || resolved.selector || null;
  const offscreen = resolved.rect && (resolved.rect.y > (params.viewport?.height || 800) || resolved.rect.x > (params.viewport?.width || 1200));

  if (action === 'highlight') {
    result.action = 'highlight';
    result.spoken_text = `Found ${resolved.label || resolved.text || 'the element'}.`;
    result.target_selector = selector;
    result.scroll_first = !!offscreen;
    result.follow_up = 'Focus or click it?';
    return result;
  }

  if (action === 'scroll') {
    result.action = 'scroll';
    result.spoken_text = `Scrolling to ${resolved.label || resolved.text || 'the element'}.`;
    result.target_selector = selector;
    result.scroll_first = true;
    return result;
  }

  if (action === 'focus') {
    result.action = 'focus';
    result.spoken_text = `Focusing ${resolved.label || resolved.placeholder || 'the input'}.`;
    result.target_selector = selector;
    result.scroll_first = !!offscreen;
    return result;
  }

  if (action === 'click') {
    const dangerous = /(delete|remove|cancel|close|danger|destroy)/i;
    if (dangerous.test(resolved.label || resolved.text || '')) {
      result.action = 'none';
      result.spoken_text = `That looks destructive (${resolved.label || resolved.text}).`;
      result.follow_up = 'Click anyway?';
      return result;
    }

    result.action = 'click';
    result.spoken_text = `Clicking ${resolved.label || resolved.text || 'the element'}.`;
    result.target_selector = selector;
    result.scroll_first = !!offscreen;
    return result;
  }

  if (action === 'fill_form') {
    const fills = [];
    const email = extractEmail(transcript) || profile.email || null;
    const phone = extractPhone(transcript) || profile.phone || null;
    const quoted = extractQuoted(transcript);

    if (resolved.type && ['text', 'email', 'tel', 'textarea', 'search'].includes(String(resolved.type).toLowerCase())) {
      const value = email && String(resolved.type).toLowerCase() === 'email'
        ? email
        : (phone && String(resolved.type).toLowerCase() === 'tel' ? phone : (quoted || profile[resolved.name] || profile[resolved.label] || ''));
      if (value) {
        fills.push({ selector, value: String(value), confidence: 0.9, reason: `Matched field ${resolved.label || resolved.name} from transcript/profile` });
      }
    }

    if (fills.length === 0 && profile) {
      const mapping = [
        { key: 'name', selMatch: ['name', 'full', 'your name'] },
        { key: 'email', selMatch: ['email', 'e-mail'] },
        { key: 'phone', selMatch: ['phone', 'mobile', 'contact'] },
      ];
      for (const map of mapping) {
        if (!profile[map.key]) continue;
        const candidate = interactive.find((element) => {
          const hay = ((element.label || '') + ' ' + (element.name || '') + ' ' + (element.placeholder || '')).toLowerCase();
          return map.selMatch.some((term) => hay.includes(term));
        });
        if (candidate) {
          fills.push({ selector: bestSelectorFor(candidate) || candidate.selector || null, value: String(profile[map.key]), confidence: 0.95, reason: `From user_profile.${map.key}` });
        }
      }
    }

    if (fills.length === 0) {
      result.action = 'none';
      result.spoken_text = 'I couldn’t determine the fill value.';
      result.follow_up = 'Which field should I fill?';
      return result;
    }

    result.action = 'fill_form';
    result.spoken_text = `Ready to fill ${fills.length} field(s).`;
    result.fills = fills;
    result.follow_up = 'Fill them now?';
    return result;
  }

  result.action = 'highlight';
  result.spoken_text = `Found ${resolved.label || resolved.text || 'the element'}.`;
  result.target_selector = selector;
  result.scroll_first = !!offscreen;
  result.follow_up = 'Focus or click it?';
  return result;
}

export default { generateDomAction };
