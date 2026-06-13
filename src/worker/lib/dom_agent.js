// DOM-aware action generator for Janhit
// Produces a structured JSON action describing highlight/answer/fill/scroll/focus/click/none

function sanitizeText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function findBestElement(elements, needle) {
  if (!Array.isArray(elements) || !needle) return null;
  const key = needle.toLowerCase();
  const normalizedNeedle = key.replace(/^(the|a|an)\s+/, '');
  // Score candidates by label/name/text/includes order
  let best = null;
  let bestScore = 0;

  for (const el of elements) {
    const label = sanitizeText(el.label || el.name || el.text || '');
    const hay = (label + ' ' + (el.placeholder || '') + ' ' + (el.role || '')).toLowerCase();
    let score = 0;
    if (!hay) continue;
    if (hay === key) score += 10;
    if (hay.includes(key)) score += 6;
    if (normalizedNeedle && hay.includes(normalizedNeedle)) score += 8;
    // token matches
    const tokens = key.split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      if (hay.includes(t)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
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

/**
 * Generate DOM action JSON per user spec.
 * params: { transcript, language, page_url, page_title, dom_snapshot, interactive_elements, user_profile }
 */
export function generateDomAction(params) {
  const transcript = sanitizeText(params.transcript || '');
  const lang = sanitizeText(params.detected_language || params.language || 'en');
  const page = params.dom_snapshot || {};
  const interactive = Array.isArray(params.interactive_elements) ? params.interactive_elements : (page.elements || []);
  const profile = params.user_profile || {};

  const lower = transcript.toLowerCase();

  // Determine intent
  let action = 'none';
  if (/(highlight|show me|point to|where is|locate|find)/i.test(transcript)) action = 'highlight';
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
    const q = extractQuoted(transcript);
    if (q) return q;
    const stripped = transcript
      .replace(/^(can you|could you|please|hey|hi)\b/i, '')
      .replace(/\b(show me|point to|where is|where's|locate|find|highlight|focus on|click|open|go to)\b/i, '')
      .replace(/\b(the|a|an)\b/i, '')
      .replace(/\b(button|link|field|input|box|search|url|menu|tab)\b/i, '')
      .trim();
    return stripped || transcript.split(/[.,?]/)[0];
  })();

  // Helper to build selector preference
  function bestSelectorFor(el) {
    if (!el) return null;
    if (el.selector) return el.selector;
    if (el.id) return `#${el.id}`;
    if (el.name) return `[name="${el.name}"]`;
    return null;
  }

  // Answer question: summarize from page
  if (action === 'answer_question') {
    const title = sanitizeText(params.page_title || page.title || 'this page');
    const snippet = sanitizeText(page.visibleText || '').split('\n').map(s=>s.trim()).filter(Boolean).slice(0,6).join(' ');
    if (snippet) {
      result.spoken_text = snippet.length > 400 ? snippet.slice(0,400) : snippet;
    } else if (title) {
      result.spoken_text = `This page appears to be titled ${title}.`;
    } else {
      result.spoken_text = `I don't have enough visible information on this page to answer that.`;
    }
    result.action = 'answer_question';
    result.target_selector = null;
    result.scroll_first = false;
    result.follow_up = 'Want me to find or highlight something?';
    return result;
  }

  // For element-targeting actions, attempt to find best element
  const targetHint = (() => {
    if (isSearchRequest || isGeneralLocateRequest) {
      return elementHint;
    }

    const candidates = transcript.match(/(?:the\s)?([\w\s'-]{2,80})(?: button| link| field| input| section| area| form| box| search)?/i);
    if (candidates && candidates[1]) return candidates[1].trim();
    return elementHint;
  })();

  const best = findBestElement(interactive, targetHint || transcript);
  if (!best) {
    result.action = 'none';
    result.spoken_text = `I couldn’t find "${targetHint || transcript}" on this page.`;
    result.follow_up = 'Try the label or visible text.';
    return result;
  }

  const selector = bestSelectorFor(best) || best.selector || null;
  const offscreen = best.rect && (best.rect.y > (params.viewport?.height || 800) || best.rect.x > (params.viewport?.width || 1200));

  if (action === 'highlight') {
    result.action = 'highlight';
    result.spoken_text = `Found ${best.label || best.text || 'the element'}.`;
    result.target_selector = selector;
    result.scroll_first = !!offscreen;
    result.follow_up = 'Focus or click it?';
    return result;
  }

  if (action === 'scroll') {
    result.action = 'scroll';
    result.spoken_text = `Scrolling to ${best.label || best.text || 'the element'}.`;
    result.target_selector = selector;
    result.scroll_first = true;
    result.follow_up = null;
    return result;
  }

  if (action === 'focus') {
    result.action = 'focus';
    result.spoken_text = `Focusing ${best.label || best.placeholder || 'the input'}.`;
    result.target_selector = selector;
    result.scroll_first = !!offscreen;
    return result;
  }

  if (action === 'click') {
    // simple safety: allow only safe labelled actions unless explicit
    const dangerous = /(delete|remove|cancel|close|danger|destroy)/i;
    if (dangerous.test(best.label || best.text || '')) {
      result.action = 'none';
      result.spoken_text = `That looks destructive (${best.label || best.text}).`;
      result.follow_up = 'Click anyway?';
      return result;
    }

    result.action = 'click';
    result.spoken_text = `Clicking ${best.label || best.text || 'the element'}.`;
    result.target_selector = selector;
    result.scroll_first = !!offscreen;
    return result;
  }

  if (action === 'fill_form') {
    // Decide fills using profile and transcript
    const fills = [];
    // gather possible fills: email, phone, quoted text
    const email = extractEmail(transcript) || profile.email || null;
    const phone = extractPhone(transcript) || profile.phone || null;
    const quoted = extractQuoted(transcript);

    // Try to map best element if it's an input
    if (best && best.type && ['text','email','tel','textarea','search'].includes((best.type||'').toLowerCase())) {
      const value = email && best.type === 'email' ? email : (phone && best.type === 'tel' ? phone : (quoted || profile[best.name] || profile[best.label] || ''));
      if (value) {
        fills.push({ selector: selector, value: String(value), confidence: 0.9, reason: `Matched field ${best.label || best.name} from transcript/profile` });
      }
    }

    // If no fills but profile available, try mapping common names
    if (fills.length === 0 && profile) {
      const mapping = [
        { key: 'name', selMatch: ['name','full','your name'] },
        { key: 'email', selMatch: ['email','e-mail'] },
        { key: 'phone', selMatch: ['phone','mobile','contact'] },
      ];
      for (const m of mapping) {
        if (!profile[m.key]) continue;
        const candidate = interactive.find((el) => {
          const hay = ((el.label||'')+' '+(el.name||'')+' '+(el.placeholder||'')).toLowerCase();
          return m.selMatch.some(s => hay.includes(s));
        });
        if (candidate) {
          fills.push({ selector: bestSelectorFor(candidate) || candidate.selector || null, value: String(profile[m.key]), confidence: 0.95, reason: `From user_profile.${m.key}` });
        }
      }
    }

    if (fills.length === 0) {
      result.action = 'none';
      result.spoken_text = `I couldn’t determine the fill value.`;
      result.follow_up = 'Which field should I fill?';
      return result;
    }

    result.action = 'fill_form';
    result.spoken_text = `Ready to fill ${fills.length} field(s).`;
    result.fills = fills;
    result.target_selector = null;
    result.scroll_first = false;
    result.follow_up = 'Fill them now?';
    return result;
  }

  // fallback
  result.action = 'none';
  result.spoken_text = `I couldn’t map that to a page action.`;
  result.follow_up = 'Be more specific?';
  return result;
}

export default { generateDomAction };
